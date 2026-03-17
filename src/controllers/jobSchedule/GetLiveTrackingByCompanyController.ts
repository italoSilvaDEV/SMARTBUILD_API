import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

type TrackingPeriod = "today" | "week" | "month" | "all";

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

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function getPeriodRange(period: TrackingPeriod) {
  const now = new Date();

  if (period === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (period === "week") {
    return { start: startOfWeek(now), end: endOfDay(now) };
  }

  if (period === "month") {
    return { start: startOfMonth(now), end: endOfDay(now) };
  }

  const start = new Date(now);
  start.setDate(now.getDate() - 90);
  start.setHours(0, 0, 0, 0);
  return { start, end: endOfDay(now) };
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function buildPresence(
  point: { lat: number; lng: number },
  site: { lat: number | null; lng: number | null; radiusMeters: number | null },
  fallbackIsLocal?: boolean | null
): "inside-site" | "outside-site" {
  if (
    site.lat != null &&
    site.lng != null &&
    site.radiusMeters != null &&
    site.radiusMeters > 0
  ) {
    const distance = calculateDistanceMeters(point.lat, point.lng, site.lat, site.lng);
    return distance <= site.radiusMeters ? "inside-site" : "outside-site";
  }

  return fallbackIsLocal ? "inside-site" : "outside-site";
}

export class GetLiveTrackingByCompanyController {
  async handle(req: Request, res: Response) {
    const { companyId } = req.params;
    const requestedDate = parseRequestedDate(req.query.date);
    const requestedPeriod = String(req.query.period || "today").toLowerCase();
    const period: TrackingPeriod =
      requestedPeriod === "week" ||
      requestedPeriod === "month" ||
      requestedPeriod === "all"
        ? requestedPeriod
        : "today";

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
      const { start, end } = requestedDate
        ? { start: startOfDay(effectiveDate), end: endOfDay(effectiveDate) }
        : getPeriodRange(period);

      const attendances = await prisma.userAttendance.findMany({
        where: {
          company_id: companyId,
          check_in_time: {
            gte: start,
            lte: end,
          },
        },
        orderBy: {
          check_in_time: "desc",
        },
        take: period === "today" ? 100 : 200,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          UserServiceProject: {
            include: {
              service_project: {
                select: {
                  id: true,
                  name: true,
                  Project: {
                    select: {
                      id: true,
                      contract_number: true,
                      location: true,
                      lat: true,
                      log: true,
                      radius: true,
                    },
                  },
                },
              },
              sub_service_project: {
                select: {
                  id: true,
                  name: true,
                  serviceProject: {
                    select: {
                      id: true,
                      name: true,
                      Project: {
                        select: {
                          id: true,
                          contract_number: true,
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
              custom_service_schedule: {
                select: {
                  id: true,
                  name: true,
                  project: {
                    select: {
                      id: true,
                      contract_number: true,
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
      });

      const sessions = await Promise.all(
        attendances.map(async (attendance) => {
          const usp = attendance.UserServiceProject;
          const directService = usp?.service_project || null;
          const subService = usp?.sub_service_project || null;
          const customService = usp?.custom_service_schedule || null;

          const project =
            directService?.Project ||
            subService?.serviceProject?.Project ||
            customService?.project ||
            null;

          const projectSite = {
            id: project?.id || attendance.pending_project_id || attendance.id,
            name:
              project?.location ||
              attendance.pending_project_name ||
              attendance.pending_project_address ||
              "Project site",
            lat: toNumber(project?.lat) ?? attendance.pending_project_latitude ?? null,
            lng: toNumber(project?.log) ?? attendance.pending_project_longitude ?? null,
            radiusMeters:
              toNumber(project?.radius) ?? attendance.pending_project_radius ?? null,
          };

          const serviceTitle =
            directService?.name ||
            subService?.name ||
            customService?.name ||
            attendance.pending_project_name ||
            "Scheduled work";

          const rangeEnd = attendance.check_out_time || end;

          const rawTimeline =
            attendance.user_service_project_id != null
              ? await prisma.timeLine.findMany({
                  where: {
                    userServiceProjectId: attendance.user_service_project_id,
                    check_in_time: {
                      gte: attendance.check_in_time,
                      lte: rangeEnd,
                    },
                  },
                  orderBy: {
                    check_in_time: "asc",
                  },
                  select: {
                    id: true,
                    check_in_time: true,
                    check_in_latitude: true,
                    check_in_longitude: true,
                    is_local_work: true,
                  },
                  take: 500,
                })
              : [];

          const trackPoints = rawTimeline.map((point) => {
            const lat = point.check_in_latitude;
            const lng = point.check_in_longitude;
            return {
              id: point.id,
              lat,
              lng,
              timestamp: point.check_in_time.toISOString(),
              presence: buildPresence(
                { lat, lng },
                projectSite,
                point.is_local_work
              ),
            };
          });

          if (trackPoints.length === 0) {
            const fallbackCheckInPoint = {
              id: `${attendance.id}-check-in`,
              lat: attendance.check_in_latitude,
              lng: attendance.check_in_longitude,
              timestamp: attendance.check_in_time.toISOString(),
              presence: buildPresence(
                {
                  lat: attendance.check_in_latitude,
                  lng: attendance.check_in_longitude,
                },
                projectSite,
                true
              ),
            };

            trackPoints.push(fallbackCheckInPoint);

            if (attendance.check_out_time && attendance.check_out_latitude != null && attendance.check_out_longitude != null) {
              trackPoints.push({
                id: `${attendance.id}-check-out`,
                lat: attendance.check_out_latitude,
                lng: attendance.check_out_longitude,
                timestamp: attendance.check_out_time.toISOString(),
                presence: buildPresence(
                  {
                    lat: attendance.check_out_latitude,
                    lng: attendance.check_out_longitude,
                  },
                  projectSite,
                  false
                ),
              });
            }
          }

          let insideMinutes = 0;
          let outsideMinutes = 0;
          for (let index = 0; index < trackPoints.length - 1; index += 1) {
            const currentPoint = trackPoints[index];
            const nextPoint = trackPoints[index + 1];
            const elapsedMinutes = Math.max(
              0,
              new Date(nextPoint.timestamp).getTime() - new Date(currentPoint.timestamp).getTime()
            ) / 60000;
            if (currentPoint.presence === "inside-site") {
              insideMinutes += elapsedMinutes;
            } else {
              outsideMinutes += elapsedMinutes;
            }
          }

          const latestPoint = trackPoints[trackPoints.length - 1] || null;
          const lastSeenAt =
            latestPoint?.timestamp ||
            attendance.check_out_time?.toISOString() ||
            attendance.check_in_time.toISOString();

          let status: "on-site" | "off-site" | "stale" | "pending-service";
          if (!attendance.user_service_project_id && attendance.pending_project_id) {
            status = "pending-service";
          } else if (!attendance.check_out_time && latestPoint?.presence === "inside-site") {
            status = "on-site";
          } else if (!attendance.check_out_time) {
            const staleThresholdMs = 15 * 60 * 1000;
            status =
              new Date().getTime() - new Date(lastSeenAt).getTime() > staleThresholdMs
                ? "stale"
                : "off-site";
          } else {
            status = "off-site";
          }

          let workerAvatarUrl: string | undefined;
          if (attendance.user.avatar) {
            try {
              workerAvatarUrl = await getPresignedUrl(attendance.user.avatar);
            } catch {
              workerAvatarUrl = undefined;
            }
          }

          return {
            id: attendance.id,
            attendanceId: attendance.id,
            userServiceProjectId: attendance.user_service_project_id,
            workerId: attendance.user.id,
            workerName: attendance.user.name,
            workerAvatarUrl,
            serviceTitle,
            projectSite,
            status,
            checkInAt: attendance.check_in_time.toISOString(),
            checkOutAt: attendance.check_out_time?.toISOString(),
            latestUpdateAt: lastSeenAt,
            trackPoints,
            summary: {
              insideMinutes: Math.round(insideMinutes),
              outsideMinutes: Math.round(outsideMinutes),
              pointCount: trackPoints.length,
              contractNumber: project?.contract_number ?? null,
            },
          };
        })
      );

      return res.status(200).json({
        message: "Live tracking fetched successfully",
        data: sessions,
        meta: {
          period: requestedDate ? "date" : period,
          selectedDate: toDateString(effectiveDate),
          start: start.toISOString(),
          end: end.toISOString(),
          total: sessions.length,
        },
      });
    } catch (error) {
      console.error("[GetLiveTrackingByCompanyController] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
