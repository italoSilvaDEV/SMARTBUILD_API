import { prisma } from "../utils/prisma";

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_BATCH_SIZE = 1_000;
const MIN_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 5_000;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function resolveTrackingRetentionOptions(overrides: {
  retentionDays?: number;
  batchSize?: number;
  now?: Date;
} = {}) {
  const retentionDays = Math.min(
    3_650,
    readPositiveInteger(
      overrides.retentionDays?.toString() || process.env.WORKER_TRACKING_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS
    )
  );
  const requestedBatchSize = readPositiveInteger(
    overrides.batchSize?.toString() || process.env.WORKER_TRACKING_PRUNE_BATCH_SIZE,
    DEFAULT_BATCH_SIZE
  );
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, requestedBatchSize));
  const now = overrides.now || new Date();
  return {
    retentionDays,
    batchSize,
    cutoff: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000),
  };
}

async function pruneLocationPingBatch(cutoff: Date, batchSize: number) {
  const rows = await prisma.workerLocationPing.findMany({
    where: { recordedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });
  if (!rows.length) return 0;
  const result = await prisma.workerLocationPing.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

async function pruneLiveLocationBatch(cutoff: Date, batchSize: number) {
  const rows = await prisma.workerLiveLocation.findMany({
    where: { recordedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });
  if (!rows.length) return 0;
  const result = await prisma.workerLiveLocation.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

async function drainBatches(
  deleteBatch: (cutoff: Date, batchSize: number) => Promise<number>,
  cutoff: Date,
  batchSize: number
) {
  let deleted = 0;
  while (true) {
    const batchDeleted = await deleteBatch(cutoff, batchSize);
    deleted += batchDeleted;
    if (batchDeleted < batchSize) return deleted;
  }
}

export async function pruneWorkerTrackingData(overrides: {
  retentionDays?: number;
  batchSize?: number;
  now?: Date;
} = {}) {
  const options = resolveTrackingRetentionOptions(overrides);
  const deletedWorkerLocationPings = await drainBatches(
    pruneLocationPingBatch,
    options.cutoff,
    options.batchSize
  );
  const deletedWorkerLiveLocations = await drainBatches(
    pruneLiveLocationBatch,
    options.cutoff,
    options.batchSize
  );

  return {
    retentionDays: options.retentionDays,
    batchSize: options.batchSize,
    cutoff: options.cutoff,
    deletedWorkerLocationPings,
    deletedWorkerLiveLocations,
  };
}
