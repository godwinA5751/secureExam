import { Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Test } from "../models/Test";
import { Question, toStudentSafeQuestion } from "../models/Question";
import { Attempt } from "../models/Attempt";
import { AuthedRequest } from "../middleware/auth";
import { finalizeAttempt } from "../services/scoring";
import { upsertAnswerAtomic } from "../services/answers";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Read-only briefing for the "before you begin" screen. Does NOT create an attempt,
 * so the student's timer only starts when they press Begin.
 */
export async function getAttemptInfo(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const test = await Test.findById(testId).select(
    "title instructions durationMinutes status loginWindowEnd"
  );
  if (!test || test.status !== "published") {
    return res.status(404).json({ error: "Test not available" });
  }

  const now = new Date();
  const attempt = await Attempt.findOne({ testId, studentId }).select("status deadline");
  if (attempt) {
    if (attempt.status === "in-progress" && attempt.deadline > now) {
      return res.json({ state: "in-progress", deadline: attempt.deadline });
    }
    return res.json({ state: "finished" });
  }

  if (now > test.loginWindowEnd) {
    return res.status(403).json({ error: "Login window has closed" });
  }

  const questionCount = await Question.countDocuments({ testId, approved: true });
  const minutesLeftInWindow = Math.max(
    1,
    Math.ceil((test.loginWindowEnd.getTime() - now.getTime()) / 60000)
  );

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    state: "not-started",
    title: test.title,
    instructions: test.instructions ?? "",
    durationMinutes: test.durationMinutes,
    // The deadline is capped by the login window, so show what the student will really get.
    minutesAvailable: Math.min(test.durationMinutes, minutesLeftInWindow),
    questionCount,
  });
}

/**
 * Gets-or-atomically-creates the caller's Attempt. Uses findOneAndUpdate with
 * upsert so concurrent requests for the same (testId, studentId) cannot both
 * succeed in creating separate Attempts — the unique index on Attempt is the
 * backstop if this still races under extreme load.
 */
