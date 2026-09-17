import type { CandidateProvider, ExperimentMode, GraphProvider, JudgeResult, JevJudge, Judgment, Limits, Memory, RetrievalResult, Trace, Usage } from "./types";

export const DEFAULT_LIMITS: Limits = { initialCandidates: 8, maxCandidates: 20, topK: 10, maxHops: 2, maxGraphReads: 20, maxTypeSafeRequests: 4, maxInputTokens: 12_000, contextTokens: 700, timeoutMs: 8_000, retries: 2 };

// ponytail: chars/4 is an approximate token ceiling; use the SDK tokenizer if exact counts become available.
const tokens = (value: string) => Math.ceil(value.length / 4);
const current = (memory: Memory, tenantId: string, now: string) => {
  if (memory.tenantId !== tenantId || memory.supersededBy) return false;
  const nowMs = Date.parse(now);
  const createdMs = Date.parse(memory.createdAt);
  const expiresMs = memory.expiresAt ? Date.parse(memory.expiresAt) : Number.NaN;
  return !(Number.isFinite(nowMs) && Number.isFinite(createdMs) && createdMs > nowMs)
    && !(Number.isFinite(nowMs) && Number.isFinite(expiresMs) && expiresMs <= nowMs);
};

export const baselineRank = (memories: Memory[]) => [...memories].sort((a, b) => b.initialScore - a.initialScore || a.id.localeCompare(b.id));
export const baselineExpand = (edges: { to: string }[]) => [...edges].sort((a, b) => a.to.localeCompare(b.to));

function unique(memories: Memory[]) {
  const seen = new Set<string>();
  return memories.filter((memory) => !seen.has(memory.id) && !!seen.add(memory.id));
}

function valid(result: JudgeResult, allowed: Set<string>): Judgment[] {
  if (!result || !Array.isArray(result.judgments) || result.judgments.length !== allowed.size) throw new Error("malformed or incomplete judgment");
  const seen = new Set<string>();
  return result.judgments.map((judgment) => {
    if (!allowed.has(judgment.id) || seen.has(judgment.id) || !Number.isFinite(judgment.score) || judgment.score < 0 || judgment.score > 1 || (judgment.rationale !== undefined && typeof judgment.rationale !== "string") || (judgment.expand !== undefined && typeof judgment.expand !== "boolean")) throw new Error("malformed judgment");
    seen.add(judgment.id);
    return judgment;
  });
}

function addUsage(trace: Trace, usage?: Usage) {
  if (!usage) return;
  trace.usage = {
    inputTokens: (trace.usage.inputTokens ?? 0) + (usage.inputTokens ?? 0),
    outputTokens: (trace.usage.outputTokens ?? 0) + (usage.outputTokens ?? 0),
    estimatedCostUsd: (trace.usage.estimatedCostUsd ?? 0) + (usage.estimatedCostUsd ?? 0),
    model: usage.model ?? trace.usage.model,
  };
}

async function call(judge: JevJudge, input: Parameters<JevJudge["judge"]>[0], allowed: Set<string>, limits: Limits, trace: Trace) {
  if (tokens(JSON.stringify(input)) > limits.maxInputTokens) throw new Error("estimated TypeSafe input token limit");
  let last: unknown;
  for (let attempt = 0; attempt <= limits.retries; attempt++) {
    if (trace.typeSafeRequests >= limits.maxTypeSafeRequests) throw new Error("TypeSafe request limit");
    trace.typeSafeRequests++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`TypeSafe timeout after ${limits.timeoutMs}ms`));
      }, limits.timeoutMs);
    });
    try {
      const result = await Promise.race([judge.judge({ ...input, signal: controller.signal }), timeout]);
      return { result, judgments: valid(result, allowed) };
    } catch (error) {
      last = error;
    } finally {
      clearTimeout(timer!);
    }
  }
  throw last;
}

