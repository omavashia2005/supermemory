import { score, TypeSafeClient, type Questions, type ScoreResponse } from "@typesafe-ai/sdk";
import { JEV_COST_ASSUMPTION, TypeSafeSdkJudge } from "../src/typesafe";

const MODEL = JEV_COST_ASSUMPTION.model;
const client = new TypeSafeClient({ defaultModel: MODEL });

export const judge = new TypeSafeSdkJudge(async ({ purpose, query, candidates, criteria, signal }) => {
  const questions: Questions = Object.fromEntries(candidates.map((_, index) => [
    `candidate_${index}`,
    score(
      `How useful is candidate ${index} as evidence for this ${purpose === "rank" ? "answer" : "expansion"}? ${criteria}`,
      ["No useful evidence for the query", "Indirect or incomplete evidence", "Direct, useful evidence for the query"],
    ),
  ]));
  const result = await client.systemOne({ model: MODEL, state: { query, candidates }, questions }, { signal, retry: { maxRetries: 0 } });
  return {
    judgments: candidates.map((candidate, index) => {
      const answer = result.answers[`candidate_${index}`] as ScoreResponse;
      return { id: candidate.id, score: answer.score / 2, expand: answer.score >= 1 };
    }),
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      estimatedCostUsd: result.usage.input_tokens * JEV_COST_ASSUMPTION.inputUsdPerMillionTokens / 1_000_000,
      model: result.model,
    },
  };
}, MODEL);
