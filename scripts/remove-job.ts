import "dotenv/config";
import { quickbooksQueue } from "../src/queue/quickbooksQueue";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Uso: ts-node scripts/remove-job.ts <jobId>");
  process.exit(1);
}

(async () => {
  const job = await quickbooksQueue.getJob(jobId);
  if (!job) {
    console.log("Job não encontrado");
    process.exit(0);
  }
  const state = await job.getState();
  await job.remove();
  console.log(`Job ${jobId} removido. Estado anterior: ${state}`);
  process.exit(0);
})();
