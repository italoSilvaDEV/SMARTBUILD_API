import cron from "node-cron";
import { pruneWorkerTrackingData } from "../services/TrackingRetentionService";

let isTrackingRetentionJobRunning = false;

export function setupTrackingRetentionJob() {
  const schedule = process.env.WORKER_TRACKING_PRUNE_CRON || "17 3 * * *";
  const timezone = process.env.WORKER_TRACKING_PRUNE_TIMEZONE || "UTC";

  if (!cron.validate(schedule)) {
    console.error(`[TrackingRetentionJob] Invalid cron schedule: ${schedule}`);
    return null;
  }

  return cron.schedule(
    schedule,
    async () => {
      if (isTrackingRetentionJobRunning) return;
      isTrackingRetentionJobRunning = true;
      try {
        const result = await pruneWorkerTrackingData();
        console.log(
          "[TrackingRetentionJob] Completed",
          JSON.stringify({
            ...result,
            cutoff: result.cutoff.toISOString(),
          })
        );
      } catch (error) {
        console.error("[TrackingRetentionJob] Error:", error);
      } finally {
        isTrackingRetentionJobRunning = false;
      }
    },
    { timezone }
  );
}
