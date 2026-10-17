import { describe, it, expect } from "vitest";
import { scoreAnswers } from "../src/services/scoring";

const q1 = "q1";
const q2 = "q2";
// Original options: A(0) B(1) C(2) D(3). Student saw them as [C, A, D, B].
const optionOrder = { [q1]: [2, 0, 3, 1], [q2]: [0, 1, 2, 3] };
const keys = new Map([[q1, 1], [q2, 3]]); // correct = B for q1, D for q2

describe("scoreAnswers", () => {
  it("maps the displayed index back to the original index (shuffled)", () => {
    // Displayed index 3 is "B", which is the correct answer for q1.
    expect(scoreAnswers([{ questionId: q1, selectedOptionIndex: 3 }], optionOrder, keys)).toBe(1);
  });

  it("does not credit the raw index when options were shuffled", () => {
    // Raw index 1 equals the correct index, but displayed 1 is actually "A".
    expect(scoreAnswers([{ questionId: q1, selectedOptionIndex: 1 }], optionOrder, keys)).toBe(0);
  });

  it("scores unshuffled questions directly", () => {
    expect(scoreAnswers([{ questionId: q2, selectedOptionIndex: 3 }], optionOrder, keys)).toBe(1);
  });

  it("counts a question once even if it has duplicate answers (last wins)", () => {
    const answers = [
      { questionId: q1, selectedOptionIndex: 3 },
      { questionId: q1, selectedOptionIndex: 3 },
    ];
    expect(scoreAnswers(answers, optionOrder, keys)).toBe(1);
  });

  it("ignores out-of-range indexes and unknown questions", () => {
    const answers = [
      { questionId: q1, selectedOptionIndex: 9 },
      { questionId: "nope", selectedOptionIndex: 0 },
    ];
    expect(scoreAnswers(answers, optionOrder, keys)).toBe(0);
  });
});