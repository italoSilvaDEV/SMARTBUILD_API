import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export const quickbooksQueue = new Queue("quickbooks-sync", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // retries
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
