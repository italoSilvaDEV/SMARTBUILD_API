import { prisma } from "../utils/prisma";
import { pruneWorkerTrackingData } from "../services/TrackingRetentionService";

async function main() {
  const result = await pruneWorkerTrackingData();

  console.log(
    JSON.stringify(
      {
        message: "Worker tracking prune completed",
        ...result,
        cutoff: result.cutoff.toISOString(),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("[pruneWorkerTracking] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
