import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

type TrackingSourceRow = {
  id: string;
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
  recordedAt: Date;
};

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
    const requestedDate = parseRequestedDate(req.query.date);
    const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(req.query.timezoneOffsetMinutes) ?? 0;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    try {
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

      const sourceRows: TrackingSourceRow[] = useLiveLocations
        ? await prisma.workerLiveLocation.findMany({
            where: {
              companyId,
              recordedAt: {
                gte: start,
                lte: end,
              },
            },
            orderBy: [{ recordedAt: "desc" }],
          })
        : await prisma.workerLocationPing.findMany({
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
          });

      const userIds = Array.from(new Set(sourceRows.map((row) => row.userId)));
      const users = userIds.length
        ? await prisma.user.findMany({
            where: {
              id: { in: userIds },
            },
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
          try {
            userAvatarMap.set(user.id, await getPresignedUrl(user.avatar));
          } catch {
            userAvatarMap.set(user.id, undefined);
          }
        })
      );

      const userMap = new Map(users.map((user) => [user.id, user]));
      const { serviceProjectMap, projectMap } = await buildProjectContext(sourceRows);

      const groupedRows = new Map<string, TrackingSourceRow[]>();
      sourceRows.forEach((row) => {
        const current = groupedRows.get(row.userId) || [];
        current.push(row);
        groupedRows.set(row.userId, current);
      });

      const sessions = Array.from(groupedRows.entries())
        .map(([workerId, rows]) => {
          const latestRow = useLiveLocations ? rows[0] : rows[rows.length - 1];
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
      });
    } catch (error) {
      console.error("[GetLiveTrackingByCompanyController] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
