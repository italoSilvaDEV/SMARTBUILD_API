import IORedis from "ioredis";

console.log(`[REDIS] ${process.env.REDIS_URL}`);

export const redisConnection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
