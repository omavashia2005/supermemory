# TypeSafe Jev retrieval experiments

## Scope

The public fork pinned for this work is `814f927`. It does not include Supermemory's server-side candidate generation, traversal, or reranking implementation; self-hosting downloads the compiled server. `packages/memory-graph` visualizes API-provided graph data. This package is an opt-in retrieval prototype, not a modification or replacement of the native engine.

`SupermemorySearchProvider` calls only the documented `POST /v4/search` endpoint for initial candidates. The API does not expose graph adjacency and does not disable hidden server retrieval behavior, so `NoGraphProvider` is used for API-backed runs. Treat native API results as an external search baseline, not as a clean internal-engine ablation.

## Shared baseline and experiments

Every mode uses the same query, candidate provider, initial candidate limit, graph provider, tenant, as-of time, top-k, and context-token budget. The fixture/LongMemEval baseline ranks provider similarity descending with ID-ascending ties, expands available edges breadth-first in target-ID order, and selects whole memories under the context budget. This deterministic policy is not Supermemory's proprietary baseline.

All three Jev experiments and the shared baseline live in this package and branch:

| Mode | Changed component |
| --- | --- |
| `baseline` | Deterministic baseline rank and expansion |
| `reranker-only` | Jev Score ranking; baseline expansion |
| `graph-traversal-only` | Jev chooses among code-read relationship targets; baseline ranking |
| `reranker-and-traversal` | Both Jev stages; one batched expansion judgment per shared frontier, then final ranking |

Jev only sees candidates already returned by the provider or read as relationship targets. Code owns tenant checks, deduplication, as-of/expiration/supersession rules, cycle detection, graph reads, hops, candidate counts, input/context budgets, and request bounds. Context always retains the original text and source document/chunk IDs.

On service errors, malformed or incomplete judgments, timeouts, and exhausted budgets, the affected stage falls back to its deterministic baseline behavior. Every fallback is reported. Runs without a configured judge are explicitly marked as baseline fallbacks; they are not Jev results. Input-token bounds use a documented chars/4 estimate, not a tokenizer guarantee.

## TypeSafe setup

The TypeSafe skill is installed for this checkout at `.agents/skills/typesafe-ai`. The official JavaScript SDK is installed and locked as `@typesafe-ai/sdk` 0.6.0. The bundled [SDK runner](examples/typesafe-judge.ts) uses `TypeSafeClient.systemOne`, batches one typed `Score` question per candidate over shared query/candidate state, and pins `jev-1.13.0`. Score's 0-to-2 result is normalized to 0-to-1; expansion keeps scores at least 0.5. The SDK's internal retry is disabled so harness request/retry limits remain observable.

The official docs currently list `jev-1.13.0` and aliases `jev-latest`/`jev-preview`; the aliases can move. The bundled runner pins the versioned model. The docs list Jev input at $0.042 per million tokens and output as free; reports include actual SDK token usage and an estimated cost using those assumptions. Confirm pricing and account limits before a long live run: the published rate limits are explicitly subject to change. See the [JavaScript SDK docs](https://docs.typesafe.ai/sdk/javascript.md), [models and pricing](https://docs.typesafe.ai/models.md), and [reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md).

Put live credentials in the repository-root `.env.local` file, ignored by Git:

```sh
TYPESAFE_API_KEY=your_typesafe_key
SUPERMEMORY_API_KEY=your_supermemory_key
```

`TYPESAFE_API_KEY` is required by the bundled Jev runner. `SUPERMEMORY_API_KEY` is only for an application-created runner using `SupermemorySearchProvider`; pass its API base URL and key to the provider. The fixture tests and baseline CLI need no keys. No credentials are stored in this repository.

## Fixture evaluation

```sh
bun install --filter '@supermemory/jev-retrieval'
bun test packages/jev-retrieval
./node_modules/.bin/tsc -p packages/jev-retrieval/tsconfig.json --noEmit

# Run the baseline and all three Jev modes on the same labeled fixture.
bun --env-file=.env.local packages/jev-retrieval/src/cli.ts \
  baseline,reranker-only,graph-traversal-only,reranker-and-traversal \
  packages/jev-retrieval/fixtures/dataset.json --k 10 \
  --judge-module packages/jev-retrieval/examples/typesafe-judge.ts
```

For live calls, prefix the command with `bun --env-file=.env.local`; for example, `bun --env-file=.env.local packages/jev-retrieval/src/cli.ts ...`. Without `--judge-module`, Jev modes are still marked as fallbacks and must not be interpreted as experiment results. Offline tests use an injected mock runner. To make one live SDK call, run `TYPESAFE_LIVE_TEST=1 bun --env-file=.env.local test packages/jev-retrieval/test/live.test.ts`.

## LongMemEval

The runner consumes the cleaned LongMemEval JSON array fields (`question_id`, `question`, `question_date`, `haystack_sessions`, session IDs/dates, and optional `answer_session_ids`). It retrieves answer-bearing sessions; it does not run answer generation or the benchmark's end-to-end answer judge. Since LongMemEval has no graph labels, the adapter creates synthetic edges between adjacent dated sessions; graph-mode results test bounded traversal behavior, not ground-truth relationship quality. Future sessions are excluded at each question date, and reports include temporal-leakage counts. LongMemEval has no stale/supersession labels, so `staleMemoryInclusion` is reported as unavailable there; the labeled fixture reports stale inclusion.

Download the official cleaned dataset from the [LongMemEval project](https://github.com/xiaowu0162/LongMemEval) and keep it outside Git. Start with a smoke run, then run all four modes against the identical dataset and configuration:

```sh
bun --env-file=.env.local packages/jev-retrieval/src/longmemeval-cli.ts \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --output ./longmemeval-results/smoke --modes baseline --limit 10 --k 10

bun --env-file=.env.local packages/jev-retrieval/src/longmemeval-cli.ts \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --output ./longmemeval-results/full \
  --modes baseline,reranker-only,graph-traversal-only,reranker-and-traversal \
  --judge-module packages/jev-retrieval/examples/typesafe-judge.ts --k 10 \
  --max-typesafe-requests 32
```

Candidate judgments are greedily split into requests within the shared 12,000-token chars/4 input estimate; original session text and provenance remain unchanged. Set the same `--max-typesafe-requests` cap for every mode (32 allows the 20 candidates to be scored in batches plus bounded expansion calls). Reports include configured limits and per-question ranked/context-selected session IDs, recall@k, nDCG@k, evidence coverage, p50/p95 retrieval latency, graph reads, candidates, actual TypeSafe requests and token usage, estimated cost, and fallback rate. Results are written locally under the ignored `longmemeval-results/` directory. Inspect fallback rates before comparing scores.

To assess the native Supermemory task experience, use the existing application/API separately. The fork cannot change or instrument its hidden retrieval stages, and the LongMemEval adapter measures retrieval only; it does not measure answer quality or interaction feel.
