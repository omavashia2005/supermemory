# TypeSafe Jev retrieval prototype ablations

## Scope and repository finding

Pinned repository commit: `814f927`. This fork does **not** contain the server retrieval engine. Self-hosting downloads `supermemory-server`; `packages/memory-graph` renders API-provided graph data. Consequently these are isolated, opt-in **prototype ablations**, not changes to Supermemory candidate generation, proprietary graph traversal, or reranking.

`SupermemorySearchProvider` uses only documented `POST /v4/search` as an initial candidate provider. That response has no graph adjacency API, so `NoGraphProvider` is required for API-backed runs. The wrapper cannot disable or replace hidden server-side expansion/reranking, and API-backed results cannot establish a clean native-engine ablation. Fixture runs provide the controlled comparison.

## Reproducible baseline and invariants

All modes share the same dataset, queries, initial candidate provider, graph provider, limits, tenant filter, time, and context selection. The prototype baseline uses provider similarity descending (ID ascending ties), deterministic breadth-first relationship expansion (target ID ascending), and greedy whole-memory context selection. This is explicitly **not** Supermemory's proprietary implementation.

Each memory retains immutable source document/chunk provenance and text. Code enforces tenant equality, known expiration/supersession, de-duplication, cycle detection, hop/read/candidate/request/time/token/context bounds. Jev sees only candidates already returned or relationship targets read by code; it cannot retrieve or select unseen memories. Rationales are inferred judgments; memory text and metadata are observed fixture/API facts.

Modes:
- `reranker-only`: baseline expansion, Jev final ranking.
- `graph-traversal-only`: Jev-guided bounded frontier selection, baseline ranking.
- `reranker-and-traversal`: both; each frontier is batched and ranking occurs only after expansion adds evidence.

On timeout, rate/service error, malformed output, or exhausted request limit, bounded retries end in the documented baseline fallback. `trace.fallback` and `fallbackReasons` prevent silent contamination.

## TypeSafe status

The exact required installer was attempted, but this environment returned HTTP 403. The three documentation URLs, GitHub skill, and npm package were also blocked. Therefore the current SDK API, model identifiers, limits, response types, pricing, and license could not be verified. `TypeSafeSdkJudge` is intentionally an injected adapter boundary: callers supply a function implemented with the **official `@typesafe-ai/sdk`**, after consulting current docs. It does not issue guessed HTTP calls. Live verification is deliberately blocked rather than falsely claimed. Re-run the installer and replace `skills/typesafe-ai` placeholders before live use.

`TYPESAFE_API_KEY` is the only TypeSafe credential name. Never print or commit it. `SUPERMEMORY_API_KEY` and optional API base URL are for an application-created Supermemory adapter runner.

## Commands

```sh
bun test packages/jev-retrieval
bunx tsc -p packages/jev-retrieval/tsconfig.json --noEmit
bun packages/jev-retrieval/src/cli.ts baseline packages/jev-retrieval/fixtures/dataset.json
bun packages/jev-retrieval/src/cli.ts reranker-only packages/jev-retrieval/fixtures/dataset.json
bun packages/jev-retrieval/src/cli.ts graph-traversal-only packages/jev-retrieval/fixtures/dataset.json
bun packages/jev-retrieval/src/cli.ts reranker-and-traversal packages/jev-retrieval/fixtures/dataset.json
```

A user dataset uses the same JSON shape as `fixtures/dataset.json`. Reports include recall@k, nDCG@k, evidence coverage, stale inclusion, p50/p95 end-to-end latency, graph reads, candidates, TypeSafe requests, fallback rate, and SDK-reported token/cost usage. Estimated cost is intentionally omitted until verified pricing is supplied; no benchmark numbers are checked into docs. Timing from tiny fixtures is tooling validation, not a performance claim.

## LongMemEval benchmark

This harness evaluates **retrieval of answer-bearing sessions**, not LongMemEval answer generation or the official end-to-end judge score. It consumes the official cleaned JSON array fields (`question_id`, `question`, `question_date`, `haystack_sessions`, `haystack_session_ids`, `haystack_dates`, and, when present, `answer_session_ids`). Each session remains one provenance-bearing candidate; adjacent chronological sessions receive deterministic bidirectional fixture edges. Initial candidate scores use the same deterministic token-overlap policy in every mode. No LongMemEval result files or scores are committed.

1. Download an official LongMemEval cleaned JSON file from the LongMemEval project and leave it outside Git, for example at `$HOME/datasets/longmemeval_s_cleaned.json`.
2. Install the TypeSafe skill and dependencies after network access is restored, verify the current SDK/model against the official documentation, and set `TYPESAFE_API_KEY` without printing it.
3. Create a local, uncommitted TypeScript module that exports `judge: JevJudge`, backed by the official `@typesafe-ai/sdk`. The explicit module boundary prevents this repository from guessing an SDK method or model identifier while its documentation is inaccessible.
4. Run a small smoke benchmark, then the full comparison:

```sh
# Baseline smoke test (does not require TypeSafe)
bun packages/jev-retrieval/src/longmemeval-cli.ts \
  --dataset "$HOME/datasets/longmemeval_s_cleaned.json" \
  --output ./longmemeval-results/smoke --modes baseline --limit 10

# All three experiments plus the shared baseline
bun packages/jev-retrieval/src/longmemeval-cli.ts \
  --dataset "$HOME/datasets/longmemeval_s_cleaned.json" \
  --output ./longmemeval-results/full \
  --modes baseline,reranker-only,graph-traversal-only,reranker-and-traversal \
  --judge-module "$HOME/private/typesafe-judge.ts"
```

The command writes one report per mode (`baseline.json`, `reranker-only.json`, `graph-traversal-only.json`, and `reranker-and-traversal.json`). Each includes per-question selected/relevant session IDs, recall@k, nDCG@k, latency, candidates, graph reads, TypeSafe requests, usage, and fallback details, plus aggregates. Questions without `answer_session_ids` remain in operational metrics but are excluded from labeled recall/nDCG. Treat nonzero fallback rates as contaminated experimental runs, and use SDK-reported cost only; the harness does not invent pricing estimates.
