import cron from "node-cron";
import { reconcileAppleBillingStatuses } from "../services/AppleBillingStatusService";

let running = false;
let lastId: string | undefined;

export function setupAppleBillingStatusJob() {
  return cron.schedule("17,32,47,2 * * * *", async () => {
    if (running || !process.env.APP_STORE_ISSUER_ID || !process.env.APP_STORE_PRIVATE_KEY) return;
    running = true;
    try {
      const result = await reconcileAppleBillingStatuses(50, lastId);
      lastId = result.scanned === 50 ? result.lastId : undefined;
      if (result.updated || result.failed) console.log("[AppleBillingStatus] Reconciled", result);
    } catch (error) {
      console.error("[AppleBillingStatus] Reconciliation failed", error);
    } finally {
      running = false;
    }
  });
}
