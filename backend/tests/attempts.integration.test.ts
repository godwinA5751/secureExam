import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Types } from "mongoose";
import { Attempt } from "../src/models/Attempt";
import { Question } from "../src/models/Question";
import { upsertAnswerAtomic } from "../src/services/answers";
import { finalizeAttempt, rescoreMissing } from "../src/services/scoring";
import { runSweep } from "../src/jobs/sweep";
import { startDb, stopDb, clearDb } from "./helpers/db";

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

const testId = new Types.ObjectId();

async function makeQuestion(correctOptionIndex = 1) {
  return Question.create({
    testId,
    text: "Q?",
    options: ["A", "B", "C", "D"],
    correctOptionIndex,
    topic: "t",
    approved: true,
  });
}

async function makeAttempt(
  opts: {
    status?: "in-progress" | "submitted" | "auto-submitted";
    questionIds?: Types.ObjectId[];
    optionOrder?: Record<string, number[]>;
    answers?: { questionId: Types.ObjectId; selectedOptionIndex: number }[];
    deadlineInMs?: number;
    submittedAt?: Date | null;
    score?: number | null;
  } = {}
) {
  return Attempt.create({
    testId,
    studentId: new Types.ObjectId(),
    status: opts.status ?? "in-progress",
    shuffleMap: { questionOrder: opts.questionIds ?? [], optionOrder: opts.optionOrder ?? {} },
    answers: opts.answers ?? [],
    startedAt: new Date(),
    deadline: new Date(Date.now() + (opts.deadlineInMs ?? 10 * 60 * 1000)),
    submittedAt: opts.submittedAt ?? null,
    score: opts.score ?? null,
  });
}

describe("upsertAnswerAtomic", () => {
  it("pushes the first answer and overwrites it on change (one entry only)", async () => {
    const attempt = await makeAttempt();
    const q = new Types.ObjectId();

    expect(await upsertAnswerAtomic(attempt._id, q.toString(), 2)).toBe(true);
    expect(await upsertAnswerAtomic(attempt._id, q.toString(), 3)).toBe(true);

    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh!.answers).toHaveLength(1);
    expect(fresh!.answers[0].selectedOptionIndex).toBe(3);
  });

  it("never creates duplicates when the same question is saved concurrently", async () => {
    const attempt = await makeAttempt();
    const q = new Types.ObjectId().toString();

    const results = await Promise.all(
      [0, 1, 2, 3, 0, 1, 2, 3, 0, 1].map((i) => upsertAnswerAtomic(attempt._id, q, i))
    );

    expect(results.every(Boolean)).toBe(true);
    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh!.answers.filter((a) => a.questionId.toString() === q)).toHaveLength(1);
  });

  it("keeps every answer when different questions are saved concurrently", async () => {
    const attempt = await makeAttempt();
    const qs = Array.from({ length: 8 }, () => new Types.ObjectId());

    await Promise.all(qs.map((q, i) => upsertAnswerAtomic(attempt._id, q.toString(), i % 4)));

    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh!.answers).toHaveLength(8);
  });

  it("refuses to save after the attempt is finalized", async () => {
    const attempt = await makeAttempt();
    await finalizeAttempt(attempt._id, "submitted");

    const ok = await upsertAnswerAtomic(attempt._id, new Types.ObjectId().toString(), 1);

    expect(ok).toBe(false);
    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh!.answers).toHaveLength(0);
  });

  it("refuses to save after the deadline has passed", async () => {
    const attempt = await makeAttempt({ deadlineInMs: -1000 });

    const ok = await upsertAnswerAtomic(attempt._id, new Types.ObjectId().toString(), 1);

    expect(ok).toBe(false);
  });
});

