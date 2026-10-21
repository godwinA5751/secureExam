import { describe, it, expect } from "vitest";
import { scoreAnswers, totalMarksOf } from "../src/services/scoring";

const keys = new Map([["q1", 1], ["q2", 0]]);

describe("marks", () => {
  it("multiplies correct answers by the marks per question", () => {
    const answers = [
      { questionId: "q1", selectedOptionIndex: 1 },
      { questionId: "q2", selectedOptionIndex: 0 },
    ];
    expect(scoreAnswers(answers, undefined, keys, 2)).toBe(4);
    expect(scoreAnswers(answers, undefined, keys)).toBe(2); // default: 1 mark each
  });

  it("gives no marks for wrong answers", () => {
    expect(scoreAnswers([{ questionId: "q1", selectedOptionIndex: 3 }], undefined, keys, 2)).toBe(0);
  });

  it("works out total marks, including for older attempts", () => {
    expect(totalMarksOf({ totalMarks: 10 })).toBe(10);
    expect(totalMarksOf({ shuffleMap: { questionOrder: [1, 2, 3] }, marksPerQuestion: 2 })).toBe(6);
    expect(totalMarksOf({ shuffleMap: { questionOrder: [1, 2, 3] } })).toBe(3); // before marks existed
  });
});