export async function getOrCreateAttempt(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const test = await Test.findById(testId);
  if (!test || test.status !== "published") return res.status(404).json({ error: "Test not available" });

  const now = new Date();
  if (now > test.loginWindowEnd) return res.status(403).json({ error: "Login window has closed" });

  const existing = await Attempt.findOne({ testId, studentId });
  if (existing && existing.status !== "in-progress") {
    return res.status(403).json({ error: "This test has already been submitted" });
  }
  if (existing) {
    return res.json({ attemptId: existing._id, deadline: existing.deadline, status: existing.status });
  }

  const questions = await Question.find({ testId, approved: true }).select("_id options");
  if (questions.length === 0) return res.status(500).json({ error: "Test has no approved questions" });

  const questionOrder = shuffle(questions.map((q) => q._id));
  const optionOrder: Record<string, number[]> = {};
  for (const q of questions) {
    optionOrder[q._id.toString()] = shuffle(q.options.map((_, i) => i));
  }

  const deadline = new Date(
    Math.min(now.getTime() + test.durationMinutes * 60 * 1000, test.loginWindowEnd.getTime())
  );
  const wasShortened = deadline.getTime() < now.getTime() + test.durationMinutes * 60 * 1000;

  try {
    const attempt = await Attempt.findOneAndUpdate(
      { testId, studentId },
      {
        $setOnInsert: {
          testId,
          studentId,
          status: "in-progress",
          shuffleMap: { questionOrder, optionOrder },
          answers: [],
          startedAt: now,
          deadline,
          wasShortened,
          visibilityEvents: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ attemptId: attempt._id, deadline: attempt.deadline, status: attempt.status });
  } catch (e: any) {
    if (e.code === 11000) {
      // Lost the race - another request created it first. Fetch and return that one.
      const winner = await Attempt.findOne({ testId, studentId });
      return res.json({ attemptId: winner!._id, deadline: winner!.deadline, status: winner!.status });
    }
    throw e;
  }
}

async function requireActiveAttempt(testId: string, studentId: string, res: Response) {
  const attempt = await Attempt.findOne({ testId, studentId });
  if (!attempt) {
    res.status(404).json({ error: "No attempt found" });
    return null;
  }
  if (attempt.status !== "in-progress") {
    res.status(403).json({ error: "This attempt is no longer in progress" });
    return null;
  }
  return attempt;
}

async function finalizeIfPastDeadline(attempt: any): Promise<boolean> {
  if (new Date() > attempt.deadline && attempt.status === "in-progress") {
    await scoreAndSubmit(attempt, "auto-submitted");
    return true;
  }
  return false;
}

async function scoreAndSubmit(attempt: any, status: "submitted" | "auto-submitted") {
  // null means someone else already finalized it (heartbeat, sweep, double submit)
  const final: any =
    (await finalizeAttempt(attempt._id, status)) ?? (await Attempt.findById(attempt._id).lean());
  if (final) {
    attempt.score = final.score;
    attempt.status = final.status;
    attempt.submittedAt = final.submittedAt;
  }
}

export async function getQuestions(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const attempt = await requireActiveAttempt(testId, studentId, res);
  if (!attempt) return;

  if (await finalizeIfPastDeadline(attempt)) {
    return res.status(403).json({ error: "Time is up; this attempt has been auto-submitted" });
  }

  const questions = await Question.find({ _id: { $in: attempt.shuffleMap.questionOrder } }).select(
    "_id text options topic"
  );
  const byId = new Map(questions.map((q) => [q._id.toString(), q]));

  // Reorder per this student's shuffle and strip the answer key before it ever leaves the server.
  const ordered = attempt.shuffleMap.questionOrder.map((qid: Types.ObjectId) => {
    const q = byId.get(qid.toString())!;
    const order: number[] = attempt.shuffleMap.optionOrder[qid.toString()] ?? q.options.map((_: any, i: number) => i);
    const reorderedOptions = order.map((i) => q.options[i]);
    return { ...toStudentSafeQuestion(q as any), options: reorderedOptions, optionOrder: order };
  });

    // Saved answers (displayed option indexes), so a refreshed page can restore its selections.
  const savedAnswers = Object.fromEntries(
    attempt.answers.map((a) => [a.questionId.toString(), a.selectedOptionIndex])
  );

  res.setHeader("Cache-Control", "no-store");
  return res.json({ deadline: attempt.deadline, questions: ordered, answers: savedAnswers });
}

const heartbeatSchema = z.object({
  visibility: z.enum(["blur", "hidden", "focus", "visible"]).optional(),
});

export async function heartbeat(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const attempt = await requireActiveAttempt(testId, studentId, res);
  if (!attempt) return;

  const parsed = heartbeatSchema.safeParse(req.body ?? {});
  if (parsed.success && parsed.data.visibility) {
    await Attempt.updateOne(
      { _id: attempt._id, status: "in-progress" },
      { $push: { visibilityEvents: { type: parsed.data.visibility, at: new Date() } } }
    );

    // Tab-visibility anti-cheat: immediate auto-submit on blur/hidden.
    if (parsed.data.visibility === "blur" || parsed.data.visibility === "hidden") {
      await scoreAndSubmit(attempt, "auto-submitted");
      return res.json({ status: attempt.status, reason: "tab-visibility-violation" });
    }
  }

  if (await finalizeIfPastDeadline(attempt)) {
    return res.json({ status: "auto-submitted", reason: "deadline" });
  }
  return res.json({ status: "in-progress", deadline: attempt.deadline });
}

const answerSchema = z.object({
  questionId: z.string(),
  selectedOptionIndex: z.number().int().min(0),
});

export async function saveAnswer(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const attempt = await requireActiveAttempt(testId, studentId, res);
  if (!attempt) return;
  if (await finalizeIfPastDeadline(attempt)) {
    return res.status(403).json({ error: "Time is up; this attempt has been auto-submitted" });
  }

  const parsed = answerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input",
    });
  }

  const { questionId, selectedOptionIndex } = parsed.data;

  const isInAttempt = attempt.shuffleMap.questionOrder.some(
    (q) => q.toString() === questionId
  );

  if (!isInAttempt) {
    return res.status(400).json({
      error: "Question does not belong to this attempt",
    });
  }

  const question = await Question.findById(questionId).select(
    "_id options"
  );

  if (!question) {
    return res.status(400).json({
      error: "Question not found",
    });
  }

  const optionOrder =
    attempt.shuffleMap.optionOrder[questionId] ??
    question.options.map((_: string, i: number) => i);

  if (
    selectedOptionIndex < 0 ||
    selectedOptionIndex >= optionOrder.length
  ) {
    return res.status(400).json({
      error: "Invalid option",
    });
  }

  const ok = await upsertAnswerAtomic(attempt._id, questionId, selectedOptionIndex);
  if (!ok) {
    await finalizeIfPastDeadline(attempt);
    return res.status(403).json({ error: "This attempt is no longer in progress" });
  }

  return res.json({ ok: true });
}

export async function submitAttempt(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const attempt = await requireActiveAttempt(testId, studentId, res);
  if (!attempt) return;

  const total = attempt.shuffleMap.questionOrder.length;

  if (await finalizeIfPastDeadline(attempt)) {
    return res.json({ status: "auto-submitted", score: attempt.score, total });
  }

  await scoreAndSubmit(attempt, "submitted");
  return res.json({ status: attempt.status, score: attempt.score, total });
}

/**
 * Result of a finished attempt, for the ended screen. If the deadline has passed but
 * nothing has finalized the attempt yet, finalize it here so the score exists.
 */
export async function getResult(req: AuthedRequest, res: Response) {
  const { testId, id: studentId } = req.student!;
  const attempt = await Attempt.findOne({ testId, studentId });
  if (!attempt) return res.status(404).json({ error: "No attempt found" });

  if (attempt.status === "in-progress") {
    if (!(await finalizeIfPastDeadline(attempt))) {
      return res.status(409).json({ error: "This attempt is still in progress" });
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    status: attempt.status,
    score: attempt.score ?? null,
    total: attempt.shuffleMap.questionOrder.length,
  });
}