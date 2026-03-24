import cron from "node-cron";
import { runTrackingHealthCheckJob } from "../services/TrackingHealthService";

let isTrackingHealthJobRunning = false;

export const setupTrackingHealthJob = () => {
  cron.schedule("*/5 * * * *", async () => {
    if (isTrackingHealthJobRunning) {
      return;
    }

    isTrackingHealthJobRunning = true;
    try {
      await runTrackingHealthCheckJob();
    } catch (error) {
      console.error("[TrackingHealthJob] Error:", error);
    } finally {
      isTrackingHealthJobRunning = false;
    }
  });
};
