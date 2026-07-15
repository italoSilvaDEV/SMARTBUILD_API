jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    workerLocationPing: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workerLiveLocation: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { pruneWorkerTrackingData } from "../../src/services/TrackingRetentionService";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;

describe("tracking retention batching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes history in bounded batches instead of one large transaction", async () => {
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({ id: `ping-${index}` }));
    const finalBatch = [{ id: "ping-final-1" }, { id: "ping-final-2" }];
    prismaMock.workerLocationPing.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(finalBatch);
    prismaMock.workerLocationPing.deleteMany
      .mockResolvedValueOnce({ count: firstBatch.length })
      .mockResolvedValueOnce({ count: finalBatch.length });
    prismaMock.workerLiveLocation.findMany.mockResolvedValue([]);

    const result = await pruneWorkerTrackingData({
      retentionDays: 7,
      batchSize: 100,
      now: new Date("2026-07-15T12:00:00.000Z"),
    });

    expect(prismaMock.workerLocationPing.deleteMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        retentionDays: 7,
        batchSize: 100,
        deletedWorkerLocationPings: 102,
        deletedWorkerLiveLocations: 0,
      })
    );
  });
});
