import { Types } from "mongoose";
import { Attempt } from "../models/Attempt";

/**
 * Atomic upsert of one answer. Every step is a single-document update that only
 * matches while the attempt is still in-progress and before its deadline.
 */
export async function upsertAnswerAtomic(
  attemptId: Types.ObjectId,
  questionId: string,
  selectedOptionIndex: number
): Promise<boolean> {
  const qid = new Types.ObjectId(questionId);
  const live = () => ({
    _id: attemptId,
    status: "in-progress" as const,
    deadline: { $gt: new Date() },
  });

  const updateExisting = () =>
    Attempt.updateOne(
      { ...live(), "answers.questionId": qid },
      { $set: { "answers.$.selectedOptionIndex": selectedOptionIndex } }
    );

  // 1) Answer already exists -> overwrite it.
  let r = await updateExisting();
  if (r.matchedCount > 0) return true;

  // 2) First answer for this question -> push, but only if nobody else pushed it first.
  r = await Attempt.updateOne(
    { ...live(), "answers.questionId": { $ne: qid } },
    { $push: { answers: { questionId: qid, selectedOptionIndex } } }
  );
  if (r.matchedCount > 0) return true;

  // 3) Either a concurrent request just created it (retry as an update),
  //    or the attempt is no longer live (retry matches nothing -> false).
  r = await updateExisting();
  return r.matchedCount > 0;
}