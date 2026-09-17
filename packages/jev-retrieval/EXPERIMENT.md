# Jev retrieval ablations

All experiments live together on the current feature branch. The baseline and all Jev modes share one candidate source, graph, labeled queries, as-of time, `k`, and context budget. The changes are limited to ranking and bounded relationship expansion.

| Mode | Ranking | Expansion |
| --- | --- | --- |
| `baseline` | Similarity descending, ID tie-break | Breadth-first, target-ID order |
| `reranker-only` | Jev typed Score | Baseline |
| `graph-traversal-only` | Baseline | Jev selects from provider-read targets |
| `reranker-and-traversal` | Jev typed Score | Jev selects from provider-read targets |

The combined mode judges each shared frontier before expansion and ranks after newly read evidence is available. Independent candidates are packed into requests under the input budget; the harness counts every request and caps them per query. It does not ask Jev to retrieve IDs or data. Tenant filtering, temporal checks, graph limits, candidate limits, input/context token estimates, and request counts remain in code. A failed stage falls back to baseline behavior and records its reason.

`TypeSafeSdkJudge` is the injected boundary; `examples/typesafe-judge.ts` is the bundled official `@typesafe-ai/sdk` implementation. It asks parallel Score questions for each request batch, pins `jev-1.13.0`, records returned model/token usage, and estimates input cost at $0.042 per million tokens with output free, per the [official models page](https://docs.typesafe.ai/models.md) checked on 2026-09-17. Recheck this price before future runs. Current documented rate limits are dynamic.

LongMemEval reports retrieval metrics on `answer_session_ids`, not answer-generation quality. It has no graph labels, so the adapter adds synthetic edges between adjacent dated sessions; graph-mode scores test traversal behavior, not the value of a ground-truth memory graph. Future sessions are excluded using `question_date`; their inclusion is separately counted as temporal leakage. The benchmark has no stale/superseded labels, so stale-memory inclusion is unavailable there. The labeled fixture suite includes expiration and supersession cases.

## Measured LongMemEval-S run

Run on 2026-09-17 over all 500 questions with `k=10`, 20 initial candidates, an 8,000-token context budget, the shared 12,000-token chars/4 request estimate, and a 32-request per-question cap. Latencies cover retrieval calls, not dataset loading or answer generation. Costs use the documented Jev input rate; output is listed as free.

| Mode | Recall@10 | nDCG@10 | Evidence coverage | p95 latency | TypeSafe requests | Estimated input cost | Fallbacks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 0.8235 | 0.7113 | 0.5561 | 0.078 ms | 0 | $0.0000 | 0/500 |
| Reranker only | 0.8863 | 0.7437 | 0.5987 | 1,696 ms | 3,527 | $1.3442 | 1/500 |
| Graph traversal only | 0.8235 | 0.7113 | 0.5561 | 0.058 ms | 8 | $0.0030 | 0/500 |
| Reranker and traversal | 0.8878 | 0.7471 | 0.6016 | 1,662 ms | 3,536 | $1.3469 | 1/500 |

The single fallback in each ranking mode was the same oversized session, rejected by the local input-budget check; no future-session leakage occurred. Graph expansion made only eight Jev requests across the dataset and did not change aggregate retrieval scores. These are measured results for this fixture graph and candidate policy, not evidence that the hidden Supermemory engine improves by the same amount.

The repository fork does not contain Supermemory's server retrieval internals. `/v4/search` supplies initial candidates only and has no public graph adjacency operation; API-backed calls cannot isolate or replace hidden traversal/reranking. These results are prototype ablations, not native-engine measurements.
