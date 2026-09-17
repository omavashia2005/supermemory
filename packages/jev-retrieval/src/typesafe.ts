import type { JevJudge, JudgeResult, Memory } from "./types";

export type TypeSafeCandidate = Pick<Memory, "id" | "text" | "createdAt" | "source">;
export type TypeSafeSdkRunner = (input: { model: string; purpose: "rank" | "expand"; query: string; candidates: TypeSafeCandidate[]; criteria: string; signal: AbortSignal }) => Promise<unknown>;

export const JEV_COST_ASSUMPTION = { model: "jev-1.13.0", inputUsdPerMillionTokens: 0.042, outputUsdPerMillionTokens: 0, source: "https://docs.typesafe.ai/models.md", checkedAt: "2026-09-17" } as const;

const output = (value: unknown): JudgeResult => {
  if (!value || typeof value !== "object" || !Array.isArray((value as JudgeResult).judgments)) throw new Error("invalid TypeSafe result");
  const result = value as JudgeResult;
  for (const judgment of result.judgments) {
    if (typeof judgment.id !== "string" || typeof judgment.score !== "number" || judgment.score < 0 || judgment.score > 1 || (judgment.rationale !== undefined && typeof judgment.rationale !== "string") || (judgment.expand !== undefined && typeof judgment.expand !== "boolean")) throw new Error("invalid TypeSafe judgment");
  }
  for (const amount of [result.usage?.inputTokens, result.usage?.outputTokens, result.usage?.estimatedCostUsd]) {
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new Error("invalid TypeSafe usage");
  }
  if (result.usage?.model !== undefined && typeof result.usage.model !== "string") throw new Error("invalid TypeSafe model");
  return result;
};

/** Inject a runner implemented with the official SDK; the package never guesses an HTTP contract. */
export class TypeSafeSdkJudge implements JevJudge {
  constructor(private run: TypeSafeSdkRunner, private model = JEV_COST_ASSUMPTION.model) {}

  async judge(input: Parameters<JevJudge["judge"]>[0]): Promise<JudgeResult> {
    return output(await this.run({
      model: this.model,
      purpose: input.purpose,
      query: input.query,
      candidates: input.candidates.map(({ id, text, createdAt, source }) => ({ id, text, createdAt, source })),
      criteria: input.criteria,
      signal: input.signal,
    }));
  }
}
