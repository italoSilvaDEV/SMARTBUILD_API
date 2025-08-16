import 'dotenv/config';
import { Worker, QueueEvents } from "bullmq";
import { redisConnection } from "../../queue/connection";
import { SyncOrchestratorController } from "../../controllers/quickbooks/sync/SyncOrchestratorController";

console.log("[Worker] iniciado. Aguardando jobs em 'quickbooks-sync'...");
console.log('[Worker] ENV check -> DATABASE_URL:', !!process.env.DATABASE_URL, ' REDIS_URL:', !!process.env.REDIS_URL);
// Eventos de fila (logs)
const queueEvents = new QueueEvents("quickbooks-sync", { connection: redisConnection });
queueEvents.on("completed", ({ jobId }) => console.log(`[Worker] Job ${jobId} COMPLETED`));
queueEvents.on("failed", ({ jobId, failedReason }) => console.error(`[Worker] Job ${jobId} FAILED: ${failedReason}`));

const orchestrator = new SyncOrchestratorController();

// Worker com rate limit global por worker (ajuste conforme limites do QBO)
const worker = new Worker(
  "quickbooks-sync",
  async (job) => {
    const { companyId, userId, prefs } = job.data as { companyId: string; userId: string; prefs: any[] };

    await job.updateProgress({ stage: "starting" });

    // Aqui usamos seu método atual que já atualiza syncStatus/syncLog
    await orchestrator.executeSync(prefs, companyId, userId);

    await job.updateProgress({ stage: "finished" });
  },
  {
    connection: redisConnection,
    concurrency: 1,
    limiter: { max: 450, duration: 60_000 }, // ~450/min para dar folga (QBO ~500/min)
  }
);

// Só para garantir que o processo não finalize
worker.on("error", (err) => {
  console.error("[Worker] error:", err);
});
