# Jev retrieval ablations

All experiments live together on the current feature branch. The baseline and all Jev modes share one candidate source, graph, labeled queries, as-of time, `k`, and context budget. The changes are limited to ranking and bounded relationship expansion.

| Mode | Ranking | Expansion |
| --- | --- | --- |
| `baseline` | Similarity descending, ID tie-break | Breadth-first, target-ID order |
| `reranker-only` | Jev typed Score | Baseline |
| `graph-traversal-only` | Baseline | Jev selects from provider-read targets |
| `reranker-and-traversal` | Jev typed Score | Jev selects from provider-read targets |

The combined mode makes one TypeSafe call for each shared frontier and one ranking call after expansion. It does not ask Jev to retrieve IDs or data. Tenant filtering, temporal checks, graph limits, candidate limits, input/context token estimates, and request counts remain in code. A failed stage falls back to baseline behavior and records its reason.

`TypeSafeSdkJudge` is the injected boundary; `examples/typesafe-judge.ts` is the bundled official `@typesafe-ai/sdk` implementation. It asks parallel Score questions in one `systemOne` request, pins `jev-1.13.0`, records returned model/token usage, and estimates input cost at $0.042 per million tokens with output free, per the [official models page](https://docs.typesafe.ai/models.md) checked on 2026-09-17. Recheck this price before future runs. Current documented rate limits are dynamic.

LongMemEval reports retrieval metrics on `answer_session_ids`, not answer-generation quality. It has no graph labels, so the adapter adds synthetic edges between adjacent dated sessions; graph-mode scores test traversal behavior, not the value of a ground-truth memory graph. Future sessions are excluded using `question_date`; their inclusion is separately counted as temporal leakage. The benchmark has no stale/superseded labels, so stale-memory inclusion is unavailable there. The labeled fixture suite includes expiration and supersession cases.

The repository fork does not contain Supermemory's server retrieval internals. `/v4/search` supplies initial candidates only and has no public graph adjacency operation; API-backed calls cannot isolate or replace hidden traversal/reranking. These results are prototype ablations, not native-engine measurements.
