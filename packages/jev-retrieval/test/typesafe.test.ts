import { describe, expect, test } from "bun:test";
import { JEV_COST_ASSUMPTION, TypeSafeSdkJudge } from "../src/typesafe";
import type { Memory } from "../src/types";

describe("TypeSafe SDK boundary", () => {
  test("injects the pinned model, candidates, and reported usage", async () => {
    const memory: Memory = { id: "m1", tenantId: "tenant-a", text: "A source passage", source: { documentId: "doc1", chunkId: "chunk1" }, createdAt: "2025-01-01T00:00:00Z", initialScore: 0.8 };
    let request: Parameters<ConstructorParameters<typeof TypeSafeSdkJudge>[0]>[0] | undefined;
    const judge = new TypeSafeSdkJudge(async (input) => {
      request = input;
      return { judgments: [{ id: "m1", score: 0.75 }], usage: { inputTokens: 100, outputTokens: 10, estimatedCostUsd: 0.0000042, model: JEV_COST_ASSUMPTION.model } };
    });
    const result = await judge.judge({ purpose: "rank", query: "Where?", candidates: [memory], criteria: "Score relevance", signal: new AbortController().signal });
    expect(request?.model).toBe("jev-1.13.0");
    expect(request?.query).toBe("Where?");
    expect(Object.keys(request?.candidates[0] ?? {})).not.toContain("tenantId");
    expect(result.judgments[0]?.score).toBe(0.75);
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.estimatedCostUsd).toBe(0.0000042);
  });

  test("rejects malformed injected runner output", async () => {
    const judge = new TypeSafeSdkJudge(async () => ({ judgments: [{ id: "m1", score: 2 }] }));
    await expect(judge.judge({ purpose: "rank", query: "q", candidates: [], criteria: "c", signal: new AbortController().signal })).rejects.toThrow("invalid TypeSafe judgment");
  });
});
