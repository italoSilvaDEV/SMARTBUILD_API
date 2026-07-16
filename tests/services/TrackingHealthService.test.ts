jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    userAttendance: {
      findFirst: jest.fn(),
    },
    workerTrackingReminder: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("../../src/services/PushNotificationService", () => ({
  PushNotificationService: {
    sendPushNotifications: jest.fn(),
  },
}));

import { prisma } from "../../src/utils/prisma";
import { markTrackingReminderRestored } from "../../src/services/TrackingHealthService";

describe("TrackingHealthService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("markTrackingReminderRestored", () => {
    it("restores any open reminder for the attendance even after the worker acknowledged it", async () => {
      await markTrackingReminderRestored("worker-1", "attendance-1");

      expect((prisma as any).workerTrackingReminder.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "worker-1",
          attendanceId: "attendance-1",
          restoredAt: null,
        },
        data: {
          restoredAt: expect.any(Date),
        },
      });
    });
  });
});
