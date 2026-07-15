import { Request, Response } from "express";
import { Prisma, type WorkerLocationPing } from "@prisma/client";
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
import { getUserCompanyIds } from "../Files/fileAccess";

const CLOSED_ATTENDANCE_FINAL_PING_GRACE_MINUTES = 15;
const LIVE_PING_MAX_FUTURE_SKEW_MINUTES = 5;
const TRACKING_TRANSACTION_MAX_ATTEMPTS = 2;

type TrackingAttendanceContext = {
  id: string;
  user_id: string;
  company_id: string | null;
  check_in_time: Date;
  check_out_time: Date | null;
  user_service_project_id: string | null;
  pending_project_id: string | null;
  pending_project_name: string | null;
  pending_project_latitude: number | null;
  pending_project_longitude: number | null;
  pending_project_radius: number | null;
  UserServiceProject: {
    id: string;
    service_project_id: string | null;
    service_project: {
      id: string;
      name: string | null;
      company_id: string | null;
      Project: {
        id: string;
        location: string | null;
        lat: string | null;
        log: string | null;
        radius: number | null;
        company_id: string | null;
      } | null;
    } | null;
  } | null;
};

const trackingAttendanceSelect = {
  id: true,
  user_id: true,
  company_id: true,
  check_in_time: true,
  check_out_time: true,
  user_service_project_id: true,
  pending_project_id: true,
  pending_project_name: true,
  pending_project_latitude: true,
  pending_project_longitude: true,
  pending_project_radius: true,
  UserServiceProject: {
    select: {
      id: true,
      service_project_id: true,
          service_project: {
            select: {
              id: true,
              name: true,
              company_id: true,
              Project: {
            select: {
              id: true,
              location: true,
              lat: true,
              log: true,
              radius: true,
              company_id: true,
            },
          },
        },
      },
    },
  },
} as const;

function resolveAttendanceCompanyId(attendance: TrackingAttendanceContext | null) {
  return (
    attendance?.company_id ||
    attendance?.UserServiceProject?.service_project?.company_id ||
    attendance?.UserServiceProject?.service_project?.Project?.company_id ||
    null
  );
}

export function isRecentlyClosedAttendance(
  attendance: Pick<TrackingAttendanceContext, "check_out_time">,
  now = new Date()
) {
  if (!attendance.check_out_time) return false;
  const ageMs = now.getTime() - attendance.check_out_time.getTime();
  return ageMs >= -60_000 && ageMs <= CLOSED_ATTENDANCE_FINAL_PING_GRACE_MINUTES * 60_000;
}

export function shouldPublishTrackingPingLive(
  attendance: Pick<TrackingAttendanceContext, "check_in_time" | "check_out_time"> | null,
  pingRecordedAt: Date,
  serverReceivedAt = new Date()
) {
  return (
    !!attendance &&
    attendance.check_out_time == null &&
    pingRecordedAt.getTime() >= attendance.check_in_time.getTime() &&
    pingRecordedAt.getTime() <=
      serverReceivedAt.getTime() + LIVE_PING_MAX_FUTURE_SKEW_MINUTES * 60_000
  );
}

function normalizeOptionalString(value: unknown, maxLength = 191): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeProtocolVersion(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 1000) return parsed;
  }
  return null;
}

function normalizeQueueDepth(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) return undefined;
  return parsed;
}

function normalizeDiagnosticJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || Buffer.byteLength(serialized, "utf8") > 4_096) return undefined;
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

function isUniqueConstraintError(error: any) {
  return error?.code === "P2002";
}

