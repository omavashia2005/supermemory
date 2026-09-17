import { mkdir } from "node:fs/promises";
declare const Bun: { file(path: string): { text(): Promise<string> }; write(path: string, data: string): Promise<number> };
declare const process: { cwd(): string };
import { FixtureProvider } from "./providers";
import { retrieve } from "./core";
import type { Edge, ExperimentMode, JevJudge, Memory } from "./types";

export interface LongMemEvalMessage { role: string; content: string }
export interface LongMemEvalRecord {
  question_id: string;
  question_type?: string;
  question: string;
  answer: string;
  question_date?: string;
  haystack_dates?: string[];
  haystack_session_ids?: string[];
  haystack_sessions: LongMemEvalMessage[][];
  answer_session_ids?: string[];
}

export interface LongMemEvalOptions {
  datasetPath: string;
  outputDirectory: string;
  modes: ExperimentMode[];
  judge?: JevJudge;
  limit?: number;
  contextTokens?: number;
  initialCandidates?: number;
}

const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
const overlap = (query: string, text: string) => {
  const queryWords = words(query);
  if (queryWords.size === 0) return 0;
  const textWords = words(text);
  let matches = 0;
  for (const word of queryWords) if (textWords.has(word)) matches++;
  return matches / queryWords.size;
};

export function adaptLongMemEval(record: LongMemEvalRecord): { memories: Memory[]; edges: Edge[]; relevant: string[] } {
  if (!record.question_id || !record.question || !Array.isArray(record.haystack_sessions)) throw new Error("Malformed LongMemEval record");
  const ids = record.haystack_session_ids ?? record.haystack_sessions.map((_, index) => `session-${index}`);
  if (ids.length !== record.haystack_sessions.length) throw new Error(`Session ID mismatch for ${record.question_id}`);
  const memories = record.haystack_sessions.map((messages, index) => {
    if (!Array.isArray(messages)) throw new Error(`Malformed session ${index} for ${record.question_id}`);
    const text = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
    return {
      id: ids[index]!, tenantId: record.question_id, text,
      source: { documentId: record.question_id, chunkId: ids[index]! },
      createdAt: record.haystack_dates?.[index] ?? new Date(0).toISOString(),
      initialScore: overlap(record.question, text),
    };
  });
  const edges: Edge[] = [];
  for (let index = 1; index < ids.length; index++) {
    edges.push({ from: ids[index - 1]!, to: ids[index]!, relation: "next-session" });
    edges.push({ from: ids[index]!, to: ids[index - 1]!, relation: "previous-session" });
  }
  return { memories, edges, relevant: record.answer_session_ids ?? [] };
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
};

export async function runLongMemEval(options: LongMemEvalOptions) {
  const parsed = JSON.parse(await Bun.file(options.datasetPath).text());
  if (!Array.isArray(parsed)) throw new Error("LongMemEval dataset must be a JSON array");
  const records = (parsed as LongMemEvalRecord[]).slice(0, options.limit);
  await mkdir(options.outputDirectory, { recursive: true });
  const reports = [];
  for (const mode of options.modes) {
    if (mode !== "baseline" && !options.judge) throw new Error(`${mode} requires a JevJudge`);
    const rows = [];
    for (const record of records) {
      const fixture = adaptLongMemEval(record);
      const candidates = [...fixture.memories].sort((a, b) => b.initialScore - a.initialScore || a.id.localeCompare(b.id));
      const provider = new FixtureProvider(candidates, fixture.edges);
      const result = await retrieve({
        mode, query: record.question, tenantId: record.question_id,
        candidateProvider: provider, graphProvider: provider, judge: options.judge,
        now: record.question_date ?? "9999-12-31T23:59:59.999Z",
        limits: { contextTokens: options.contextTokens ?? 8_000, initialCandidates: options.initialCandidates ?? 20 },
      });
      const selected = result.memories.map((memory) => memory.id);
      const relevant = new Set(fixture.relevant);
      const hits = selected.filter((id) => relevant.has(id));
      const recallAtK = relevant.size ? hits.length / relevant.size : null;
      const dcg = selected.reduce((sum, id, index) => sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
      const ideal = [...relevant].slice(0, selected.length).reduce((sum, _, index) => sum + 1 / Math.log2(index + 2), 0);
      rows.push({ questionId: record.question_id, questionType: record.question_type, selectedSessionIds: selected, relevantSessionIds: [...relevant], recallAtK, ndcgAtK: relevant.size ? (ideal ? dcg / ideal : 0) : null, ...result.trace });
    }
    const scored = rows.filter((row) => row.recallAtK !== null);
    const report = {
      benchmark: "LongMemEval retrieval prototype", mode, datasetPath: options.datasetPath,
      questionCount: rows.length, labeledRetrievalCount: scored.length,
      summary: {
        recallAtK: mean(scored.map((row) => row.recallAtK!)), ndcgAtK: mean(scored.map((row) => row.ndcgAtK!)),
        p50Ms: percentile(rows.map((row) => row.latencyMs), 0.5), p95Ms: percentile(rows.map((row) => row.latencyMs), 0.95),
        graphReads: rows.reduce((sum, row) => sum + row.graphReads, 0),
        candidateCount: rows.reduce((sum, row) => sum + row.candidateCount, 0),
        typeSafeRequests: rows.reduce((sum, row) => sum + row.typeSafeRequests, 0),
        fallbackRate: mean(rows.map((row) => row.fallback ? 1 : 0)),
        usage: rows.reduce((usage, row) => ({ inputTokens: usage.inputTokens + (row.usage.inputTokens ?? 0), outputTokens: usage.outputTokens + (row.usage.outputTokens ?? 0), costUsd: usage.costUsd + (row.usage.costUsd ?? 0) }), { inputTokens: 0, outputTokens: 0, costUsd: 0 }),
      }, rows,
    };
    await Bun.write(`${options.outputDirectory}/${mode}.json`, `${JSON.stringify(report, null, 2)}\n`);
    reports.push(report);
  }
  return reports;
}

export async function loadJudge(modulePath: string): Promise<JevJudge> {
  const absolute = modulePath.startsWith("/") ? modulePath : `${process.cwd()}/${modulePath}`;
  const module = await import(absolute);
  if (!module.judge || typeof module.judge.judge !== "function") throw new Error("Judge module must export `judge: JevJudge`");
  return module.judge as JevJudge;
}
