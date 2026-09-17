import { describe, expect, test } from "bun:test";
import { adaptLongMemEval } from "../src/longmemeval";

describe("LongMemEval adapter", () => {
  test("preserves sessions, dates, labels, and deterministic temporal edges", () => {
    const adapted = adaptLongMemEval({
      question_id: "q1", question: "Where is the key?", answer: "drawer",
      haystack_session_ids: ["s1", "s2"], haystack_dates: ["2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z"],
      haystack_sessions: [[{ role: "user", content: "The key is in the drawer." }], [{ role: "assistant", content: "Noted." }]],
      answer_session_ids: ["s1"],
    });
    expect(adapted.memories.map((memory) => memory.id)).toEqual(["s1", "s2"]);
    expect(adapted.memories[0]?.source).toEqual({ documentId: "q1", chunkId: "s1" });
    expect(adapted.edges).toEqual([{ from: "s1", to: "s2", relation: "next-session" }, { from: "s2", to: "s1", relation: "previous-session" }]);
    expect(adapted.relevant).toEqual(["s1"]);
  });

  test("rejects inconsistent session identifiers", () => {
    expect(() => adaptLongMemEval({ question_id: "q", question: "q", answer: "a", haystack_session_ids: [], haystack_sessions: [[{ role: "user", content: "x" }]] })).toThrow("Session ID mismatch");
  });
});
