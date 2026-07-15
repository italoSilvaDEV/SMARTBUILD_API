import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import {
  getLiveLocationForAttendance,
  getTrackingHealthSnapshot,
} from "../../services/TrackingHealthService";
import { userHasAccessToCompany } from "../Files/fileAccess";
import {
  getLatestLegacyTrackingFallbacks,
  type LegacyTrackingFallbackRow,
} from "../../services/LegacyTrackingFallbackService";

type TrackingSourceRow = {
  id: string;
  companyId: string;
  userId: string;
  attendanceId: string | null;
  userServiceProjectId: string | null;
  serviceProjectId: string | null;
  projectId: string | null;
  projectName: string | null;
  serviceTitle: string | null;
  projectLatitude: number | null;
  projectLongitude: number | null;
  projectRadiusMeters: number | null;
  latitude: number;
  longitude: number;
  isInsideSite: boolean | null;
  source?: string | null;
  protocolVersion?: number | null;
  appVersion?: string | null;
  platform?: string | null;
  queueDepth?: number | null;
  permissions?: unknown;
  services?: unknown;
  taskState?: unknown;
  recordedAt: Date;
};

type OpenAttendanceRow = {
  id: string;
  company_id: string | null;
  user_id: string;
  check_in_time: Date;
  user_service_project_id?: string | null;
  check_in_address?: string | null;
  check_in_latitude?: number;
  check_in_longitude?: number;
  pending_project_id?: string | null;
  pending_project_name?: string | null;
  pending_project_latitude?: number | null;
  pending_project_longitude?: number | null;
  pending_project_radius?: number | null;
  UserServiceProject?: {
    id: string;
    service_project_id: string | null;
    service_project?: {
      id: string;
      name: string | null;
      Project?: {
        id: string;
        location: string | null;
        lat: string | null;
        log: string | null;
        radius: number | null;
      } | null;
    } | null;
  } | null;
};

type LegacyTimelineRow = {
  id: string;
  user_id: string;
  userServiceProjectId: string;
  service_project_id: string;
  check_in_time: Date;
  check_in_latitude: number;
  check_in_longitude: number;
  is_local_work: boolean;
};

type HistoricalLegacyTimelineRow = LegacyTimelineRow & {
  service_project: {
    name: string | null;
    projectId: string | null;
    Project: {
      id: string;
      location: string | null;
      lat: string | null;
      log: string | null;
      radius: number | null;
    } | null;
  };
};

type ProjectSiteRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
};

const AVATAR_URL_CACHE_TTL_MS = 10 * 60_000;
const AVATAR_URL_CACHE_ERROR_TTL_MS = 60_000;
const AVATAR_URL_CACHE_MAX_ENTRIES = 2_000;
const PROJECT_SITES_CACHE_TTL_MS = 60_000;
const PROJECT_SITES_CACHE_MAX_ENTRIES = 250;

type AsyncCacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const avatarUrlCache = new Map<string, AsyncCacheEntry<string | undefined>>();
const projectSitesCache = new Map<string, AsyncCacheEntry<ProjectSiteRow[]>>();

