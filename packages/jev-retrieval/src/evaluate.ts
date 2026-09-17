declare const Bun: { file(path: string): { text(): Promise<string> } };
import { FixtureProvider } from "./providers";
import { retrieve } from "./core";
import { JEV_COST_ASSUMPTION } from "./typesafe";
import type { Edge, ExperimentMode, JevJudge, Memory } from "./types";

export interface Dataset {
  memories: Memory[];
  edges: Edge[];
  queries: { id: string; query: string; tenantId: string; relevant: string[]; stale?: string[] }[];
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const averageRank = (ids: string[], relevant: Set<string>) => ids.reduce((sum, id, index) => sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0);

export async function evaluate(path: string, mode: ExperimentMode, judge?: JevJudge, topK = 10) {
  const dataset = JSON.parse(await Bun.file(path).text()) as Dataset;
  const provider = new FixtureProvider(dataset.memories, dataset.edges);
  const rows = [];
  for (const query of dataset.queries) {
    const result = await retrieve({
      mode, query: query.query, tenantId: query.tenantId,
      candidateProvider: provider, graphProvider: provider, judge,
      now: "2026-01-01T00:00:00Z", limits: { topK },
    });
    const ranked = result.ranked.map((memory) => memory.id);
    const selected = result.memories.map((memory) => memory.id);
    const relevant = new Set(query.relevant);
    const relevantInRanked = ranked.filter((id) => relevant.has(id)).length;
    const relevantInContext = selected.filter((id) => relevant.has(id)).length;
    const ideal = Array.from({ length: Math.min(relevant.size, topK) }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
    const staleCount = selected.filter((id) => query.stale?.includes(id)).length;
    rows.push({
      id: query.id, k: topK, rankedIds: ranked, selectedIds: selected,
      recallAtK: relevant.size ? relevantInRanked / relevant.size : null,
      ndcgAtK: relevant.size ? (ideal ? averageRank(ranked, relevant) / ideal : 0) : null,
      evidenceCoverage: relevant.size ? relevantInContext / relevant.size : null,
      staleMemoryCount: staleCount,
      staleInclusion: selected.length ? staleCount / selected.length : 0,
      ...result.trace,
    });
  }
  const labeled = rows.filter((row) => row.recallAtK !== null);
  return {
    mode, k: topK, queries: rows,
    summary: {
      recallAtK: mean(labeled.map((row) => row.recallAtK!)),
      ndcgAtK: mean(labeled.map((row) => row.ndcgAtK!)),
      evidenceCoverage: mean(labeled.flatMap((row) => row.evidenceCoverage === null ? [] : [row.evidenceCoverage])),
      staleInclusion: mean(rows.map((row) => row.staleInclusion)),
      staleMemoryCount: rows.reduce((sum, row) => sum + row.staleMemoryCount, 0),
      p50Ms: percentile(rows.map((row) => row.latencyMs), 0.5),
      p95Ms: percentile(rows.map((row) => row.latencyMs), 0.95),
      graphReads: rows.reduce((sum, row) => sum + row.graphReads, 0),
      candidateCount: rows.reduce((sum, row) => sum + row.candidateCount, 0),
      typeSafeRequests: rows.reduce((sum, row) => sum + row.typeSafeRequests, 0),
      fallbackRate: mean(rows.map((row) => row.fallback ? 1 : 0)),
      usage: rows.reduce((total, row) => ({
        inputTokens: total.inputTokens + (row.usage.inputTokens ?? 0),
        outputTokens: total.outputTokens + (row.usage.outputTokens ?? 0),
        estimatedCostUsd: total.estimatedCostUsd + (row.usage.estimatedCostUsd ?? 0),
        model: row.usage.model ?? total.model,
      }), { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, model: undefined as string | undefined }),
      costAssumption: JEV_COST_ASSUMPTION,
    },
  };
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}
