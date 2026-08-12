import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";
import { PushNotificationService } from "../../services/PushNotificationService";
import { AttendanceService } from "../../services/AttendanceService";
import { Prisma } from "@prisma/client";
import axios from "axios";

type ReviewStatus = "approved" | "denied";
type RequestType = "correction" | "missing_entry";

interface AuthRequest extends Request {
  userId?: string;
}

const MANAGEMENT_OFFICES_BLOCKED = new Set(["worker", "master"]);

const TIMECARD_REQUEST_LINK = "/time-cards?tab=requests";
const PDFSHIFT_API_URL = "https://api.pdfshift.io/v3/convert/pdf";
const TIMECARD_REQUEST_PERMISSION = "Time Cards - Requests";
const attendanceService = new AttendanceService();

const requestInclude = {
  employee: {
    select: { id: true, name: true, avatar: true, expoPushToken: true },
  },
  reviewer: {
    select: { id: true, name: true, avatar: true },
  },
  attendance: {
    select: {
      id: true,
      check_in_time: true,
      check_out_time: true,
      date: true,
      note: true,
      UserServiceProject: {
        select: {
          service_project: {
            select: {
              id: true,
              name: true,
              Project: {
                select: {
                  id: true,
                  location: true,
                  client: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  serviceProject: {
    select: {
      id: true,
      name: true,
      Project: {
        select: {
          id: true,
          location: true,
          client: { select: { name: true } },
        },
      },
    },
  },
} as const;

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTimeForPdf(value: Date | null | undefined): string {
  if (!value) return "-";
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapTimeCardEditRequest(record: any) {
  const serviceProject =
    record.serviceProject || record.attendance?.UserServiceProject?.service_project;

  return {
    id: record.id,
    requestType: record.requestType || "correction",
    attendanceId: record.attendanceId,
    serviceProjectId: record.serviceProjectId,
    employeeId: record.employeeId,
    reviewerId: record.reviewerId,
    companyId: record.companyId,
    status: record.status,
    originalCheckInTime: toIso(record.originalCheckInTime),
    originalCheckOutTime: toIso(record.originalCheckOutTime),
    requestedCheckInTime: toIso(record.requestedCheckInTime),
    requestedCheckOutTime: toIso(record.requestedCheckOutTime),
    approvedCheckInTime: toIso(record.approvedCheckInTime),
    approvedCheckOutTime: toIso(record.approvedCheckOutTime),
    reason: record.reason,
    employeeNote: record.employeeNote,
    approvedAttendanceNote: record.approvedAttendanceNote,
    managerNote: record.managerNote,
    clientRequestId: record.clientRequestId,
    employeeSignature: record.employeeSignature,
    managerSignature: record.managerSignature,
    reviewedAt: toIso(record.reviewedAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    employee: record.employee
      ? {
          id: record.employee.id,
          name: record.employee.name,
          avatar: record.employee.avatar ?? null,
        }
      : null,
    reviewer: record.reviewer
      ? {
          id: record.reviewer.id,
          name: record.reviewer.name,
          avatar: record.reviewer.avatar ?? null,
        }
      : null,
    attendance: record.attendance
      ? {
          id: record.attendance.id,
          checkInTime: toIso(record.attendance.check_in_time),
          checkOutTime: toIso(record.attendance.check_out_time),
          workDate: toIso(record.attendance.date),
          note: record.attendance.note ?? null,
          serviceName:
            record.attendance.UserServiceProject?.service_project?.name ?? null,
          projectName:
            record.attendance.UserServiceProject?.service_project?.Project?.location ??
            null,
          clientName:
            record.attendance.UserServiceProject?.service_project?.Project?.client
              ?.name ?? null,
        }
      : null,
    service: serviceProject
      ? {
          id: serviceProject.id,
          name: serviceProject.name,
          projectId: serviceProject.Project?.id ?? null,
          projectName: serviceProject.Project?.location ?? null,
          clientName: serviceProject.Project?.client?.name ?? null,
        }
      : null,
  };
}

export class TimeCardEditRequestController {
  private getRequesterId(req: AuthRequest): string | null {
    const userId = req.userId || (req as any).userId;
    if (!userId || typeof userId !== "string") return null;
    return userId;
  }

  private async canReviewCompany(userId: string, companyId: string): Promise<boolean> {
    const membership = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId,
        },
      },
      include: {
        office: {
          select: {
            name: true,
            userPermissions: {
              where: {
                permission: { description: TIMECARD_REQUEST_PERMISSION },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!membership) return false;

    const officeName = membership.office?.name?.trim().toLowerCase() || "";
    if (officeName === "owner") return true;
    if (MANAGEMENT_OFFICES_BLOCKED.has(officeName)) return false;
    return (membership.office?.userPermissions?.length || 0) > 0;
  }

  private async notifyOfficeUsersAboutRequest(params: {
    companyId: string;
    actorId: string;
    actorName: string;
    requestId: string;
    workDate: Date;
    requestType: RequestType;
  }): Promise<void> {
    const memberships = await prisma.userCompany.findMany({
      where: {
        companyId: params.companyId,
      },
      select: {
        userId: true,
        office: {
          select: {
            name: true,
            userPermissions: {
              where: {
                permission: { description: TIMECARD_REQUEST_PERMISSION },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    const recipients = memberships
      .filter((membership) => {
        const officeName = membership.office?.name?.trim().toLowerCase() || "";
        if (officeName === "owner") return true;
        if (MANAGEMENT_OFFICES_BLOCKED.has(officeName)) return false;
        return (membership.office?.userPermissions?.length || 0) > 0;
      })
      .map((membership) => membership.userId)
      .filter((userId) => userId !== params.actorId);

    const uniqueRecipients = Array.from(new Set(recipients));
    if (uniqueRecipients.length === 0) return;

    const workDateText = params.workDate.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });

    const message =
      params.requestType === "missing_entry"
        ? `${params.actorName} requested a missing time entry for ${workDateText}.`
        : `${params.actorName} requested a time card correction for ${workDateText}.`;

    for (const userId of uniqueRecipients) {
      const notification = await prisma.feedNotification.create({
        data: {
          type: "timecard_edit_request_created",
          message,
          relatedLink: TIMECARD_REQUEST_LINK,
          userId,
          actorId: params.actorId,
        },
      });

      SocketService.emitToUser(userId, "new_notification", {
        id: notification.id,
        type: notification.type,
        message: notification.message,
        isRead: notification.isRead,
        userId: notification.userId,
        actorId: notification.actorId,
        createdAt: notification.date_creation,
        taskId: null,
        targetPath: notification.relatedLink,
        actor: {
          id: params.actorId,
          name: params.actorName,
        },
      });
    }
  }

  private async notifyEmployeeAboutReview(params: {
    employeeId: string;
    actorId: string;
    actorName: string;
    requestId: string;
    status: ReviewStatus;
    employeeToken: string | null;
    requestType: RequestType;
  }): Promise<void> {
    const requestLabel =
      params.requestType === "missing_entry"
        ? "missing time entry request"
        : "time card correction request";
    const message =
      params.status === "approved"
        ? `Your ${requestLabel} was approved by ${params.actorName}.`
        : `Your ${requestLabel} was denied by ${params.actorName}.`;

    const notification = await prisma.feedNotification.create({
      data: {
        type: "timecard_edit_request_reviewed",
        message,
        relatedLink: TIMECARD_REQUEST_LINK,
        userId: params.employeeId,
        actorId: params.actorId,
      },
    });

    SocketService.emitToUser(params.employeeId, "new_notification", {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      isRead: notification.isRead,
      userId: notification.userId,
      actorId: notification.actorId,
      createdAt: notification.date_creation,
      taskId: null,
      targetPath: notification.relatedLink,
      actor: {
        id: params.actorId,
        name: params.actorName,
      },
    });

    if (params.employeeToken?.startsWith("ExponentPushToken[")) {
      await PushNotificationService.sendPushNotifications([
        {
          to: params.employeeToken,
          title: "Time Card Request Update",
          body: message,
          sound: "default",
          data: {
            type: "timecard_edit_request_reviewed",
            requestId: params.requestId,
            status: params.status,
            requestType: params.requestType,
          },
        },
      ]);
    }
  }

  private buildReviewPdfHtml(record: any): { html: string; css: string } {
    const reviewStatus = record.status || "pending";
    const isMissingEntry = record.requestType === "missing_entry";
    const requestTitle = isMissingEntry
      ? "Missing Time Entry Request Review"
      : "Time Card Correction Request Review";
    const employeeSignature = record.employeeSignature || "";
    const managerSignature = record.managerSignature || "";
    const employeeName = record.employee?.name || "Unknown";
    const managerName = record.reviewer?.name || "-";
    const workDate = formatDateTimeForPdf(record.attendance?.date || record.originalCheckInTime);

    const employeeSignatureBlock = String(employeeSignature).startsWith("data:image/")
      ? `<img src="${employeeSignature}" alt="Employee signature" class="signature-image" />`
      : `<div class="signature-text">${escapeHtml(employeeSignature || "-")}</div>`;

    const managerSignatureBlock = String(managerSignature).startsWith("data:image/")
      ? `<img src="${managerSignature}" alt="Manager signature" class="signature-image" />`
      : `<div class="signature-text">${escapeHtml(managerSignature || "-")}</div>`;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(requestTitle)}</title>
        </head>
        <body>
          <div class="document">
            <h1>${escapeHtml(requestTitle)}</h1>
            <p class="meta">Generated at: ${escapeHtml(formatDateTimeForPdf(new Date()))}</p>

            <section class="block">
              <h2>Employee</h2>
              <p><strong>Name:</strong> ${escapeHtml(employeeName)}</p>
              <p><strong>Work Date:</strong> ${escapeHtml(workDate)}</p>
              <p><strong>Status:</strong> <span class="badge ${escapeHtml(reviewStatus)}">${escapeHtml(reviewStatus)}</span></p>
              <p><strong>Project:</strong> ${escapeHtml(record.serviceProject?.Project?.location || record.attendance?.UserServiceProject?.service_project?.Project?.location || "-")}</p>
              <p><strong>Service:</strong> ${escapeHtml(record.serviceProject?.name || record.attendance?.UserServiceProject?.service_project?.name || "-")}</p>
            </section>

            <section class="block">
              <h2>${isMissingEntry ? "Requested Time Entry" : "Original vs Requested"}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    ${isMissingEntry ? "" : "<th>Original</th>"}
                    <th>Requested</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Clock In</td>
                    ${isMissingEntry ? "" : `<td>${escapeHtml(formatDateTimeForPdf(record.originalCheckInTime))}</td>`}
                    <td>${escapeHtml(formatDateTimeForPdf(record.requestedCheckInTime))}</td>
                    <td>${escapeHtml(formatDateTimeForPdf(record.approvedCheckInTime))}</td>
                  </tr>
                  <tr>
                    <td>Clock Out</td>
                    ${isMissingEntry ? "" : `<td>${escapeHtml(formatDateTimeForPdf(record.originalCheckOutTime))}</td>`}
                    <td>${escapeHtml(formatDateTimeForPdf(record.requestedCheckOutTime))}</td>
                    <td>${escapeHtml(formatDateTimeForPdf(record.approvedCheckOutTime))}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="block">
              <h2>Notes</h2>
              <p><strong>Reason:</strong> ${escapeHtml(record.reason || "-")}</p>
              <p><strong>Employee Note:</strong> ${escapeHtml(record.employeeNote || "-")}</p>
              <p><strong>Approved Attendance Note:</strong> ${escapeHtml(record.approvedAttendanceNote || "-")}</p>
              <p><strong>Employee Signed By:</strong> ${escapeHtml(employeeName)}</p>
              <p><strong>Employee Signed At:</strong> ${escapeHtml(formatDateTimeForPdf(record.createdAt))}</p>
              <p><strong>Manager Note:</strong> ${escapeHtml(record.managerNote || "-")}</p>
              <p><strong>Manager Signed By:</strong> ${escapeHtml(managerName)}</p>
              <p><strong>Reviewed At:</strong> ${escapeHtml(formatDateTimeForPdf(record.reviewedAt))}</p>
            </section>

            <section class="signatures">
              <div class="signature-box">
                <h3>Employee Signature</h3>
                <p><strong>Employee:</strong> ${escapeHtml(employeeName)}</p>
                ${employeeSignatureBlock}
              </div>
              <div class="signature-box">
                <h3>Manager Signature</h3>
                <p><strong>Manager:</strong> ${escapeHtml(managerName)}</p>
                ${managerSignatureBlock}
              </div>
            </section>
          </div>
        </body>
      </html>
    `;

    const css = `
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
      .document { padding: 16px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      h2 { margin: 0 0 8px; font-size: 16px; }
      h3 { margin: 0 0 8px; font-size: 14px; }
      .meta { color: #6B7280; margin-bottom: 14px; }
      .block { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
      p { margin: 4px 0; line-height: 1.4; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th, td { border: 1px solid #E5E7EB; padding: 8px; font-size: 12px; text-align: left; }
      th { background: #F9FAFB; font-weight: 700; }
      .badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; text-transform: capitalize; }
      .badge.pending { background: #FEF3C7; color: #92400E; }
      .badge.approved { background: #D1FAE5; color: #065F46; }
      .badge.denied { background: #FEE2E2; color: #991B1B; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .signature-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; min-height: 170px; }
      .signature-image { width: 100%; height: 130px; object-fit: contain; background: #fff; border: 1px solid #E5E7EB; border-radius: 6px; }
      .signature-text { font-size: 11px; color: #374151; word-break: break-all; min-height: 130px; border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px; }
    `;

    return { html, css };
  }

  private async generateReviewPdfBuffer(record: any): Promise<Buffer> {
    const apiKey = process.env.PDFSHIFT_API_KEY;
    if (!apiKey) {
      throw new Error("PDFSHIFT_API_KEY is not configured.");
    }

    const { html, css } = this.buildReviewPdfHtml(record);

    const response = await axios.post(
      PDFSHIFT_API_URL,
      {
        source: html,
        sandbox: false,
        landscape: false,
        format: "A4",
        margin: "20px",
        use_print: true,
        disable_javascript: true,
        css,
      },
      {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
        responseType: "arraybuffer",
      }
    );

    return Buffer.from(response.data);
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const requesterId = this.getRequesterId(req);
      if (!requesterId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        requestType: rawRequestType,
        attendanceId,
        companyId: requestedCompanyId,
        serviceProjectId,
        requestedCheckInTime,
        requestedCheckOutTime,
        reason,
        employeeNote,
        employeeSignature,
        clientRequestId,
      } = req.body;

      const requestType: RequestType =
        rawRequestType === "missing_entry" ? "missing_entry" : "correction";

      if (
        rawRequestType !== undefined &&
        rawRequestType !== "correction" &&
        rawRequestType !== "missing_entry"
      ) {
        return res.status(400).json({
          error: "requestType must be either 'correction' or 'missing_entry'.",
        });
      }

      if (!requestedCheckInTime || !reason || !employeeSignature) {
        return res.status(400).json({
          error:
            "requestedCheckInTime, reason and employeeSignature are required.",
        });
      }

      if (requestType === "correction" && !attendanceId) {
        return res.status(400).json({ error: "attendanceId is required for corrections." });
      }

      if (
        requestType === "missing_entry" &&
        (!requestedCompanyId || !serviceProjectId || !requestedCheckOutTime)
      ) {
        return res.status(400).json({
          error:
            "companyId, serviceProjectId and requestedCheckOutTime are required for missing entries.",
        });
      }

      const normalizedReason = String(reason).trim();
      const normalizedEmployeeNote =
        typeof employeeNote === "string" && employeeNote.trim().length > 0
          ? employeeNote.trim()
          : null;
      const normalizedClientRequestId =
        typeof clientRequestId === "string" && clientRequestId.trim().length > 0
          ? clientRequestId.trim()
          : null;

      if (!normalizedReason || normalizedReason.length > 5000) {
        return res.status(400).json({ error: "Reason must be between 1 and 5000 characters." });
      }
      if (normalizedEmployeeNote && normalizedEmployeeNote.length > 5000) {
        return res.status(400).json({ error: "Note cannot exceed 5000 characters." });
      }
      if (normalizedClientRequestId && normalizedClientRequestId.length > 191) {
        return res.status(400).json({ error: "clientRequestId is too long." });
      }

      const parsedCheckIn = parseOptionalDate(requestedCheckInTime);
      const parsedCheckOut = parseOptionalDate(requestedCheckOutTime);

      if (!parsedCheckIn) {
        return res.status(400).json({ error: "requestedCheckInTime is invalid." });
      }

      if (requestedCheckOutTime && !parsedCheckOut) {
        return res.status(400).json({ error: "requestedCheckOutTime is invalid." });
      }

      if (parsedCheckOut && parsedCheckIn >= parsedCheckOut) {
        return res.status(400).json({
          error: "Requested check-in must be earlier than requested check-out.",
        });
      }

      if (normalizedClientRequestId) {
        const idempotentRequest = await prisma.timeCardEditRequest.findFirst({
          where: { employeeId: requesterId, clientRequestId: normalizedClientRequestId },
          include: requestInclude,
        });
        if (idempotentRequest) {
          return res.status(200).json(mapTimeCardEditRequest(idempotentRequest));
        }
      }

      if (requestType === "missing_entry") {
        const companyId = String(requestedCompanyId);
        const membership = await prisma.userCompany.findUnique({
          where: { userId_companyId: { userId: requesterId, companyId } },
          select: { userId: true },
        });
        if (!membership) {
          return res.status(403).json({ error: "You do not belong to this company." });
        }

        const requester = await prisma.user.findUnique({
          where: { id: requesterId },
          select: {
            id: true,
            name: true,
            isDisabled: true,
            projectVisibilityMode: true,
            company: { select: { projectVisibilityMode: true } },
          },
        });
        if (!requester || requester.isDisabled) {
          return res.status(403).json({ error: "This employee is not active." });
        }

        const serviceProject = await prisma.serviceProject.findUnique({
          where: { id: String(serviceProjectId) },
          include: { Project: true },
        });
        if (!serviceProject || serviceProject.Project?.company_id !== companyId) {
          return res.status(404).json({ error: "Service was not found in this company." });
        }
        if (
          serviceProject.status === "Canceled" ||
          ["Canceled", "Declined", "Rejected"].includes(
            serviceProject.Project?.status_project || ""
          )
        ) {
          return res.status(400).json({ error: "This project or service is not active." });
        }

        const visibilityMode =
          requester.projectVisibilityMode ||
          requester.company?.projectVisibilityMode ||
          "allActive";
        if (visibilityMode === "assignedOnly") {
          const assignment = await prisma.userServiceProject.findFirst({
            where: {
              user_id: requesterId,
              service_project_id: serviceProject.id,
              assigned_at: { lte: parsedCheckIn },
              OR: [
                { removed_at: null },
                { removed_at: { gte: parsedCheckIn } },
              ],
            },
            select: { id: true },
          });
          if (!assignment) {
            return res.status(403).json({
              error: "You were not assigned to this service during the requested time.",
            });
          }
        }

        const existingPendingRequest = await prisma.timeCardEditRequest.findFirst({
          where: {
            requestType: "missing_entry",
            employeeId: requesterId,
            serviceProjectId: serviceProject.id,
            status: "pending",
            requestedCheckInTime: parsedCheckIn,
            requestedCheckOutTime: parsedCheckOut,
          },
          include: requestInclude,
        });
        if (existingPendingRequest) {
          return res.status(409).json({
            error: "There is already a pending request for this time entry.",
          });
        }

        const created = await prisma.timeCardEditRequest.create({
          data: {
            requestType,
            attendanceId: null,
            serviceProjectId: serviceProject.id,
            employeeId: requesterId,
            companyId,
            originalCheckInTime: null,
            originalCheckOutTime: null,
            requestedCheckInTime: parsedCheckIn,
            requestedCheckOutTime: parsedCheckOut,
            reason: normalizedReason,
            employeeNote: normalizedEmployeeNote,
            employeeSignature: String(employeeSignature).trim(),
            clientRequestId: normalizedClientRequestId,
            status: "pending",
          },
          include: requestInclude,
        });

        await this.notifyOfficeUsersAboutRequest({
          companyId,
          actorId: requesterId,
          actorName: requester.name,
          requestId: created.id,
          workDate: parsedCheckIn,
          requestType,
        }).catch((notificationError) => {
          console.error(
            "[TimeCardEditRequestController.create] Notification failed:",
            notificationError
          );
        });

        return res.status(201).json(mapTimeCardEditRequest(created));
      }

      const attendance = await prisma.userAttendance.findUnique({
        where: { id: String(attendanceId) },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              expoPushToken: true,
            },
          },
          UserServiceProject: {
            include: {
              service_project: {
                include: {
                  Project: {
                    select: {
                      company_id: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!attendance) {
        return res.status(404).json({ error: "Attendance not found." });
      }

      if (attendance.user_id !== requesterId) {
        return res.status(403).json({
          error: "You can only request edits for your own time cards.",
        });
      }

      const companyId =
        attendance.company_id ||
        attendance.UserServiceProject?.service_project?.Project?.company_id;

      if (!companyId) {
        return res.status(400).json({
          error: "Could not resolve company for this attendance.",
        });
      }

      const membership = await prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: requesterId, companyId } },
        select: { userId: true },
      });
      if (!membership) {
        return res.status(403).json({ error: "You no longer belong to this company." });
      }

      const existingPendingRequest = await prisma.timeCardEditRequest.findFirst({
        where: {
          attendanceId: attendance.id,
          employeeId: requesterId,
          status: "pending",
        },
      });

      if (existingPendingRequest) {
        return res.status(409).json({
          error: "There is already a pending request for this time card.",
        });
      }

      const created = await prisma.timeCardEditRequest.create({
        data: {
          requestType,
          attendanceId: attendance.id,
          serviceProjectId:
            attendance.UserServiceProject?.service_project?.id || null,
          employeeId: requesterId,
          companyId,
          originalCheckInTime: attendance.check_in_time,
          originalCheckOutTime: attendance.check_out_time,
          requestedCheckInTime: parsedCheckIn,
          requestedCheckOutTime: parsedCheckOut,
          reason: normalizedReason,
          employeeNote: normalizedEmployeeNote,
          employeeSignature: String(employeeSignature).trim(),
          clientRequestId: normalizedClientRequestId,
          status: "pending",
        },
        include: requestInclude,
      });

      await this.notifyOfficeUsersAboutRequest({
        companyId,
        actorId: requesterId,
        actorName: attendance.user.name,
        requestId: created.id,
        workDate: attendance.date,
        requestType,
      }).catch((notificationError) => {
        console.error(
          "[TimeCardEditRequestController.create] Notification failed:",
          notificationError
        );
      });

      return res.status(201).json(mapTimeCardEditRequest(created));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.create] Error:", error);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ error: "This request was already submitted." });
      }
      return res.status(500).json({
        error: "Failed to create time card request.",
      });
    }
  }

  async listMine(req: AuthRequest, res: Response) {
    try {
      const requesterId = this.getRequesterId(req);
      if (!requesterId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const requests = await prisma.timeCardEditRequest.findMany({
        where: {
          employeeId: requesterId,
        },
        include: requestInclude,
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json(requests.map(mapTimeCardEditRequest));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.listMine] Error:", error);
      return res.status(500).json({
        error: "Failed to fetch your time card requests.",
      });
    }
  }

  async listByCompany(req: AuthRequest, res: Response) {
    try {
      const requesterId = this.getRequesterId(req);
      if (!requesterId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { companyId } = req.params;
      const { status } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: "companyId is required." });
      }

      const canReview = await this.canReviewCompany(requesterId, companyId);
      if (!canReview) {
        return res.status(403).json({
          error: "You do not have permission to access these requests.",
        });
      }

      const validStatuses = new Set(["pending", "approved", "denied"]);
      const parsedStatus =
        typeof status === "string" && validStatuses.has(status) ? status : undefined;

      const requests = await prisma.timeCardEditRequest.findMany({
        where: {
          companyId,
          ...(parsedStatus ? { status: parsedStatus as any } : {}),
        },
        include: requestInclude,
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json(requests.map(mapTimeCardEditRequest));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.listByCompany] Error:", error);
      return res.status(500).json({
        error: "Failed to fetch company time card requests.",
      });
    }
  }

  async review(req: AuthRequest, res: Response) {
    try {
      const reviewerId = this.getRequesterId(req);
      if (!reviewerId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      const {
        status,
        managerNote,
        managerSignature,
        approvedCheckInTime,
        approvedCheckOutTime,
        approvedAttendanceNote,
      } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Request id is required." });
      }

      if (status !== "approved" && status !== "denied") {
        return res.status(400).json({
          error: "status must be either 'approved' or 'denied'.",
        });
      }

      if (!managerSignature || !String(managerSignature).trim()) {
        return res.status(400).json({
          error: "managerSignature is required.",
        });
      }

      const requestRecord = await prisma.timeCardEditRequest.findUnique({
        where: { id },
        include: requestInclude,
      });

      if (!requestRecord) {
        return res.status(404).json({ error: "Time card edit request not found." });
      }

      const canReview = await this.canReviewCompany(reviewerId, requestRecord.companyId);
      if (!canReview) {
        return res.status(403).json({
          error: "You do not have permission to review this request.",
        });
      }

      if (requestRecord.status !== "pending") {
        return res.status(409).json({
          error: "Only pending requests can be reviewed.",
        });
      }

      const reviewer = await prisma.user.findUnique({
        where: { id: reviewerId },
        select: { id: true, name: true },
      });

      if (!reviewer) {
        return res.status(404).json({ error: "Reviewer user not found." });
      }

      let finalCheckIn: Date | null = null;
      let finalCheckOut: Date | null = null;
      let finalAttendanceNote: string | null = null;

      if (status === "approved") {
        const approvedCheckIn = parseOptionalDate(approvedCheckInTime);
        const approvedCheckOut = parseOptionalDate(approvedCheckOutTime);

        finalCheckIn = approvedCheckIn || requestRecord.requestedCheckInTime;

        if (approvedCheckOutTime !== undefined) {
          finalCheckOut = approvedCheckOut;
        } else {
          finalCheckOut = requestRecord.requestedCheckOutTime;
        }

        if (!finalCheckIn) {
          return res.status(400).json({ error: "approvedCheckInTime is invalid." });
        }

        if (approvedCheckOutTime && !approvedCheckOut) {
          return res.status(400).json({ error: "approvedCheckOutTime is invalid." });
        }

        if (finalCheckOut && finalCheckIn >= finalCheckOut) {
          return res.status(400).json({
            error: "Approved check-in must be earlier than approved check-out.",
          });
        }

        if (requestRecord.requestType === "missing_entry" && !finalCheckOut) {
          return res.status(400).json({
            error: "Approved check-out is required for a missing time entry.",
          });
        }

        if (approvedAttendanceNote !== undefined) {
          finalAttendanceNote = String(approvedAttendanceNote).trim() || null;
        } else if (requestRecord.employeeNote) {
          finalAttendanceNote = requestRecord.employeeNote;
        } else {
          finalAttendanceNote = requestRecord.attendance?.note || null;
        }

        if (finalAttendanceNote && finalAttendanceNote.length > 5000) {
          return res.status(400).json({ error: "Attendance note cannot exceed 5000 characters." });
        }
      }

      const updated = await prisma.$transaction(
        async (tx) => {
          const claim = await tx.timeCardEditRequest.updateMany({
            where: { id: requestRecord.id, status: "pending" },
            data: {
              status,
              reviewerId,
              reviewedAt: new Date(),
              managerNote:
                typeof managerNote === "string" && managerNote.trim().length > 0
                  ? managerNote.trim()
                  : null,
              managerSignature: String(managerSignature).trim(),
              approvedCheckInTime: status === "approved" ? finalCheckIn : null,
              approvedCheckOutTime: status === "approved" ? finalCheckOut : null,
              approvedAttendanceNote:
                status === "approved" ? finalAttendanceNote : null,
            },
          });

          if (claim.count !== 1) {
            throw new Error("REQUEST_ALREADY_REVIEWED");
          }

          let attendanceId = requestRecord.attendanceId;
          if (status === "approved" && finalCheckIn) {
            if (requestRecord.requestType === "missing_entry") {
              if (!requestRecord.serviceProjectId || !finalCheckOut) {
                throw new Error("MISSING_ENTRY_CONTEXT_INVALID");
              }

              const result = await attendanceService.createClosedAttendanceInTransaction(
                tx,
                {
                  user_id: requestRecord.employeeId,
                  service_project_id: requestRecord.serviceProjectId,
                  check_in_time: finalCheckIn,
                  check_out_time: finalCheckOut,
                  date: finalCheckIn,
                  note: finalAttendanceNote,
                },
                {
                  preserveAssignmentState: true,
                  expectedCompanyId: requestRecord.companyId,
                }
              );
              attendanceId = result.attendance.id;
            } else {
              if (!requestRecord.attendanceId) {
                throw new Error("ATTENDANCE_NOT_FOUND");
              }
              await tx.userAttendance.update({
                where: { id: requestRecord.attendanceId },
                data: {
                  check_in_time: finalCheckIn,
                  check_out_time: finalCheckOut,
                  note: finalAttendanceNote,
                },
              });
            }
          }

          if (attendanceId !== requestRecord.attendanceId) {
            await tx.timeCardEditRequest.update({
              where: { id: requestRecord.id },
              data: { attendanceId },
            });
          }

          const result = await tx.timeCardEditRequest.findUnique({
            where: { id: requestRecord.id },
            include: requestInclude,
          });
          if (!result) {
            throw new Error("REQUEST_NOT_FOUND");
          }
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );

      await this.notifyEmployeeAboutReview({
        employeeId: requestRecord.employee.id,
        actorId: reviewer.id,
        actorName: reviewer.name,
        requestId: updated.id,
        status,
        employeeToken: requestRecord.employee.expoPushToken,
        requestType: requestRecord.requestType as RequestType,
      }).catch((notificationError) => {
        console.error(
          "[TimeCardEditRequestController.review] Notification failed:",
          notificationError
        );
      });

      return res.json(mapTimeCardEditRequest(updated));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.review] Error:", error);
      const conflictErrors = new Set([
        "REQUEST_ALREADY_REVIEWED",
        "DUPLICATE_ATTENDANCE",
        "ATTENDANCE_OVERLAP",
      ]);
      if (conflictErrors.has(error?.message)) {
        const message =
          error.message === "REQUEST_ALREADY_REVIEWED"
            ? "This request has already been reviewed."
            : error.message === "ATTENDANCE_OVERLAP"
              ? "This time entry overlaps another attendance record."
              : "This attendance record already exists.";
        return res.status(409).json({ error: message });
      }
      if (
        [
          "NOT_ASSIGNED",
          "SERVICE_COMPANY_MISMATCH",
          "PROJECT_INACTIVE",
          "SERVICE_CANCELED",
          "SERVICE_NOT_FOUND",
          "USER_NOT_FOUND",
          "INVALID_ATTENDANCE_TIME",
          "CHECK_OUT_BEFORE_CHECK_IN",
          "ATTENDANCE_NOT_FOUND",
          "MISSING_ENTRY_CONTEXT_INVALID",
        ].includes(error?.message)
      ) {
        return res.status(400).json({
          error: "The requested time entry can no longer be approved with its current project data.",
        });
      }
      return res.status(500).json({
        error: "Failed to review time card request.",
      });
    }
  }

  async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const requesterId = this.getRequesterId(req);
      if (!requesterId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      const asBase64 = String(req.query.as || "").toLowerCase() === "base64";

      if (!id) {
        return res.status(400).json({ error: "Request id is required." });
      }

      const requestRecord = await prisma.timeCardEditRequest.findUnique({
        where: { id },
        include: requestInclude,
      });

      if (!requestRecord) {
        return res.status(404).json({ error: "Time card edit request not found." });
      }

      const canReview = await this.canReviewCompany(requesterId, requestRecord.companyId);
      const isOwner = requestRecord.employeeId === requesterId;
      if (!canReview && !isOwner) {
        return res.status(403).json({
          error: "You do not have permission to access this PDF.",
        });
      }

      if (requestRecord.status === "pending") {
        return res.status(409).json({
          error: "PDF is available only after the request is reviewed.",
        });
      }

      const pdfBuffer = await this.generateReviewPdfBuffer(requestRecord);

      const fileName = `timecard-request-review-${requestRecord.id}.pdf`;
      if (asBase64) {
        return res.json({
          fileName,
          base64: pdfBuffer.toString("base64"),
          mimeType: "application/pdf",
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(pdfBuffer);
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.downloadPdf] Error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to generate time card review PDF.",
      });
    }
  }
}
