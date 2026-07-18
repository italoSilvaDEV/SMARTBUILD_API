jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    user: { findMany: jest.fn() },
    scheduleNotification: { createMany: jest.fn() },
  },
}));

jest.mock("../../src/services/PushNotificationService", () => ({
  PushNotificationService: { sendPushNotifications: jest.fn() },
}));

jest.mock("../../src/services/SocketService", () => ({
  SocketService: { emitToUser: jest.fn() },
}));

import { SchedulePushNotificationService } from "../../src/services/SchedulePushNotificationService";
import { PushNotificationService } from "../../src/services/PushNotificationService";
import { prisma } from "../../src/utils/prisma";
import { SocketService } from "../../src/services/SocketService";

const prismaMock = prisma as any;

describe("schedule push compatibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([
      { id: "worker-1", expoPushToken: "ExponentPushToken[worker-device]" },
    ]);
    prismaMock.scheduleNotification.createMany.mockResolvedValue({ count: 1 });
    (PushNotificationService.sendPushNotifications as jest.Mock).mockResolvedValue(undefined);
  });

  it("resolves the employee device directly from the assigned user id", async () => {
    await SchedulePushNotificationService.sendToEmails({
      userIds: ["worker-1"],
      title: "New service assigned",
      body: "You were assigned to Framing.",
      data: { type: "service_assignment" },
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ id: { in: ["worker-1"] } }]),
        }),
      })
    );
    expect(PushNotificationService.sendPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        to: "ExponentPushToken[worker-device]",
        data: { type: "service_assignment" },
      }),
    ]);
    expect(prismaMock.scheduleNotification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: "worker-1", type: "service_assignment" })],
    });
    expect(SocketService.emitToUser).toHaveBeenCalledWith(
      "worker-1",
      "new_schedule_notification",
      { type: "service_assignment" }
    );
  });
});
