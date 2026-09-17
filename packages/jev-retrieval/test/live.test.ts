import { expect, test } from "bun:test";
import type { Memory } from "../src/types";

test.skipIf(process.env.TYPESAFE_LIVE_TEST !== "1")("live TypeSafe SDK", async () => {
  expect(process.env.TYPESAFE_API_KEY).toBeTruthy();
  const { judge } = await import("../examples/typesafe-judge");
  const candidate: Memory = { id: "live-smoke", tenantId: "test", text: "The launch is scheduled for Friday.", source: { documentId: "live-smoke", chunkId: "live-smoke" }, createdAt: "2025-01-01T00:00:00Z", initialScore: 0.5 };
  const result = await judge.judge({ purpose: "rank", query: "When is the launch?", candidates: [candidate], criteria: "Score direct evidence for answering the query.", signal: new AbortController().signal });
  expect(result.judgments).toHaveLength(1);
  expect(result.usage?.model).toBe("jev-1.13.0");
  expect(result.usage?.inputTokens).toBeGreaterThan(0);
});
