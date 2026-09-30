import { Router, Request, Response } from "express";
import { Attempt } from "../models/Attempt";
import { Question } from "../models/Question";
import { generateSweepAuthCheck } from "../utils/token";

/**
 * Force-submits any Attempt still marked in-progress past its own deadline.
 * This is the safety net behind the client heartbeat (see Security Addendum
 * Section 7): trigger it from an EXTERNAL cron (GitHub Actions schedule,
 * cron-job.org, etc.) hitting POST /internal/sweep with the shared secret,
 * rather than relying on an in-process setInterval that dies when the
 * backend spins down on a free hosting tier.
 */
export async function runSweep(): Promise<{ finalized: number }> {
  const overdue = await Attempt.find({ status: "in-progress", deadline: { $lt: new Date() } });
  let finalized = 0;

  for (const attempt of overdue) {
    const questions = await Question.find({
      _id: { $in: attempt.answers.map((a) => a.questionId) },
    }).select("+correctOptionIndex");
    const keyById = new Map(questions.map((q) => [q._id.toString(), q.correctOptionIndex]));

    let score = 0;
    for (const ans of attempt.answers) {
      if (keyById.get(ans.questionId.toString()) === ans.selectedOptionIndex) score += 1;
    }

    attempt.score = score;
    attempt.status = "auto-submitted";
    attempt.submittedAt = new Date();
    await attempt.save();
    finalized += 1;
  }

  return { finalized };
}

const router = Router();

router.post("/sweep", async (req: Request, res: Response) => {
  const provided = req.header("x-sweep-secret");
  if (!generateSweepAuthCheck(provided)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await runSweep();
  return res.json(result);
});

export default router;
