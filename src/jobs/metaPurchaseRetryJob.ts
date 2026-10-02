import cron from "node-cron";
import { retryFailedMetaPurchases } from "../services/MetaConversionsService";

let running = false;

export function setupMetaPurchaseRetryJob() {
    return cron.schedule("*/5 * * * *", async () => {
        if (running) return;
        running = true;
        try {
            await retryFailedMetaPurchases();
        } catch (error) {
            console.error("[MetaPurchaseRetryJob] Failed:", error);
        } finally {
            running = false;
        }
    });
}
