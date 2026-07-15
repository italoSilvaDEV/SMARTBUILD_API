import type { Request, Response } from "express";

jest.mock("../../src/controllers/Files/fileAccess", () => ({
  getUserCompanyIds: jest.fn(),
  userHasAccessToCompany: jest.fn(),
}));

jest.mock("../../src/services/SocketService", () => ({
  SocketService: { emitToAll: jest.fn(), emitToCompany: jest.fn() },
}));

jest.mock("../../src/services/TrackingHealthService", () => ({
  acknowledgeTrackingReminderForAttendance: jest.fn(),
  markTrackingReminderRestored: jest.fn(),
}));

jest.mock("../../src/utils/prisma", () => {
  const transactionClient = {
    workerLocationPing: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    workerLiveLocation: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    userAttendance: { findUnique: jest.fn(), findMany: jest.fn() },
    workerLocationPing: { findUnique: jest.fn() },
    workerLiveLocation: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(transactionClient)),
    __transactionClient: transactionClient,
  };
  return { prisma };
});

import { WorkerTrackingController } from "../../src/controllers/tracking/WorkerTrackingController";
import { getUserCompanyIds } from "../../src/controllers/Files/fileAccess";
import { SocketService } from "../../src/services/SocketService";
import { markTrackingReminderRestored } from "../../src/services/TrackingHealthService";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;
const transactionClient = prismaMock.__transactionClient as any;

function createResponse() {
  const response: Partial<Response> = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response as Response;
}

function createAttendance(overrides: Record<string, unknown> = {}) {
  return {
    id: "attendance-1",
    user_id: "user-1",
    company_id: "company-1",
    check_in_time: new Date(Date.now() - 60 * 60_000),
    check_out_time: null,
    user_service_project_id: "usp-1",
    pending_project_id: null,
    pending_project_name: null,
    pending_project_latitude: null,
    pending_project_longitude: null,
    pending_project_radius: null,
    UserServiceProject: {
      id: "usp-1",
      service_project_id: "service-project-1",
      service_project: {
        id: "service-project-1",
        name: "Framing",
        Project: {
          id: "project-1",
          location: "Project 1",
          lat: "40.1",
          log: "-73.9",
          radius: 100,
          company_id: "company-1",
        },
      },
    },
    ...overrides,
  };
}

describe("WorkerTrackingController compatibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUserCompanyIds as jest.Mock).mockResolvedValue(["company-1"]);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      companies: [],
    });
    transactionClient.workerLocationPing.findUnique.mockResolvedValue(null);
    transactionClient.workerLocationPing.create.mockResolvedValue({ id: "ping-1" });
  });

  it("stores a delayed ping in history without replacing a newer live row", async () => {
    const attendance = createAttendance();
    const delayedAt = new Date(Date.now() - 20 * 60_000);
    const currentLive = {
      id: "live-1",
      companyId: "company-1",
      userId: "user-1",
      attendanceId: attendance.id,
      recordedAt: new Date(Date.now() - 5 * 60_000),
    };
    prismaMock.userAttendance.findUnique.mockResolvedValue(attendance);
    transactionClient.workerLiveLocation.updateMany.mockResolvedValue({ count: 0 });
    transactionClient.workerLiveLocation.findUnique.mockResolvedValue(currentLive);

    const request = {
      userId: "user-1",
      body: {
        latitude: 40.2,
        longitude: -73.8,
        attendanceId: attendance.id,
        recordedAt: delayedAt.toISOString(),
      },
      header: jest.fn(),
    } as unknown as Request;
    const response = createResponse();

    await new WorkerTrackingController().handlePing(request, response);

    expect(transactionClient.workerLocationPing.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.workerLiveLocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          userId: "user-1",
          OR: expect.arrayContaining([
            { recordedAt: { lte: delayedAt } },
          ]),
        }),
      })
    );
    expect(transactionClient.workerLiveLocation.create).not.toHaveBeenCalled();
    expect(markTrackingReminderRestored).not.toHaveBeenCalled();
    expect(SocketService.emitToAll).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pingId: "ping-1",
        liveLocation: currentLive,
        liveUpdated: false,
      })
    );
  });

  it("accepts a just-closed final ping as history-only", async () => {
    const closedAt = new Date(Date.now() - 5 * 60_000);
    const attendance = createAttendance({ check_out_time: closedAt });
    prismaMock.userAttendance.findUnique.mockResolvedValue(attendance);

    const request = {
      userId: "user-1",
      body: {
        latitude: 40.2,
        longitude: -73.8,
        attendanceId: attendance.id,
        recordedAt: closedAt.toISOString(),
        source: "manual-clock-out",
      },
      header: jest.fn(),
    } as unknown as Request;
    const response = createResponse();

    await new WorkerTrackingController().handlePing(request, response);

    expect(transactionClient.workerLocationPing.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.workerLiveLocation.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.workerLiveLocation.create).not.toHaveBeenCalled();
    expect(SocketService.emitToAll).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ liveLocation: null, liveUpdated: false })
    );
  });

  it("rejects an attendance owned by another authenticated user", async () => {
    prismaMock.userAttendance.findUnique.mockResolvedValue(
      createAttendance({ user_id: "another-user" })
    );
    const request = {
      userId: "user-1",
      body: {
        latitude: 40.2,
        longitude: -73.8,
        attendanceId: "attendance-1",
      },
      header: jest.fn(),
    } as unknown as Request;
    const response = createResponse();

    await new WorkerTrackingController().handlePing(request, response);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("updates Tracking 2.0 diagnostics in the same monotonic live write", async () => {
    const attendance = createAttendance();
    const recordedAt = new Date();
    const liveLocation = {
      id: "live-1",
      companyId: "company-1",
      userId: "user-1",
      attendanceId: attendance.id,
      recordedAt,
    };
    prismaMock.userAttendance.findUnique.mockResolvedValue(attendance);
    transactionClient.workerLiveLocation.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.workerLiveLocation.findUnique.mockResolvedValue(liveLocation);

    const request = {
      userId: "user-1",
      body: {
        latitude: 40.2,
        longitude: -73.8,
        attendanceId: attendance.id,
        recordedAt: recordedAt.toISOString(),
        protocolVersion: 2,
        diagnostics: {
          appVersion: "2.36.0",
          platform: "ios",
          queueDepth: 4,
          permissions: { foreground: "granted", background: "granted" },
          services: { locationEnabled: true },
          taskState: { backgroundRegistered: true },
        },
      },
      header: jest.fn(),
    } as unknown as Request;
    const response = createResponse();

    await new WorkerTrackingController().handlePing(request, response);

    expect(transactionClient.workerLiveLocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolVersion: 2,
          appVersion: "2.36.0",
          platform: "ios",
          queueDepth: 4,
          permissions: { foreground: "granted", background: "granted" },
          services: { locationEnabled: true },
          taskState: { backgroundRegistered: true },
        }),
      })
    );
    expect(transactionClient.workerLocationPing.create).toHaveBeenCalledTimes(1);
    expect(SocketService.emitToCompany).toHaveBeenCalledWith(
      "company-1",
      "live_tracking_updated",
      expect.objectContaining({ workerId: "user-1" })
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });
});
