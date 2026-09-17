# Combined reranker and graph-traversal experiment

Branch: `jev/reranker-and-traversal`

This prototype combines bounded Jev-guided expansion with Jev final ranking. Independent targets at each frontier are judged in one batch; the final call occurs after newly expanded evidence is available. Run:

```sh
bun packages/jev-retrieval/src/cli.ts reranker-and-traversal packages/jev-retrieval/fixtures/dataset.json
```
