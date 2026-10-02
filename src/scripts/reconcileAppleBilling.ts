import "dotenv/config";
import { prisma } from "../utils/prisma";
import { reconcileAppleBillingStatuses } from "../services/AppleBillingStatusService";

async function main() {
  let cursor: string | undefined;
  let updated = 0;
  let failed = 0;
  while (true) {
    const batch = await reconcileAppleBillingStatuses(50, cursor);
    updated += batch.updated;
    failed += batch.failed;
    if (batch.scanned < 50 || !batch.lastId) break;
    cursor = batch.lastId;
  }
  console.log("[AppleBillingStatus] Backfill complete", { updated, failed });
  if (failed) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error("[AppleBillingStatus] Backfill failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