describe("finalizeAttempt", () => {
  it("maps a shuffled displayed index back to the original option", async () => {
    const q = await makeQuestion(1); // correct = original option B
    const qid = q._id.toString();
    const attempt = await makeAttempt({
      questionIds: [q._id],
      optionOrder: { [qid]: [2, 0, 3, 1] }, // displayed index 3 shows original option B
      answers: [{ questionId: q._id, selectedOptionIndex: 3 }],
    });

    const done = await finalizeAttempt(attempt._id, "submitted");

    expect(done!.status).toBe("submitted");
    expect(done!.score).toBe(1);
  });

  it("does not credit the raw index when the options were shuffled", async () => {
    const q = await makeQuestion(1);
    const qid = q._id.toString();
    const attempt = await makeAttempt({
      questionIds: [q._id],
      optionOrder: { [qid]: [2, 0, 3, 1] },
      answers: [{ questionId: q._id, selectedOptionIndex: 1 }], // displayed 1 = original A
    });

    const done = await finalizeAttempt(attempt._id, "submitted");

    expect(done!.score).toBe(0);
  });

  it("counts a question once even if the stored answers contain duplicates", async () => {
    const q = await makeQuestion(1);
    const attempt = await makeAttempt({
      questionIds: [q._id],
      answers: [
        { questionId: q._id, selectedOptionIndex: 1 },
        { questionId: q._id, selectedOptionIndex: 1 },
      ],
    });

    const done = await finalizeAttempt(attempt._id, "submitted");

    expect(done!.score).toBe(1);
  });

  it("is safe to call concurrently: one winner, final score is correct", async () => {
    const q = await makeQuestion(1);
    const attempt = await makeAttempt({
      questionIds: [q._id],
      answers: [{ questionId: q._id, selectedOptionIndex: 1 }],
    });

    const results = await Promise.all(
      (["submitted", "auto-submitted", "submitted", "auto-submitted"] as const).map((s) =>
        finalizeAttempt(attempt._id, s)
      )
    );

    for (const r of results) expect(r!.status).not.toBe("in-progress");
    const fresh = await Attempt.findById(attempt._id).lean();
    expect(["submitted", "auto-submitted"]).toContain(fresh!.status);
    expect(fresh!.score).toBe(1);
  });
});

describe("runSweep", () => {
  it("auto-submits overdue attempts with the correct shuffled score and leaves live ones alone", async () => {
    const q = await makeQuestion(1);
    const qid = q._id.toString();
    const overdue = await makeAttempt({
      deadlineInMs: -60_000,
      questionIds: [q._id],
      optionOrder: { [qid]: [2, 0, 3, 1] },
      answers: [{ questionId: q._id, selectedOptionIndex: 3 }],
    });
    const live = await makeAttempt({ deadlineInMs: 10 * 60_000 });

    const first = await runSweep();
    const second = await runSweep();

    expect(first.finalized).toBe(1);
    expect(second.finalized).toBe(0);

    const done = await Attempt.findById(overdue._id).lean();
    expect(done!.status).toBe("auto-submitted");
    expect(done!.score).toBe(1);

    const untouched = await Attempt.findById(live._id).lean();
    expect(untouched!.status).toBe("in-progress");
  });
});

describe("rescoreMissing", () => {
  it("repairs old finalized attempts that have no score and skips very recent ones", async () => {
    const q = await makeQuestion(1);
    const stranded = await makeAttempt({
      status: "submitted",
      submittedAt: new Date(Date.now() - 2 * 60_000),
      questionIds: [q._id],
      answers: [{ questionId: q._id, selectedOptionIndex: 1 }],
    });
    const recent = await makeAttempt({
      status: "submitted",
      submittedAt: new Date(),
      questionIds: [q._id],
      answers: [{ questionId: q._id, selectedOptionIndex: 1 }],
    });

    const fixed = await rescoreMissing();

    expect(fixed).toBe(1);
    expect((await Attempt.findById(stranded._id).lean())!.score).toBe(1);
    expect((await Attempt.findById(recent._id).lean())!.score).toBeNull();
  });
});