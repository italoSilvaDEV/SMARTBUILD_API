import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

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

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class GetLiveTrackingByCompanyController {
  async handle(req: Request, res: Response) {
    const { companyId } = req.params;
    const requestedDate = parseRequestedDate(req.query.date);

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
      const start = startOfDay(effectiveDate);
      const end = endOfDay(effectiveDate);

      const trackingPings = await prisma.workerLocationPing.findMany({
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

      const userIds = Array.from(new Set(trackingPings.map((ping) => ping.userId)));
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
      const groupedPings = new Map<string, typeof trackingPings>();
      trackingPings.forEach((ping) => {
        const current = groupedPings.get(ping.userId) || [];
        current.push(ping);
        groupedPings.set(ping.userId, current);
      });

      const sessions = Array.from(groupedPings.entries())
        .map(([workerId, pings]) => {
          const latestPing = pings[pings.length - 1];
          const user = userMap.get(workerId);
          const latestTrackPoint = {
            id: latestPing.id,
            lat: latestPing.latitude,
            lng: latestPing.longitude,
            timestamp: latestPing.recordedAt.toISOString(),
            presence: (latestPing.isInsideSite ? "inside-site" : "outside-site") as
              | "inside-site"
              | "outside-site",
          };
          const latestUpdateAt = latestPing.recordedAt.toISOString();
          const staleThresholdMs = 15 * 60 * 1000;
          const isStale = Date.now() - latestPing.recordedAt.getTime() > staleThresholdMs;
          let status: "on-site" | "off-site" | "stale" | "pending-service";

          if (!latestPing.serviceProjectId && !latestPing.projectId) {
            status = "pending-service";
          } else if (isStale) {
            status = "stale";
          } else if (latestPing.isInsideSite) {
            status = "on-site";
          } else {
            status = "off-site";
          }

          return {
            id: workerId,
            attendanceId: latestPing.attendanceId || undefined,
            userServiceProjectId: latestPing.userServiceProjectId || undefined,
            workerId,
            workerName: user?.name || "Unknown worker",
            workerAvatarUrl: userAvatarMap.get(workerId),
            serviceTitle: latestPing.serviceTitle || "Tracked worker",
            projectSite: {
              id: latestPing.projectId || latestPing.serviceProjectId || workerId,
              name: latestPing.projectName || "Project site",
              lat: latestPing.projectLatitude,
              lng: latestPing.projectLongitude,
              radiusMeters: latestPing.projectRadiusMeters,
            },
            status,
            checkInAt: pings[0].recordedAt.toISOString(),
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
          source: "worker-tracking",
        },
      });
    } catch (error) {
      console.error("[GetLiveTrackingByCompanyController] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
