import { Router, Request, Response } from "express";
import { Attempt } from "../models/Attempt";
import { finalizeAttempt, rescoreMissing } from "../services/scoring";
import { generateSweepAuthCheck } from "../utils/token";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Force-submits any Attempt still marked in-progress past its own deadline.
 * This is the safety net behind the client heartbeat (see Security Addendum
 * Section 7): trigger it from an EXTERNAL cron (GitHub Actions schedule,
 * cron-job.org, etc.) hitting POST /internal/sweep with the shared secret,
 * rather than relying on an in-process setInterval that dies when the
 * backend spins down on a free hosting tier.
 */
export async function runSweep(): Promise<{ finalized: number, rescored: number }> {
  const overdue = await Attempt.find({
    status: "in-progress",
    deadline: { $lte: new Date() },
  }).select("_id");

  let finalized = 0;
  for (const { _id } of overdue) {
    try {
      const done = await finalizeAttempt(_id, "auto-submitted");
      if (done && done.status === "auto-submitted") finalized += 1;
    } catch (e) {
      // One bad attempt must not stop the rest of the sweep.
      console.error("[sweep] failed to finalize attempt", _id.toString(), e);
    }
  }
  const rescored = await rescoreMissing();
  return { finalized, rescored };
}

const router = Router();

router.post("/sweep", asyncHandler(async (req: Request, res: Response) => {
  const provided = req.header("x-sweep-secret");
  if (!generateSweepAuthCheck(provided)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await runSweep();
  return res.json(result);
}));

export default router;
