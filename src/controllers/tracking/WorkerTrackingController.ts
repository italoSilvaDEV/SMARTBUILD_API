import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";
import {
  acknowledgeTrackingReminderForAttendance,
  markTrackingReminderRestored,
} from "../../services/TrackingHealthService";
import {
  buildReplayMatchingResult,
  mapPingToReplayTrackPoint,
  ReplaySegmentBreakReason,
} from "../../services/MapboxReplayMatchingService";

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

function parseTimezoneOffsetMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function getUtcRangeForLocalDate(date: Date, timezoneOffsetMinutes = 0) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + timezoneOffsetMinutes * 60000);
  const endUtc = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) + timezoneOffsetMinutes * 60000);
  return { startUtc, endUtc };
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const originLat = toRadians(lat1);
  const destinationLat = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const REPLAY_SEGMENT_BREAK_MINUTES = 30;
const REPLAY_SEGMENT_BREAK_DISTANCE_METERS = 5000;

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

      await markTrackingReminderRestored(authUserId, attendanceId || null);

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
      const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(req.query.timezoneOffsetMinutes) ?? 0;
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
      const { startUtc: start, endUtc: end } = getUtcRangeForLocalDate(
        effectiveDate,
        timezoneOffsetMinutes
      );

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

      const attendanceIds = Array.from(
        new Set(pings.map((ping) => ping.attendanceId).filter((value): value is string => !!value))
      );
      const attendanceMap = new Map(
        (
          await prisma.userAttendance.findMany({
            where: {
              id: { in: attendanceIds },
            },
            select: {
              id: true,
              check_in_time: true,
              check_out_time: true,
            },
          })
        ).map((attendance) => [attendance.id, attendance])
      );

      const segments = pings.reduce<
        Array<{
          attendanceId?: string | null;
          checkInAt?: string | null;
          checkOutAt?: string | null;
          breakReason?: ReplaySegmentBreakReason | null;
          trackPoints: typeof pings;
        }>
      >((acc, ping) => {
        const previous = acc[acc.length - 1];
        const previousPoint = previous?.trackPoints[previous.trackPoints.length - 1];
        const gapMinutes = previousPoint
          ? (new Date(ping.recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime()) /
            60000
          : 0;
        const distanceMeters = previousPoint
          ? getDistanceMeters(
              previousPoint.latitude,
              previousPoint.longitude,
              ping.latitude,
              ping.longitude
            )
          : 0;
        const shouldStartNewSegment =
          !previous ||
          (previous.attendanceId || null) !== (ping.attendanceId || null) ||
          gapMinutes >= REPLAY_SEGMENT_BREAK_MINUTES ||
          distanceMeters >= REPLAY_SEGMENT_BREAK_DISTANCE_METERS;

        if (shouldStartNewSegment) {
          if (previous) {
            if ((previous.attendanceId || null) !== (ping.attendanceId || null)) {
              previous.breakReason = "attendance-change";
            } else if (
              gapMinutes >= REPLAY_SEGMENT_BREAK_MINUTES &&
              distanceMeters >= REPLAY_SEGMENT_BREAK_DISTANCE_METERS
            ) {
              previous.breakReason = "time-and-distance-gap";
            } else if (gapMinutes >= REPLAY_SEGMENT_BREAK_MINUTES) {
              previous.breakReason = "time-gap";
            } else if (distanceMeters >= REPLAY_SEGMENT_BREAK_DISTANCE_METERS) {
              previous.breakReason = "distance-gap";
            }
          }
          const attendance = ping.attendanceId ? attendanceMap.get(ping.attendanceId) : null;
          acc.push({
            attendanceId: ping.attendanceId || null,
            checkInAt: attendance?.check_in_time?.toISOString() || null,
            checkOutAt: attendance?.check_out_time?.toISOString() || null,
            breakReason: null,
            trackPoints: [ping],
          });
          return acc;
        }

        previous.trackPoints.push(ping);
        return acc;
      }, []);
      const replaySegments = segments.filter((segment) => !!segment.attendanceId);

      const projectSites = Array.from(
        pings.reduce((map, ping) => {
          const siteId = ping.projectId || ping.serviceProjectId;
          if (
            !siteId ||
            ping.projectLatitude == null ||
            ping.projectLongitude == null ||
            ping.projectRadiusMeters == null ||
            ping.projectRadiusMeters <= 0
          ) {
            return map;
          }

          if (!map.has(siteId)) {
            map.set(siteId, {
              id: siteId,
              name: ping.projectName || ping.serviceTitle || "Project site",
              lat: ping.projectLatitude,
              lng: ping.projectLongitude,
              radiusMeters: ping.projectRadiusMeters,
            });
          }

          return map;
        }, new Map<string, { id: string; name: string; lat: number; lng: number; radiusMeters: number }>())
      ).map(([, site]) => site);

      const replayInputSegments = replaySegments.map((segment) => ({
        attendanceId: segment.attendanceId || null,
        checkInAt: segment.checkInAt || null,
        checkOutAt: segment.checkOutAt || null,
        breakReason: segment.breakReason || null,
        trackPoints: segment.trackPoints.map(mapPingToReplayTrackPoint),
      }));
      const replay = await buildReplayMatchingResult({
        segments: replayInputSegments,
      });

      return res.status(200).json({
        companyId,
        workerId,
        date: effectiveDate.toISOString().split("T")[0],
        total: pings.length,
        segments: replay.matchedSegments,
        projectSites,
        rawTrackPoints: replay.rawTrackPoints,
        matchedGeometry: replay.matchedGeometry,
        displayGeometry: replay.displayGeometry,
        matchedSegments: replay.matchedSegments,
        tracepoints: replay.tracepoints,
        matchingMeta: replay.matchingMeta,
        replay,
        summary: replay.summary,
        pings,
      });
    } catch (error) {
      console.error("[WorkerTrackingController.handleHistoryByWorker] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async acknowledgeReminder(req: Request, res: Response): Promise<Response> {
    try {
      const authUserId = (req as any).userId as string | undefined;
      const { attendanceId } = req.body || {};

      if (!authUserId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!attendanceId || typeof attendanceId !== "string") {
        return res.status(400).json({ error: "attendanceId is required" });
      }

      await acknowledgeTrackingReminderForAttendance(authUserId, attendanceId);

      return res.status(200).json({ message: "Tracking reminder acknowledged" });
    } catch (error) {
      console.error("[WorkerTrackingController.acknowledgeReminder] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