function evictOldestEntries<T>(cache: Map<string, AsyncCacheEntry<T>>, maximum: number) {
  while (cache.size >= maximum) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

async function getCachedAvatarUrl(avatarKey: string) {
  const now = Date.now();
  const cached = avatarUrlCache.get(avatarKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) avatarUrlCache.delete(avatarKey);
  evictOldestEntries(avatarUrlCache, AVATAR_URL_CACHE_MAX_ENTRIES);

  const value = getPresignedUrl(avatarKey)
    .then((url) => {
      const entry = avatarUrlCache.get(avatarKey);
      if (entry) entry.expiresAt = Date.now() + AVATAR_URL_CACHE_TTL_MS;
      return url;
    })
    .catch(() => {
      const entry = avatarUrlCache.get(avatarKey);
      if (entry) entry.expiresAt = Date.now() + AVATAR_URL_CACHE_ERROR_TTL_MS;
      return undefined;
    });
  avatarUrlCache.set(avatarKey, {
    value,
    expiresAt: now + AVATAR_URL_CACHE_TTL_MS,
  });
  return value;
}

async function getCachedProjectSites(companyId: string) {
  const now = Date.now();
  const cached = projectSitesCache.get(companyId);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) projectSitesCache.delete(companyId);
  evictOldestEntries(projectSitesCache, PROJECT_SITES_CACHE_MAX_ENTRIES);

  const value = prisma.project
    .findMany({
      where: {
        company_id: companyId,
        status_project: {
          in: ["In Progress", "Pre-Start", "Final walkthrough"],
        },
      },
      select: {
        id: true,
        location: true,
        lat: true,
        log: true,
        radius: true,
      },
      orderBy: { location: "asc" },
    })
    .then((projects) =>
      projects
        .map((project) => ({
          id: project.id,
          name: project.location || "Project site",
          lat: project.lat != null ? Number(project.lat) : null,
          lng: project.log != null ? Number(project.log) : null,
          radiusMeters: project.radius != null ? Number(project.radius) : null,
        }))
        .filter(
          (project): project is ProjectSiteRow =>
            project.lat != null &&
            project.lng != null &&
            project.radiusMeters != null &&
            project.radiusMeters > 0
        )
    )
    .catch((error) => {
      projectSitesCache.delete(companyId);
      throw error;
    });
  projectSitesCache.set(companyId, {
    value,
    expiresAt: now + PROJECT_SITES_CACHE_TTL_MS,
  });
  return value;
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

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(left: Pick<TrackingSourceRow, "latitude" | "longitude">, right: Pick<TrackingSourceRow, "latitude" | "longitude">) {
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLng = toRadians(right.longitude - left.longitude);
  const leftLat = toRadians(left.latitude);
  const rightLat = toRadians(right.latitude);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function mergeDeduplicatedTrackingRows(
  trackingRows: TrackingSourceRow[],
  legacyRows: TrackingSourceRow[]
) {
  const bucketSizeMs = 15_000;
  const modernRowsByWorkerAndTime = new Map<string, TrackingSourceRow[]>();
  for (const row of trackingRows) {
    const bucket = Math.floor(row.recordedAt.getTime() / bucketSizeMs);
    const key = `${row.userId}:${bucket}`;
    const rows = modernRowsByWorkerAndTime.get(key) || [];
    rows.push(row);
    modernRowsByWorkerAndTime.set(key, rows);
  }

  const legacyOnlyRows = legacyRows.filter((legacyRow) => {
    const bucket = Math.floor(legacyRow.recordedAt.getTime() / bucketSizeMs);
    for (const candidateBucket of [bucket - 1, bucket, bucket + 1]) {
      const modernRows =
        modernRowsByWorkerAndTime.get(`${legacyRow.userId}:${candidateBucket}`) || [];
      if (
        modernRows.some(
          (modernRow) =>
            Math.abs(modernRow.recordedAt.getTime() - legacyRow.recordedAt.getTime()) <=
              bucketSizeMs && distanceMeters(modernRow, legacyRow) <= 10
        )
      ) {
        return false;
      }
    }
    return true;
  });

  return [...trackingRows, ...legacyOnlyRows].sort((left, right) => {
    const workerComparison = left.userId.localeCompare(right.userId);
    return workerComparison || left.recordedAt.getTime() - right.recordedAt.getTime();
  });
}

async function buildProjectContext(sourceRows: TrackingSourceRow[]) {
  const serviceProjectIds = Array.from(
    new Set(sourceRows.map((row) => row.serviceProjectId).filter((value): value is string => !!value))
  );
  const projectIds = Array.from(
    new Set(sourceRows.map((row) => row.projectId).filter((value): value is string => !!value))
  );

  const [serviceProjects, projects] = await Promise.all([
    serviceProjectIds.length
      ? prisma.serviceProject.findMany({
          where: { id: { in: serviceProjectIds } },
          select: {
            id: true,
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
        })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true,
            location: true,
            lat: true,
            log: true,
            radius: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const projectMap = new Map(
    projects.map((project) => [
      project.id,
      {
        id: project.id,
        name: project.location || "Project site",
        lat: project.lat != null ? Number(project.lat) : null,
        lng: project.log != null ? Number(project.log) : null,
        radiusMeters: project.radius != null ? Number(project.radius) : null,
      },
    ])
  );

  const serviceProjectMap = new Map(
    serviceProjects.map((serviceProject) => [
      serviceProject.id,
      {
        id: serviceProject.id,
        name: serviceProject.name,
        projectId: serviceProject.projectId || serviceProject.Project?.id || null,
        projectName: serviceProject.Project?.location || null,
        lat: serviceProject.Project?.lat != null ? Number(serviceProject.Project.lat) : null,
        lng: serviceProject.Project?.log != null ? Number(serviceProject.Project.log) : null,
        radiusMeters:
          serviceProject.Project?.radius != null ? Number(serviceProject.Project.radius) : null,
      },
    ])
  );

  return { serviceProjectMap, projectMap };
}

export class GetLiveTrackingByCompanyController {
  async handle(req: Request, res: Response) {
    const { companyId } = req.params;
    const authUserId = (req as any).userId as string | undefined;
    const requestedDate = parseRequestedDate(req.query.date);
    const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(req.query.timezoneOffsetMinutes) ?? 0;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    if (!authUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      if (!(await userHasAccessToCompany(authUserId, companyId))) {
        return res.status(403).json({ error: "User does not have access to this company" });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const effectiveDate = requestedDate || new Date();
      const { startUtc: start, endUtc: end } = getUtcRangeForLocalDate(
        effectiveDate,
        timezoneOffsetMinutes
      );
      const localToday = new Date(Date.now() - timezoneOffsetMinutes * 60000);
      const effectiveLocalDate = new Date(
        Date.UTC(
          effectiveDate.getFullYear(),
          effectiveDate.getMonth(),
          effectiveDate.getDate(),
          12,
          0,
          0,
          0
        )
      );
      const useLiveLocations = isSameDay(effectiveLocalDate, localToday);

      const rawOpenAttendances: OpenAttendanceRow[] = useLiveLocations
        ? ((await prisma.userAttendance.findMany({
            where: {
              check_out_time: null,
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
            select: {
              id: true,
              company_id: true,
              user_id: true,
              check_in_time: true,
              user_service_project_id: true,
              check_in_address: true,
              check_in_latitude: true,
              check_in_longitude: true,
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
              },
            },
            orderBy: {
              check_in_time: "desc",
            },
          })) as OpenAttendanceRow[])
        : [];

      const openAttendances = Array.from(
        rawOpenAttendances.reduce((byWorker, attendance) => {
          if (!byWorker.has(attendance.user_id)) {
            byWorker.set(attendance.user_id, attendance);
          }
          return byWorker;
        }, new Map<string, OpenAttendanceRow>()).values()
      );

      const liveRows: TrackingSourceRow[] = useLiveLocations && openAttendances.length
        ? await prisma.workerLiveLocation.findMany({
            where: {
              companyId,
              userId: {
                in: openAttendances.map((attendance) => attendance.user_id),
              },
            },
            orderBy: [{ recordedAt: "desc" }],
          })
        : [];
      const liveRowByWorker = new Map(
        liveRows.map((row) => [`${row.companyId}:${row.userId}`, row])
      );
      const validLiveRowByAttendanceId = new Map<string, TrackingSourceRow>();
      const fallbackAttendances = openAttendances.filter((attendance) => {
        const liveRow = getLiveLocationForAttendance(
          attendance,
          liveRowByWorker.get(`${companyId}:${attendance.user_id}`) || null
        );
        if (liveRow) {
          validLiveRowByAttendanceId.set(attendance.id, liveRow);
          return false;
        }
        return true;
      });
      const legacyFallbackRowsByAttendance = useLiveLocations
        ? await getLatestLegacyTrackingFallbacks(fallbackAttendances)
        : new Map<string, LegacyTrackingFallbackRow>();

      const trackingHistoryRows: TrackingSourceRow[] = !useLiveLocations
        ? await prisma.workerLocationPing.findMany({
            where: {
              companyId,
              recordedAt: {
                gte: start,
                lte: end,
              },
            },
            orderBy: [
              { userId: "asc" },
              { recordedAt: "asc" },
            ],
          })
        : [];
      const historicalLegacyTimelineRows: HistoricalLegacyTimelineRow[] = !useLiveLocations
        ? ((await prisma.timeLine.findMany({
            where: {
              check_in_time: { gte: start, lte: end },
              service_project: {
                OR: [{ company_id: companyId }, { Project: { company_id: companyId } }],
              },
            },
            select: {
              id: true,
              user_id: true,
              userServiceProjectId: true,
              service_project_id: true,
              check_in_time: true,
              check_in_latitude: true,
              check_in_longitude: true,
              is_local_work: true,
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
            orderBy: [{ user_id: "asc" }, { check_in_time: "asc" }],
          })) as HistoricalLegacyTimelineRow[])
        : [];
      const normalizedHistoricalLegacyRows: TrackingSourceRow[] = historicalLegacyTimelineRows.map(
        (row) => ({
          id: row.id,
          companyId,
          userId: row.user_id,
          attendanceId: null,
          userServiceProjectId: row.userServiceProjectId,
          serviceProjectId: row.service_project_id,
          projectId: row.service_project.projectId || row.service_project.Project?.id || null,
          projectName: row.service_project.Project?.location || null,
          serviceTitle: row.service_project.name,
          projectLatitude:
            row.service_project.Project?.lat != null
              ? Number(row.service_project.Project.lat)
              : null,
          projectLongitude:
            row.service_project.Project?.log != null
              ? Number(row.service_project.Project.log)
              : null,
          projectRadiusMeters: row.service_project.Project?.radius ?? null,
          latitude: row.check_in_latitude,
          longitude: row.check_in_longitude,
          isInsideSite: row.is_local_work,
          source: "legacy-timeline",
          recordedAt: row.check_in_time,
        })
      );
      const historyRows = mergeDeduplicatedTrackingRows(
        trackingHistoryRows,
        normalizedHistoricalLegacyRows
      );

      const userIds = Array.from(
        new Set(
          useLiveLocations
            ? openAttendances.map((attendance) => attendance.user_id)
            : historyRows.map((row) => row.userId)
        )
      );

      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          })
        : [];

      const userAvatarMap = new Map<string, string | undefined>();
      await Promise.all(
        users.map(async (user) => {
          if (!user.avatar) {
            userAvatarMap.set(user.id, undefined);
            return;
          }
          userAvatarMap.set(user.id, await getCachedAvatarUrl(user.avatar));
        })
      );

      const userMap = new Map(users.map((user) => [user.id, user]));
      const { serviceProjectMap, projectMap } = useLiveLocations
        ? { serviceProjectMap: new Map(), projectMap: new Map() }
        : await buildProjectContext(historyRows);
      const projectSites = await getCachedProjectSites(companyId);

      const sessions = useLiveLocations
        ? openAttendances
            .map((attendance) => {
              const workerId = attendance.user_id;
              const attendanceLiveRow = validLiveRowByAttendanceId.get(attendance.id) || null;
              const user = userMap.get(workerId);
              const attendanceProject = attendance.UserServiceProject?.service_project?.Project;
              const attendanceService = attendance.UserServiceProject?.service_project;
              const legacyTimelineRow = legacyFallbackRowsByAttendance.get(attendance.id) || null;
              const legacyTrackingRow: TrackingSourceRow | null = legacyTimelineRow
                ? {
                    id: legacyTimelineRow.id,
                    companyId,
                    userId: workerId,
                    attendanceId: attendance.id,
                    userServiceProjectId: attendance.user_service_project_id || null,
                    serviceProjectId: legacyTimelineRow.service_project_id,
                    projectId: attendanceProject?.id || attendance.pending_project_id || null,
                    projectName:
                      attendanceProject?.location || attendance.pending_project_name || null,
                    serviceTitle: attendanceService?.name || null,
                    projectLatitude:
                      attendanceProject?.lat != null
                        ? Number(attendanceProject.lat)
                        : attendance.pending_project_latitude ?? null,
                    projectLongitude:
                      attendanceProject?.log != null
                        ? Number(attendanceProject.log)
                        : attendance.pending_project_longitude ?? null,
                    projectRadiusMeters:
                      attendanceProject?.radius ?? attendance.pending_project_radius ?? null,
                    latitude: legacyTimelineRow.check_in_latitude,
                    longitude: legacyTimelineRow.check_in_longitude,
                    isInsideSite: legacyTimelineRow.is_local_work,
                    source: "legacy-timeline",
                    recordedAt: legacyTimelineRow.check_in_time,
                  }
                : null;
              const latestRow = attendanceLiveRow || legacyTrackingRow;
              const snapshot = getTrackingHealthSnapshot(attendance, latestRow, new Date());
              const lastPingAt = snapshot.lastPingAt?.toISOString() || null;
              const resolvedProjectId =
                latestRow?.projectId ||
                attendanceProject?.id ||
                latestRow?.serviceProjectId ||
                attendance.UserServiceProject?.service_project_id ||
                workerId;
              const resolvedProjectName =
                latestRow?.projectName ||
                attendanceProject?.location ||
                attendanceService?.name ||
                "Project site";
              const resolvedProjectLat =
                latestRow?.projectLatitude ??
                (attendanceProject?.lat != null ? Number(attendanceProject.lat) : null) ??
                attendance.pending_project_latitude ??
                null;
              const resolvedProjectLng =
                latestRow?.projectLongitude ??
                (attendanceProject?.log != null ? Number(attendanceProject.log) : null) ??
                attendance.pending_project_longitude ??
                null;
              const resolvedProjectRadius =
                latestRow?.projectRadiusMeters ??
                (attendanceProject?.radius != null ? Number(attendanceProject.radius) : null) ??
                attendance.pending_project_radius ??
                null;
              const checkInFallbackRow: TrackingSourceRow | null =
                !latestRow &&
                Number.isFinite(attendance.check_in_latitude) &&
                Number.isFinite(attendance.check_in_longitude)
                  ? {
                      id: `${attendance.id}-check-in`,
                      companyId,
                      userId: workerId,
                      attendanceId: attendance.id,
                      userServiceProjectId: attendance.user_service_project_id || null,
                      serviceProjectId: attendance.UserServiceProject?.service_project_id || null,
                      projectId: resolvedProjectId,
                      projectName: resolvedProjectName,
                      serviceTitle: attendanceService?.name || null,
                      projectLatitude: resolvedProjectLat,
                      projectLongitude: resolvedProjectLng,
                      projectRadiusMeters: resolvedProjectRadius,
                      latitude: Number(attendance.check_in_latitude),
                      longitude: Number(attendance.check_in_longitude),
                      isInsideSite:
                        resolvedProjectLat != null &&
                        resolvedProjectLng != null &&
                        resolvedProjectRadius != null
                          ? distanceMeters(
                              {
                                latitude: Number(attendance.check_in_latitude),
                                longitude: Number(attendance.check_in_longitude),
                              },
                              { latitude: resolvedProjectLat, longitude: resolvedProjectLng }
                            ) <= resolvedProjectRadius
                          : false,
                      source: "attendance-check-in",
                      recordedAt: attendance.check_in_time,
                    }
                  : null;
              const displayRow = latestRow || checkInFallbackRow;
              const latestTrackPoint = displayRow
                ? {
                    id: displayRow.id,
                    lat: displayRow.latitude,
                    lng: displayRow.longitude,
                    timestamp: displayRow.recordedAt.toISOString(),
                    presence: (displayRow.isInsideSite ? "inside-site" : "outside-site") as
                      | "inside-site"
                      | "outside-site",
                  }
                : null;
              const status: "on-site" | "off-site" = displayRow?.isInsideSite
                ? "on-site"
                : "off-site";

              return {
                id: workerId,
                attendanceId: attendance.id || undefined,
                userServiceProjectId:
                  attendance.UserServiceProject?.id || latestRow?.userServiceProjectId || undefined,
                workerId,
                workerName: user?.name || "Unknown worker",
                workerAvatarUrl: userAvatarMap.get(workerId),
                serviceTitle: latestRow?.serviceTitle || attendanceService?.name || "Tracked worker",
                projectSite: {
                  id: resolvedProjectId,
                  name: resolvedProjectName,
                  lat: resolvedProjectLat,
                  lng: resolvedProjectLng,
                  radiusMeters: resolvedProjectRadius,
                },
                status,
                checkInAt: attendance.check_in_time.toISOString(),
                checkOutAt: null,
                latestUpdateAt: lastPingAt || undefined,
                lastPingAt: lastPingAt || undefined,
                lastPingAgeMinutes: snapshot.lastPingAgeMinutes,
                trackingHealth: snapshot.trackingHealth,
                silentSince: snapshot.silentSince?.toISOString() || null,
                trackingDiagnostics: attendanceLiveRow
                  ? {
                      protocolVersion: attendanceLiveRow.protocolVersion ?? null,
                      appVersion: attendanceLiveRow.appVersion ?? null,
                      platform: attendanceLiveRow.platform ?? null,
                      queueDepth: attendanceLiveRow.queueDepth ?? null,
                      permissions: attendanceLiveRow.permissions ?? null,
                      services: attendanceLiveRow.services ?? null,
                      taskState: attendanceLiveRow.taskState ?? null,
                    }
                  : null,
                trackPoints: latestTrackPoint ? [latestTrackPoint] : [],
                summary: {
                  insideMinutes: 0,
                  outsideMinutes: 0,
                  pointCount: latestTrackPoint ? 1 : 0,
                  contractNumber: null,
                },
              };
            })
            .sort(
              (left, right) =>
                new Date(right.latestUpdateAt || right.checkInAt).getTime() -
                new Date(left.latestUpdateAt || left.checkInAt).getTime()
            )
        : Array.from(
            historyRows.reduce((acc, row) => {
              const current = acc.get(row.userId) || [];
              current.push(row);
              acc.set(row.userId, current);
              return acc;
            }, new Map<string, TrackingSourceRow[]>())
          )
            .map(([workerId, rows]) => {
              const latestRow = rows[rows.length - 1];
              const user = userMap.get(workerId);
              const serviceProjectContext = latestRow.serviceProjectId
                ? serviceProjectMap.get(latestRow.serviceProjectId)
                : null;
              const projectContext = latestRow.projectId ? projectMap.get(latestRow.projectId) : null;
              const resolvedProjectId =
                latestRow.projectId || serviceProjectContext?.projectId || projectContext?.id || null;
              const resolvedProjectName =
                latestRow.projectName ||
                projectContext?.name ||
                serviceProjectContext?.projectName ||
                serviceProjectContext?.name ||
                "Project site";
              const resolvedProjectLat =
                latestRow.projectLatitude ??
                projectContext?.lat ??
                serviceProjectContext?.lat ??
                null;
              const resolvedProjectLng =
                latestRow.projectLongitude ??
                projectContext?.lng ??
                serviceProjectContext?.lng ??
                null;
              const resolvedProjectRadius =
                latestRow.projectRadiusMeters ??
                projectContext?.radiusMeters ??
                serviceProjectContext?.radiusMeters ??
                null;
              const latestTrackPoint = {
                id: latestRow.id,
                lat: latestRow.latitude,
                lng: latestRow.longitude,
                timestamp: latestRow.recordedAt.toISOString(),
                presence: (latestRow.isInsideSite ? "inside-site" : "outside-site") as
                  | "inside-site"
                  | "outside-site",
              };
              const latestUpdateAt = latestRow.recordedAt.toISOString();
              const status: "on-site" | "off-site" = latestRow.isInsideSite ? "on-site" : "off-site";

              return {
                id: workerId,
                attendanceId: latestRow.attendanceId || undefined,
                userServiceProjectId: latestRow.userServiceProjectId || undefined,
                workerId,
                workerName: user?.name || "Unknown worker",
                workerAvatarUrl: userAvatarMap.get(workerId),
                serviceTitle: latestRow.serviceTitle || serviceProjectContext?.name || "Tracked worker",
                projectSite: {
                  id: resolvedProjectId || latestRow.serviceProjectId || workerId,
                  name: resolvedProjectName,
                  lat: resolvedProjectLat,
                  lng: resolvedProjectLng,
                  radiusMeters: resolvedProjectRadius,
                },
                status,
                checkInAt: rows[0].recordedAt.toISOString(),
                checkOutAt: null,
                latestUpdateAt,
                lastPingAt: latestUpdateAt,
                lastPingAgeMinutes: null,
                trackingHealth: "healthy" as const,
                silentSince: null,
                trackPoints: [latestTrackPoint],
                summary: {
                  insideMinutes: 0,
                  outsideMinutes: 0,
                  pointCount: 1,
                  contractNumber: null,
                },
              };
            })
            .sort(
              (left, right) =>
                new Date(right.latestUpdateAt || 0).getTime() -
                new Date(left.latestUpdateAt || 0).getTime()
            );

      return res.status(200).json({
        message: "Live tracking fetched successfully",
        data: sessions,
        meta: {
          period: "date",
          selectedDate: toDateString(effectiveDate),
          start: start.toISOString(),
          end: end.toISOString(),
          total: sessions.length,
          source: useLiveLocations ? "worker-live-location" : "worker-tracking-history",
        },
        projectSites,
      });
    } catch (error) {
      console.error("[GetLiveTrackingByCompanyController] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
