# Installation record

The first sandbox attempt on 2026-09-17 failed with HTTP 403. The requested Codex install then succeeded:

```sh
npx skills add typesafe-ai/skills --skill typesafe-ai --agent codex --yes
```

The upstream skill is at `.agents/skills/typesafe-ai/`. This `skills/typesafe-ai/` directory remains status metadata, not a second copy of the skill. `bun install --filter @supermemory/jev-retrieval` succeeded and resolved `@typesafe-ai/sdk` 0.6.0. Official JavaScript SDK, Score, model, rate-limit, and reranking docs were read; Jev 1.13.0 is documented, as is the current input-token price. No account-specific model listing or authenticated request was run because `TYPESAFE_API_KEY` is absent from this environment.
