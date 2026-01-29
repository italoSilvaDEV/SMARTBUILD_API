import 'dotenv/config';
import { Worker, QueueEvents } from "bullmq";
import { redisConnection } from "../../queue/connection";
import { SyncOrchestratorController } from "../../controllers/quickbooks/sync/SyncOrchestratorController";

// Eventos de fila (sem logs para evitar flood no terminal)
const queueEvents = new QueueEvents("quickbooks-sync", { connection: redisConnection });
queueEvents.on("completed", () => {});
queueEvents.on("failed", () => {});

const orchestrator = new SyncOrchestratorController();

// Worker com rate limit global por worker (ajuste conforme limites do QBO)
const worker = new Worker(
  "quickbooks-sync",
  async (job) => {
    const { companyId, userId, prefs } = job.data as { companyId: string; userId: string; prefs: any[] };

    await job.updateProgress({ stage: "starting" });

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
});