function isRetryableTrackingTransactionError(error: any) {
  return isUniqueConstraintError(error) || error?.code === "P2034";
}

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
        clientEventId: rawClientEventId,
        clientPingId,
        protocolVersion: rawProtocolVersion,
        trackingProtocolVersion,
        protocol,
        diagnostics: rawDiagnostics,
        appVersion: rawAppVersion,
        platform: rawPlatform,
        queueDepth: rawQueueDepth,
        permissions: rawPermissions,
        services: rawServices,
        taskState: rawTaskState,
      } = req.body || {};

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({ error: "latitude and longitude are required" });
      }

      if (Number(latitude) < -90 || Number(latitude) > 90 || Number(longitude) < -180 || Number(longitude) > 180) {
        return res.status(400).json({ error: "latitude or longitude is outside the valid range" });
      }

      const user = await prisma.user.findUnique({
        where: { id: authUserId },
        select: {
          id: true,
          company_id: true,
          companies: { select: { companyId: true } },
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const normalizedBodyCompanyId = normalizeOptionalString(bodyCompanyId);
      const userCompanyIds = Array.from(
        new Set(
          [
            user.company_id,
            ...(user.companies || []).map((company) => company.companyId),
          ].filter((companyId): companyId is string => !!companyId)
        )
      );
      if (normalizedBodyCompanyId && !userCompanyIds.includes(normalizedBodyCompanyId)) {
        return res.status(403).json({ error: "User does not have access to this company" });
      }

      const hasExplicitAttendanceId = typeof attendanceId === "string" && !!attendanceId.trim();
      let attendance: TrackingAttendanceContext | null = null;
      if (hasExplicitAttendanceId) {
        attendance = (await prisma.userAttendance.findUnique({
          where: { id: String(attendanceId).trim() },
          select: trackingAttendanceSelect,
        })) as TrackingAttendanceContext | null;

        if (!attendance) {
          return res.status(404).json({ error: "Attendance not found" });
        }
        if (attendance.user_id !== authUserId) {
          return res.status(403).json({ error: "Attendance does not belong to the authenticated user" });
        }
      } else {
        const openAttendances = (await prisma.userAttendance.findMany({
          where: {
            user_id: authUserId,
            check_out_time: null,
          },
          select: trackingAttendanceSelect,
          orderBy: { check_in_time: "desc" },
          take: 10,
        })) as TrackingAttendanceContext[];

        const normalizedUserServiceProjectId = normalizeOptionalString(userServiceProjectId);
        const normalizedServiceProjectId = normalizeOptionalString(serviceProjectId);
        attendance =
          openAttendances.find((candidate) =>
            normalizedUserServiceProjectId
              ? candidate.user_service_project_id === normalizedUserServiceProjectId
              : false
          ) ||
          openAttendances.find((candidate) =>
            normalizedServiceProjectId
              ? candidate.UserServiceProject?.service_project_id === normalizedServiceProjectId
              : false
          ) ||
          openAttendances.find((candidate) =>
            normalizedBodyCompanyId
              ? resolveAttendanceCompanyId(candidate) === normalizedBodyCompanyId
              : false
          ) ||
          openAttendances[0] ||
          null;
      }

      const pingRecordedAt = recordedAt ? new Date(recordedAt) : new Date();
      if (Number.isNaN(pingRecordedAt.getTime())) {
        return res.status(400).json({ error: "Invalid recordedAt" });
      }

      const inferredPingPredatesAttendance =
        !!attendance &&
        !hasExplicitAttendanceId &&
        pingRecordedAt.getTime() < attendance.check_in_time.getTime();
      const boundAttendance = inferredPingPredatesAttendance ? null : attendance;
      const attendanceCompanyId = resolveAttendanceCompanyId(boundAttendance);
      if (attendanceCompanyId && !userCompanyIds.includes(attendanceCompanyId)) {
        return res.status(403).json({ error: "User does not have access to the attendance company" });
      }

      const resolvedCompanyId =
        attendanceCompanyId ||
        normalizedBodyCompanyId ||
        (userCompanyIds.length === 1 ? userCompanyIds[0] : null);
      if (!resolvedCompanyId || !userCompanyIds.includes(resolvedCompanyId)) {
        return res.status(400).json({ error: "Company could not be resolved for tracking ping" });
      }

      const isFinalClosedAttendance = !!attendance && isRecentlyClosedAttendance(attendance);
      if (attendance?.check_out_time && !isFinalClosedAttendance) {
        return res.status(409).json({ error: "Attendance is already closed" });
      }

      const attendanceService = boundAttendance?.UserServiceProject?.service_project || null;
      const attendanceProject = attendanceService?.Project || null;
      const resolvedProjectId =
        attendanceProject?.id || boundAttendance?.pending_project_id || normalizeOptionalString(projectId);
      const resolvedProjectName =
        attendanceProject?.location ||
        boundAttendance?.pending_project_name ||
        normalizeOptionalString(projectName);
      const resolvedProjectLatitude =
        attendanceProject?.lat ??
        boundAttendance?.pending_project_latitude ??
        (Number.isFinite(projectLatitude) ? Number(projectLatitude) : null);
      const resolvedProjectLongitude =
        attendanceProject?.log ??
        boundAttendance?.pending_project_longitude ??
        (Number.isFinite(projectLongitude) ? Number(projectLongitude) : null);
      const resolvedProjectRadius =
        attendanceProject?.radius ??
        boundAttendance?.pending_project_radius ??
        (Number.isFinite(projectRadiusMeters) ? Number(projectRadiusMeters) : null);
      const clientEventId = normalizeOptionalString(rawClientEventId) || normalizeOptionalString(clientPingId);
      const protocolVersion = normalizeProtocolVersion(
        rawProtocolVersion,
        trackingProtocolVersion,
        protocol,
        req.header("x-tracking-protocol")
      );
      const diagnostics =
        rawDiagnostics && typeof rawDiagnostics === "object" && !Array.isArray(rawDiagnostics)
          ? (rawDiagnostics as Record<string, unknown>)
          : {};
      const appVersion = normalizeOptionalString(
        rawAppVersion ?? diagnostics.appVersion ?? req.header("x-app-version"),
        64
      );
      const platform = normalizeOptionalString(
        rawPlatform ?? diagnostics.platform ?? req.header("x-app-platform"),
        32
      );
      const queueDepth = normalizeQueueDepth(rawQueueDepth ?? diagnostics.queueDepth);
      const permissions = normalizeDiagnosticJson(rawPermissions ?? diagnostics.permissions);
      const services = normalizeDiagnosticJson(rawServices ?? diagnostics.services);
      const taskState = normalizeDiagnosticJson(rawTaskState ?? diagnostics.taskState);

      const livePayload = {
        companyId: resolvedCompanyId,
        userId: authUserId,
        attendanceId: boundAttendance?.id || null,
        userServiceProjectId:
          boundAttendance?.user_service_project_id || normalizeOptionalString(userServiceProjectId),
        serviceProjectId:
          boundAttendance?.UserServiceProject?.service_project_id || normalizeOptionalString(serviceProjectId),
        projectId: resolvedProjectId,
        projectName: resolvedProjectName,
        serviceTitle: attendanceService?.name || normalizeOptionalString(serviceTitle),
        projectLatitude: resolvedProjectLatitude != null ? Number(resolvedProjectLatitude) : null,
        projectLongitude: resolvedProjectLongitude != null ? Number(resolvedProjectLongitude) : null,
        projectRadiusMeters: resolvedProjectRadius != null ? Number(resolvedProjectRadius) : null,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracyMeters: Number.isFinite(accuracyMeters) ? Number(accuracyMeters) : null,
        speedMetersPerSecond: Number.isFinite(speedMetersPerSecond) ? Number(speedMetersPerSecond) : null,
        headingDegrees: Number.isFinite(headingDegrees) ? Number(headingDegrees) : null,
        batteryLevel: Number.isFinite(batteryLevel) ? Number(batteryLevel) : null,
        isInsideSite: typeof isInsideSite === "boolean" ? isInsideSite : null,
        source: normalizeOptionalString(source) || "mobile",
        protocolVersion: protocolVersion ?? undefined,
        appVersion: appVersion ?? undefined,
        platform: platform ?? undefined,
        queueDepth,
        permissions,
        services,
        taskState,
        recordedAt: pingRecordedAt,
      };

      const {
        appVersion: _appVersion,
        platform: _platform,
        queueDepth: _queueDepth,
        permissions: _permissions,
        services: _services,
        taskState: _taskState,
        ...historyLocationPayload
      } = livePayload;
      const historyPayload = { ...historyLocationPayload, clientEventId };
      const serverReceivedAt = new Date();
      const shouldPublishLive = shouldPublishTrackingPingLive(
        attendance,
        pingRecordedAt,
        serverReceivedAt
      );

      let persistenceResult: {
        liveLocation: any;
        ping: any;
        liveUpdated: boolean;
        deduplicated: boolean;
      } | null = null;

      for (let attempt = 1; attempt <= TRACKING_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
        try {
          persistenceResult = await prisma.$transaction(async (tx) => {
            const existingPing = clientEventId
              ? await tx.workerLocationPing.findUnique({
                  where: {
                    companyId_userId_clientEventId: {
                      companyId: resolvedCompanyId,
                      userId: authUserId,
                      clientEventId,
                    },
                  },
                })
              : null;

            const ping =
              existingPing ||
              (await tx.workerLocationPing.create({
                data: historyPayload,
              }));

            if (existingPing || !shouldPublishLive) {
              const liveLocation = shouldPublishLive
                ? await tx.workerLiveLocation.findUnique({
                    where: {
                      companyId_userId: { companyId: resolvedCompanyId, userId: authUserId },
                    },
                  })
                : null;
              return {
                liveLocation,
                ping,
                liveUpdated: false,
                deduplicated: !!existingPing,
              };
            }

            const updateResult = await tx.workerLiveLocation.updateMany({
              where: {
                companyId: resolvedCompanyId,
                userId: authUserId,
                OR: [
                  { recordedAt: { lte: pingRecordedAt } },
                  {
                    recordedAt: {
                      gt: new Date(
                        serverReceivedAt.getTime() +
                          LIVE_PING_MAX_FUTURE_SKEW_MINUTES * 60_000
                      ),
                    },
                  },
                ],
              },
              data: livePayload,
            });

            let liveUpdated = updateResult.count > 0;
            let liveLocation = await tx.workerLiveLocation.findUnique({
              where: {
                companyId_userId: { companyId: resolvedCompanyId, userId: authUserId },
              },
            });

            if (!liveLocation) {
              liveLocation = await tx.workerLiveLocation.create({ data: livePayload });
              liveUpdated = true;
            }

            return { liveLocation, ping, liveUpdated, deduplicated: false };
          });
          break;
        } catch (error) {
          if (!isRetryableTrackingTransactionError(error)) throw error;

          if (clientEventId && isUniqueConstraintError(error)) {
            const existingPing = await prisma.workerLocationPing.findUnique({
              where: {
                companyId_userId_clientEventId: {
                  companyId: resolvedCompanyId,
                  userId: authUserId,
                  clientEventId,
                },
              },
            });
            if (existingPing) {
              const liveLocation = shouldPublishLive
                ? await prisma.workerLiveLocation.findUnique({
                    where: {
                      companyId_userId: { companyId: resolvedCompanyId, userId: authUserId },
                    },
                  })
                : null;
              persistenceResult = {
                liveLocation,
                ping: existingPing,
                liveUpdated: false,
                deduplicated: true,
              };
              break;
            }
          }

          if (attempt === TRACKING_TRANSACTION_MAX_ATTEMPTS) throw error;
        }
      }

      if (!persistenceResult) {
        throw new Error("Tracking ping could not be persisted");
      }

      if (persistenceResult.liveUpdated && attendance?.id) {
        try {
          await markTrackingReminderRestored(authUserId, attendance.id);
        } catch (error) {
          console.error("[WorkerTrackingController.handlePing] Reminder restore failed:", error);
        }
      }

      if (persistenceResult.liveUpdated) {
        SocketService.emitToCompany(resolvedCompanyId, "live_tracking_updated", {
          companyId: resolvedCompanyId,
          workerId: authUserId,
          attendanceId: attendance?.id || null,
          emittedAt: new Date().toISOString(),
          source: "worker_tracking_ping",
        });
      }

      return res.status(201).json({
        message: "Tracking ping saved successfully",
        liveLocation: persistenceResult.liveLocation,
        pingId: persistenceResult.ping.id,
        liveUpdated: persistenceResult.liveUpdated,
        deduplicated: persistenceResult.deduplicated,
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

      if (!authUserId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!workerId) {
        return res.status(400).json({ error: "workerId is required" });
      }

      const companyIds = await getUserCompanyIds(authUserId);
      if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
        return res.status(403).json({ error: "User does not have access to this company" });
      }

      const companyId = requestedCompanyId || companyIds[0] || null;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }

      const effectiveDate = requestedDate || new Date();
      const { startUtc: start, endUtc: end } = getUtcRangeForLocalDate(
        effectiveDate,
        timezoneOffsetMinutes
      );

      const trackingPings = await prisma.workerLocationPing.findMany({
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

      const dateAttendances = await prisma.userAttendance.findMany({
        where: {
          user_id: workerId,
          check_in_time: { lte: end },
          OR: [{ check_out_time: null }, { check_out_time: { gte: start } }],
          AND: [
            {
              OR: [
                { company_id: companyId },
                {
                  UserServiceProject: {
                    service_project: {
                      OR: [{ company_id: companyId }, { Project: { company_id: companyId } }],
                    },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          check_in_time: true,
          check_out_time: true,
          user_service_project_id: true,
        },
        orderBy: { check_in_time: "asc" },
      });

      const legacyTimelineRows = await prisma.timeLine.findMany({
        where: {
          user_id: workerId,
          check_in_time: { gte: start, lte: end },
          service_project: {
            OR: [{ company_id: companyId }, { Project: { company_id: companyId } }],
          },
        },
        select: {
          id: true,
          userServiceProjectId: true,
          service_project_id: true,
          check_in_time: true,
          check_in_latitude: true,
          check_in_longitude: true,
          is_local_work: true,
          date_creation: true,
          service_project: {
            select: {
              name: true,
              projectId: true,
              Project: {
                select: {
                  id: true,
                  location: true,
                  lat: true,
                  log: true,
                  radius: true,
                },
              },
            },
          },
        },
        orderBy: { check_in_time: "asc" },
      });

      const legacyPings: WorkerLocationPing[] = legacyTimelineRows.map((row) => {
        const matchingAttendances = dateAttendances.filter(
          (attendance) =>
            row.check_in_time.getTime() >= attendance.check_in_time.getTime() &&
            (!attendance.check_out_time ||
              row.check_in_time.getTime() <= attendance.check_out_time.getTime())
        );
        const attendance =
          matchingAttendances.find(
            (candidate) => candidate.user_service_project_id === row.userServiceProjectId
          ) || matchingAttendances[matchingAttendances.length - 1] || null;
        const project = row.service_project.Project;

        return {
          id: row.id,
          companyId,
          userId: workerId,
          clientEventId: null,
          protocolVersion: null,
          attendanceId: attendance?.id || null,
          userServiceProjectId: row.userServiceProjectId,
          serviceProjectId: row.service_project_id,
          projectId: row.service_project.projectId || project?.id || null,
          projectName: project?.location || null,
          serviceTitle: row.service_project.name,
          projectLatitude: project?.lat != null ? Number(project.lat) : null,
          projectLongitude: project?.log != null ? Number(project.log) : null,
          projectRadiusMeters: project?.radius ?? null,
          latitude: row.check_in_latitude,
          longitude: row.check_in_longitude,
          accuracyMeters: null,
          speedMetersPerSecond: null,
          headingDegrees: null,
          batteryLevel: null,
          isInsideSite: row.is_local_work,
          source: "legacy-timeline",
          recordedAt: row.check_in_time,
          createdAt: row.date_creation,
        };
      });
      const deduplicationBucketMs = 15_000;
      const trackingPingsByTimeBucket = new Map<number, WorkerLocationPing[]>();
      for (const trackingPing of trackingPings) {
        const bucket = Math.floor(trackingPing.recordedAt.getTime() / deduplicationBucketMs);
        const rows = trackingPingsByTimeBucket.get(bucket) || [];
        rows.push(trackingPing);
        trackingPingsByTimeBucket.set(bucket, rows);
      }
      const legacyOnlyPings = legacyPings.filter((legacyPing) => {
        const bucket = Math.floor(legacyPing.recordedAt.getTime() / deduplicationBucketMs);
        for (const candidateBucket of [bucket - 1, bucket, bucket + 1]) {
          const candidates = trackingPingsByTimeBucket.get(candidateBucket) || [];
          if (
            candidates.some(
              (trackingPing) =>
                Math.abs(
                  trackingPing.recordedAt.getTime() - legacyPing.recordedAt.getTime()
                ) <= deduplicationBucketMs &&
                getDistanceMeters(
                  trackingPing.latitude,
                  trackingPing.longitude,
                  legacyPing.latitude,
                  legacyPing.longitude
                ) <= 10
            )
          ) {
            return false;
          }
        }
        return true;
      });
      const pings: WorkerLocationPing[] = [...trackingPings, ...legacyOnlyPings].sort(
        (left, right) => left.recordedAt.getTime() - right.recordedAt.getTime()
      );

      const attendanceIds = Array.from(
        new Set(pings.map((ping) => ping.attendanceId).filter((value): value is string => !!value))
      );
      const knownAttendanceIds = new Set(dateAttendances.map((attendance) => attendance.id));
      const missingAttendanceIds = attendanceIds.filter((id) => !knownAttendanceIds.has(id));
      const missingAttendances = missingAttendanceIds.length
        ? await prisma.userAttendance.findMany({
            where: { id: { in: missingAttendanceIds }, user_id: workerId },
            select: {
              id: true,
              check_in_time: true,
              check_out_time: true,
              user_service_project_id: true,
            },
          })
        : [];
      const attendanceMap = new Map(
        [...dateAttendances, ...missingAttendances]
          .filter((attendance) => attendanceIds.includes(attendance.id))
          .map((attendance) => [attendance.id, attendance])
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
        displayGeometrySegments: replay.displayGeometrySegments,
        displayGaps: replay.displayGaps,
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
