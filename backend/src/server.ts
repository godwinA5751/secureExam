import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import {Test} from "./models/Test";
import { Question } from "./models/Question";
import { Attempt } from "./models/Attempt";
import { runSweep } from "./jobs/sweep";
import { RevokedToken } from "./models/RevokedToken";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Last-resort log so a stray rejection never takes the exam server down silently.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
async function main() {
  await connectDB();
  await Promise.all([
    Test.syncIndexes(),
    Question.syncIndexes(),
    Attempt.syncIndexes(),
    RevokedToken.syncIndexes(),
  ]);
  setInterval(async () => {
    try {
      const now = new Date();

      // Close published tests whose login window has ended.
      const closed = await Test.updateMany(
        {
          status: "published",
          window: "opened",
          loginWindowEnd: { $lte: now },
        },
        {
          $set: { window: "closed" },
        }
      );

      // Open published tests whose scheduled start time has arrived.
      // The end-time condition prevents already-expired tests from opening.
      const opened = await Test.updateMany(
        {
          status: "published",
          window: "closed",
          loginWindowStart: { $lte: now },
          loginWindowEnd: { $gt: now },
        },
        {
          $set: { window: "opened" },
        }
      );

      if (closed.modifiedCount > 0) {
        console.log(`[cron] Auto-closed ${closed.modifiedCount} tests`);
      }

      if (opened.modifiedCount > 0) {
        console.log(`[cron] Auto-opened ${opened.modifiedCount} tests`);
      }
    } catch (error) {
      console.error("[cron] Window synchronization failed", error);
    }
  }, 5 * 60 * 1000);

  // Safety net behind the client heartbeat: force-submit overdue attempts.
  // Safe with several server instances: finalizeAttempt claims each attempt atomically.
  const sweepSeconds = Number(process.env.SWEEP_INTERVAL_SECONDS ?? 60);
  if (sweepSeconds > 0) {
    let sweeping = false;
    setInterval(async () => {
      if (sweeping) return; // never overlap runs
      sweeping = true;
      try {
        const r = await runSweep();
        if (r.finalized > 0 || r.rescored > 0) {
          console.log(`[sweep] finalized ${r.finalized}, rescored ${r.rescored}`);
        }
      } catch (e) {
        console.error("[sweep] failed", e);
      } finally {
        sweeping = false;
      }
    }, sweepSeconds * 1000);
    console.log(`[sweep] running every ${sweepSeconds}s`);
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[secureexam] API listening on port ${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
