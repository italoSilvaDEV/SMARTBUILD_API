jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    userAttendance: { findMany: jest.fn() },
    workerLiveLocation: { findMany: jest.fn() },
    workerTrackingReminder: { findMany: jest.fn(), create: jest.fn() },
    timeLine: { groupBy: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock("../../src/services/PushNotificationService", () => ({
  PushNotificationService: { sendPushNotifications: jest.fn() },
}));

import { runTrackingHealthCheckJob } from "../../src/services/TrackingHealthService";
import { PushNotificationService } from "../../src/services/PushNotificationService";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;

function openAttendance() {
  return {
    id: "attendance-1",
    company_id: "company-1",
    user_id: "user-1",
    user_service_project_id: "usp-1",
    check_in_time: new Date(Date.now() - 30 * 60_000),
    user: {
      id: "user-1",
      name: "Taylor Worker",
      expoPushToken: "ExponentPushToken[test]",
    },
  };
}

describe("tracking health job compatibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.userAttendance.findMany
      .mockResolvedValueOnce([openAttendance()])
      .mockResolvedValueOnce([]);
    prismaMock.workerLiveLocation.findMany.mockResolvedValue([]);
    prismaMock.workerTrackingReminder.findMany.mockResolvedValue([]);
    prismaMock.workerTrackingReminder.create.mockResolvedValue({ id: "reminder-1" });
    prismaMock.timeLine.groupBy.mockResolvedValue([]);
    prismaMock.timeLine.findMany.mockResolvedValue([]);
    (PushNotificationService.sendPushNotifications as jest.Mock).mockResolvedValue(undefined);
  });

  it("sends the first recovery reminder when an open attendance never produced a ping", async () => {
    await runTrackingHealthCheckJob();

    expect(PushNotificationService.sendPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        to: "ExponentPushToken[test]",
        data: {
          type: "tracking_health_check",
          attendanceId: "attendance-1",
        },
      }),
    ]);
    expect(prismaMock.workerTrackingReminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1",
        userId: "user-1",
        attendanceId: "attendance-1",
        reminderNumber: 1,
      }),
    });
  });

  it("treats a recent legacy timeline sample as healthy for pre-ping apps", async () => {
    const recordedAt = new Date(Date.now() - 2 * 60_000);
    prismaMock.timeLine.groupBy.mockResolvedValue([
      {
        user_id: "user-1",
        userServiceProjectId: "usp-1",
        _max: { check_in_time: recordedAt },
      },
    ]);
    prismaMock.timeLine.findMany.mockResolvedValue([
      {
        id: "timeline-1",
        user_id: "user-1",
        userServiceProjectId: "usp-1",
        service_project_id: "service-project-1",
        check_in_time: recordedAt,
        check_in_latitude: 40.1,
        check_in_longitude: -73.9,
        is_local_work: true,
      },
    ]);

    await runTrackingHealthCheckJob();

    expect(PushNotificationService.sendPushNotifications).not.toHaveBeenCalled();
    expect(prismaMock.workerTrackingReminder.create).not.toHaveBeenCalled();
  });

  it("does not query Timeline when the attendance has a valid modern live row", async () => {
    prismaMock.workerLiveLocation.findMany.mockResolvedValue([
      {
        companyId: "company-1",
        userId: "user-1",
        attendanceId: "attendance-1",
        recordedAt: new Date(Date.now() - 2 * 60_000),
      },
    ]);

    await runTrackingHealthCheckJob();

    expect(prismaMock.timeLine.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.timeLine.findMany).not.toHaveBeenCalled();
    expect(PushNotificationService.sendPushNotifications).not.toHaveBeenCalled();
  });
});
