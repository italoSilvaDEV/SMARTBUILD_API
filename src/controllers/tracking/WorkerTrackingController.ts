import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";

function parseRequestedDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsed;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export class WorkerTrackingController {
  async handlePing(req: Request, res: Response): Promise<Response> {
    try {
      const authUserId = (req as any).userId as string | undefined;
      if (!authUserId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        latitude,
        longitude,
        recordedAt,
        accuracyMeters,
        speedMetersPerSecond,
        headingDegrees,
        batteryLevel,
        isInsideSite,
        attendanceId,
        userServiceProjectId,
        serviceProjectId,
        projectId,
        projectName,
        serviceTitle,
        projectLatitude,
        projectLongitude,
        projectRadiusMeters,
        source,
        companyId: bodyCompanyId,
      } = req.body || {};

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({ error: "latitude and longitude are required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: authUserId },
        select: { id: true, company_id: true },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let resolvedCompanyId = bodyCompanyId || user.company_id || null;
      if (!resolvedCompanyId && attendanceId) {
        const attendance = await prisma.userAttendance.findUnique({
          where: { id: attendanceId },
          select: { company_id: true },
        });
        resolvedCompanyId = attendance?.company_id || null;
      }

      if (!resolvedCompanyId) {
        return res.status(400).json({ error: "Company could not be resolved for tracking ping" });
      }

      const pingRecordedAt = recordedAt ? new Date(recordedAt) : new Date();
      if (Number.isNaN(pingRecordedAt.getTime())) {
        return res.status(400).json({ error: "Invalid recordedAt" });
      }

      const payload = {
        companyId: resolvedCompanyId,
        userId: authUserId,
        attendanceId: attendanceId || null,
        userServiceProjectId: userServiceProjectId || null,
        serviceProjectId: serviceProjectId || null,
        projectId: projectId || null,
        projectName: projectName || null,
        serviceTitle: serviceTitle || null,
        projectLatitude: Number.isFinite(projectLatitude) ? Number(projectLatitude) : null,
        projectLongitude: Number.isFinite(projectLongitude) ? Number(projectLongitude) : null,
        projectRadiusMeters: Number.isFinite(projectRadiusMeters) ? Number(projectRadiusMeters) : null,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracyMeters: Number.isFinite(accuracyMeters) ? Number(accuracyMeters) : null,
        speedMetersPerSecond: Number.isFinite(speedMetersPerSecond) ? Number(speedMetersPerSecond) : null,
        headingDegrees: Number.isFinite(headingDegrees) ? Number(headingDegrees) : null,
        batteryLevel: Number.isFinite(batteryLevel) ? Number(batteryLevel) : null,
        isInsideSite: typeof isInsideSite === "boolean" ? isInsideSite : null,
        source: source || "mobile",
        recordedAt: pingRecordedAt,
      };

      const [liveLocation, ping] = await prisma.$transaction([
        prisma.workerLiveLocation.upsert({
          where: {
            companyId_userId: {
              companyId: resolvedCompanyId,
              userId: authUserId,
            },
          },
          create: payload,
          update: payload,
        }),
        prisma.workerLocationPing.create({
          data: payload,
        }),
      ]);

      SocketService.emitToAll("live_tracking_updated", {
        companyId: resolvedCompanyId,
        workerId: authUserId,
        emittedAt: new Date().toISOString(),
        source: "worker_tracking_ping",
      });

      return res.status(201).json({
        message: "Tracking ping saved successfully",
        liveLocation,
        pingId: ping.id,
      });
    } catch (error) {
      console.error("[WorkerTrackingController.handlePing] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async handleHistoryByWorker(req: Request, res: Response): Promise<Response> {
    try {
      const { workerId } = req.params;
      const requestedDate = parseRequestedDate(req.query.date);
      const requestedCompanyId = typeof req.query.companyId === "string" ? req.query.companyId : null;
      const authUserId = (req as any).userId as string | undefined;

      if (!workerId) {
        return res.status(400).json({ error: "workerId is required" });
      }

      const authUser = authUserId
        ? await prisma.user.findUnique({
            where: { id: authUserId },
            select: { company_id: true },
          })
        : null;

      const companyId = requestedCompanyId || authUser?.company_id || null;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }

      const effectiveDate = requestedDate || new Date();
      const start = startOfDay(effectiveDate);
      const end = endOfDay(effectiveDate);

      const pings = await prisma.workerLocationPing.findMany({
        where: {
          companyId,
          userId: workerId,
          recordedAt: {
            gte: start,
            lte: end,
          },
        },
        orderBy: {
          recordedAt: "asc",
        },
      });

      return res.status(200).json({
        companyId,
        workerId,
        date: effectiveDate.toISOString().split("T")[0],
        total: pings.length,
        pings,
      });
    } catch (error) {
      console.error("[WorkerTrackingController.handleHistoryByWorker] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
