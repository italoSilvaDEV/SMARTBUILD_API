import { prisma } from "../utils/prisma";

function resolveRetentionDays(): number {
  const rawValue = process.env.WORKER_TRACKING_RETENTION_DAYS;
  const parsed = rawValue ? Number(rawValue) : 7;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 7;
  }
  return Math.floor(parsed);
}

async function main() {
  const retentionDays = resolveRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [deletedPings, deletedLiveLocations] = await prisma.$transaction([
    prisma.workerLocationPing.deleteMany({
      where: {
        recordedAt: {
          lt: cutoff,
        },
      },
    }),
    prisma.workerLiveLocation.deleteMany({
      where: {
        recordedAt: {
          lt: cutoff,
        },
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        message: "Worker tracking prune completed",
        retentionDays,
        cutoff: cutoff.toISOString(),
        deletedWorkerLocationPings: deletedPings.count,
        deletedWorkerLiveLocations: deletedLiveLocations.count,
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
