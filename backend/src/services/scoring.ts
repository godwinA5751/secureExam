import { Types } from "mongoose";
import { Question } from "../models/Question";
import { Attempt } from "../models/Attempt";

type AnswerLike = { questionId: { toString(): string }; selectedOptionIndex: number };
export type FinalStatus = "submitted" | "auto-submitted";

/**
 * Pure scoring logic (no DB), so it can be unit tested.
 * - answers hold the DISPLAYED (shuffled) option index
 * - optionOrder[questionId][displayedIndex] = original option index
 * - keyById maps questionId -> original correct option index
 * If a question appears more than once in answers, the last one wins.
 */
export function scoreAnswers(
  answers: AnswerLike[],
  optionOrder: Record<string, number[]> | undefined,
  keyById: Map<string, number>
): number {
  const latest = new Map<string, number>();
  for (const a of answers) latest.set(a.questionId.toString(), a.selectedOptionIndex);

  let score = 0;
  latest.forEach((displayed, qid) => {
    const correct = keyById.get(qid);
    if (correct === undefined) return;
    const order = optionOrder?.[qid];
    const original = order ? order[displayed] : displayed;
    if (original === correct) score += 1;
  });
  return score;
}

export async function computeScore(attempt: {
  answers: AnswerLike[];
  shuffleMap: { optionOrder: Record<string, number[]> };
}): Promise<number> {
  const ids = Array.from(new Set(attempt.answers.map((a) => a.questionId.toString())));
  if (ids.length === 0) return 0;

  const questions = await Question.find({ _id: { $in: ids } }).select("+correctOptionIndex");
  const keyById = new Map<string, number>(
    questions.map((q) => [q._id.toString(), q.correctOptionIndex] as [string, number])
  );
  return scoreAnswers(attempt.answers, attempt.shuffleMap?.optionOrder, keyById);
}

/**
 * The ONLY place an attempt gets finalized.
 * 1. Atomically claim it by flipping status from "in-progress". Only one caller can win.
 *    From this moment answer writes are rejected, so the answers can no longer change.
 * 2. Score the now-frozen answers and store the score.
 * Calling it again (submit + sweep + deadline at once) is safe: losers just get the
 * already-finalized attempt back.
 */
export async function finalizeAttempt(attemptId: Types.ObjectId | string, status: FinalStatus) {
  const claimed = await Attempt.findOneAndUpdate(
    { _id: attemptId, status: "in-progress" },
    { $set: { status, submittedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return Attempt.findById(attemptId);

  // Answers are frozen from here. If this throws or the process dies before the score
  // is saved, the attempt stays finalized with score null and rescoreMissing() repairs it.
  const score = await computeScore(claimed);
  return Attempt.findByIdAndUpdate(attemptId, { $set: { score } }, { new: true });
}

/** Scores attempts that were finalized but never got a score. Safe to run any time. */
export async function rescoreMissing(): Promise<number> {
  const stranded = await Attempt.find({
    status: { $in: ["submitted", "auto-submitted"] },
    score: null,
    submittedAt: { $lt: new Date(Date.now() - 30_000) }, // skip ones being scored right now
  });
  let fixed = 0;
  for (const attempt of stranded) {
    const score = await computeScore(attempt);
    const r = await Attempt.updateOne({ _id: attempt._id, score: null }, { $set: { score } });
    if (r.modifiedCount > 0) fixed += 1;
  }
  return fixed;
}