function candidateBatches(input: Parameters<JevJudge["judge"]>[0], budget: number) {
  const batches: Memory[][] = [];
  let batch: Memory[] = [];
  for (const candidate of input.candidates) {
    const next = [...batch, candidate];
    if (tokens(JSON.stringify({ ...input, candidates: next })) <= budget) {
      batch = next;
      continue;
    }
    if (batch.length) batches.push(batch);
    batch = [candidate];
    if (tokens(JSON.stringify({ ...input, candidates: batch })) > budget) throw new Error(`candidate ${candidate.id} exceeds estimated TypeSafe input token limit`);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

async function judgeCandidates(judge: JevJudge, input: Parameters<JevJudge["judge"]>[0], limits: Limits, trace: Trace) {
  const judgments: Judgment[] = [];
  for (const candidates of candidateBatches(input, limits.maxInputTokens)) {
    const allowed = new Set(candidates.map((candidate) => candidate.id));
    const { result, judgments: batch } = await call(judge, { ...input, candidates }, allowed, limits, trace);
    addUsage(trace, result.usage);
    judgments.push(...batch);
  }
  return judgments;
}

function select(memories: Memory[], budget: number) {
  const selected: Memory[] = [];
  let used = 0;
  for (const memory of memories) {
    const size = tokens(memory.text);
    if (used + size > budget) continue;
    selected.push(memory);
    used += size;
  }
  return selected;
}

function fallback(trace: Trace, reason: string) {
  trace.fallback = true;
  trace.fallbackReasons.push(reason);
}

export async function retrieve(args: { mode: ExperimentMode; query: string; tenantId: string; candidateProvider: CandidateProvider; graphProvider: GraphProvider; judge?: JevJudge; limits?: Partial<Limits>; now?: string }): Promise<RetrievalResult> {
  const started = performance.now();
  const limits = { ...DEFAULT_LIMITS, ...args.limits };
  const trace: Trace = { graphReads: 0, candidateCount: 0, typeSafeRequests: 0, usage: {}, fallback: false, fallbackReasons: [], latencyMs: 0 };
  const now = args.now ?? new Date().toISOString();
  if (args.mode !== "baseline" && !args.judge) fallback(trace, "no Jev judge configured; baseline policy used");

  let all = unique((await args.candidateProvider.candidates(args.query, args.tenantId, limits.initialCandidates))
    .filter((memory) => current(memory, args.tenantId, now))).slice(0, limits.maxCandidates);
  const jevExpand = args.mode === "graph-traversal-only" || args.mode === "reranker-and-traversal";
  let frontier = [...all];
  const visited = new Set(all.map((memory) => memory.id));

  for (let hop = 0; hop < limits.maxHops && frontier.length && all.length < limits.maxCandidates; hop++) {
    const batches: Memory[][] = [];
    for (const source of frontier) {
      if (trace.graphReads >= limits.maxGraphReads) break;
      try {
        trace.graphReads++;
        const edges = baselineExpand((await args.graphProvider.neighbors(source.id, args.tenantId)).filter((edge) => edge.from === source.id));
        const ids = [...new Set(edges.map((edge) => edge.to).filter((id) => !visited.has(id)))];
        if (!ids.length || trace.graphReads >= limits.maxGraphReads) continue;
        trace.graphReads++;
        const targets = await args.graphProvider.get(ids, args.tenantId);
        for (const id of ids) visited.add(id);
        batches.push(unique(targets.filter((memory) => current(memory, args.tenantId, now))));
      } catch (error) {
        fallback(trace, `graph: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let next = unique(batches.flat());
    if (jevExpand && next.length && args.judge) {
      try {
        const judgments = await judgeCandidates(args.judge, { purpose: "expand", query: args.query, candidates: next, criteria: "Score how useful each available relationship target is for answering the query. Expand targets scoring at least 0.5.", signal: new AbortController().signal }, limits, trace);
        const expand = new Set(judgments.filter((judgment) => judgment.expand ?? judgment.score >= 0.5).map((judgment) => judgment.id));
        next = next.filter((memory) => expand.has(memory.id));
      } catch (error) {
        fallback(trace, `expand: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    next = next.slice(0, limits.maxCandidates - all.length);
    for (const memory of next) visited.add(memory.id);
    all.push(...next);
    frontier = next;
  }

  trace.candidateCount = all.length;
  let ranked = baselineRank(all);
  const jevRank = args.mode === "reranker-only" || args.mode === "reranker-and-traversal";
  if (jevRank && all.length && args.judge) {
    try {
      const judgments = await judgeCandidates(args.judge, { purpose: "rank", query: args.query, candidates: all, criteria: "Score how strongly each memory contains evidence that answers the query. Prefer direct, current evidence; use historical evidence when the query asks about the past.", signal: new AbortController().signal }, limits, trace);
      const scores = new Map(judgments.map((judgment) => [judgment.id, judgment.score]));
      ranked = [...all].sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || b.initialScore - a.initialScore || a.id.localeCompare(b.id));
    } catch (error) {
      fallback(trace, `rank: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const topK = ranked.slice(0, limits.topK);
  const memories = select(topK, limits.contextTokens);
  trace.latencyMs = performance.now() - started;
  return { ranked: topK, memories, context: memories.map((memory) => `[${memory.id}; document=${memory.source.documentId}; chunk=${memory.source.chunkId}]\n${memory.text}`).join("\n\n"), trace };
}
