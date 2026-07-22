jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    scheduleNotification: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import { ScheduleNotificationController } from "../../src/controllers/jobSchedule/ScheduleNotificationController";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;
const response = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
}) as any;

describe("schedule notification controller compatibility", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the authenticated employee unread schedule count", async () => {
    prismaMock.scheduleNotification.count.mockResolvedValue(3);
    const res = response();

    await new ScheduleNotificationController().unreadCount(
      { userId: "worker-1" } as any,
      res
    );

    expect(prismaMock.scheduleNotification.count).toHaveBeenCalledWith({
      where: { userId: "worker-1", readAt: null },
    });
    expect(res.json).toHaveBeenCalledWith({ unreadCount: 3 });
  });

  it("marks every schedule notification as read when Schedule is opened", async () => {
    prismaMock.scheduleNotification.updateMany.mockResolvedValue({ count: 2 });
    const res = response();

    await new ScheduleNotificationController().markAllAsRead(
      { userId: "worker-1" } as any,
      res
    );

    expect(prismaMock.scheduleNotification.updateMany).toHaveBeenCalledWith({
      where: { userId: "worker-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(res.json).toHaveBeenCalledWith({ updatedCount: 2 });
  });
});
