import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import {Test} from "./models/Test";
import { Question } from "./models/Question";
import { Attempt } from "./models/Attempt";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function main() {
  await connectDB();
  await Promise.all([Test.syncIndexes(), Question.syncIndexes(), Attempt.syncIndexes()]);
  setInterval(async()=>{
    try{
      const now = new Date();
      const result = await Test.updateMany(
        {
          loginWindowEnd: {$lt: now},
          window: {$ne: "closed"}
        },
        {$set: {window: "closed"}},
      );
      if(result.modifiedCount > 0){
        console.log(`[cron] Auto-closed ${result.modifiedCount} tests`)
      }
    } catch(e){
      console.error("Auto-close cron failed", e)
    }
  }, 5*60*1000);

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
