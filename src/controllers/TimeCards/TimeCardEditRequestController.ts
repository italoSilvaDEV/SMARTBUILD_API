import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";
import { PushNotificationService } from "../../services/PushNotificationService";
import axios from "axios";

type ReviewStatus = "approved" | "denied";

interface AuthRequest extends Request {
  userId?: string;
}

const MANAGEMENT_OFFICES_BLOCKED = new Set(["worker", "master"]);

const TIMECARD_REQUEST_LINK = "/time-cards?tab=requests";
const PDFSHIFT_API_URL = "https://api.pdfshift.io/v3/convert/pdf";

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
  return {
    id: record.id,
    attendanceId: record.attendanceId,
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
    managerNote: record.managerNote,
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
          select: { name: true },
        },
      },
    });

    if (!membership) return false;

    const officeName = membership.office?.name?.trim().toLowerCase() || "";
    return !MANAGEMENT_OFFICES_BLOCKED.has(officeName);
  }

  private async notifyOfficeUsersAboutRequest(params: {
    companyId: string;
    actorId: string;
    actorName: string;
    requestId: string;
    workDate: Date;
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
          },
        },
      },
    });

    const recipients = memberships
      .filter((membership) => {
        const officeName = membership.office?.name?.trim().toLowerCase() || "";
        return !MANAGEMENT_OFFICES_BLOCKED.has(officeName);
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

    const message = `${params.actorName} requested a time card edit for ${workDateText}.`;

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
  }): Promise<void> {
    const message =
      params.status === "approved"
        ? `Your time card edit request was approved by ${params.actorName}.`
        : `Your time card edit request was denied by ${params.actorName}.`;

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
          },
        },
      ]);
    }
  }

  private buildReviewPdfHtml(record: any): { html: string; css: string } {
    const reviewStatus = record.status || "pending";
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
          <title>Time Card Edit Review</title>
        </head>
        <body>
          <div class="document">
            <h1>Time Card Edit Request Review</h1>
            <p class="meta">Generated at: ${escapeHtml(formatDateTimeForPdf(new Date()))}</p>

            <section class="block">
              <h2>Employee</h2>
              <p><strong>Name:</strong> ${escapeHtml(employeeName)}</p>
              <p><strong>Work Date:</strong> ${escapeHtml(workDate)}</p>
              <p><strong>Status:</strong> <span class="badge ${escapeHtml(reviewStatus)}">${escapeHtml(reviewStatus)}</span></p>
            </section>

            <section class="block">
              <h2>Original vs Requested</h2>
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Original</th>
                    <th>Requested</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Clock In</td>
                    <td>${escapeHtml(formatDateTimeForPdf(record.originalCheckInTime))}</td>
                    <td>${escapeHtml(formatDateTimeForPdf(record.requestedCheckInTime))}</td>
                    <td>${escapeHtml(formatDateTimeForPdf(record.approvedCheckInTime))}</td>
                  </tr>
                  <tr>
                    <td>Clock Out</td>
                    <td>${escapeHtml(formatDateTimeForPdf(record.originalCheckOutTime))}</td>
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
        attendanceId,
        requestedCheckInTime,
        requestedCheckOutTime,
        reason,
        employeeNote,
        employeeSignature,
      } = req.body;

      if (!attendanceId || !requestedCheckInTime || !reason || !employeeSignature) {
        return res.status(400).json({
          error:
            "attendanceId, requestedCheckInTime, reason and employeeSignature are required.",
        });
      }

      const parsedCheckIn = parseOptionalDate(requestedCheckInTime);
      const parsedCheckOut = parseOptionalDate(requestedCheckOutTime);

      if (!parsedCheckIn) {
        return res.status(400).json({ error: "requestedCheckInTime is invalid." });
      }

      if (requestedCheckOutTime && !parsedCheckOut) {
        return res.status(400).json({ error: "requestedCheckOutTime is invalid." });
      }

      if (parsedCheckOut && parsedCheckIn > parsedCheckOut) {
        return res.status(400).json({
          error: "Requested check-in cannot be later than requested check-out.",
        });
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
          attendanceId: attendance.id,
          employeeId: requesterId,
          companyId,
          originalCheckInTime: attendance.check_in_time,
          originalCheckOutTime: attendance.check_out_time,
          requestedCheckInTime: parsedCheckIn,
          requestedCheckOutTime: parsedCheckOut,
          reason: String(reason).trim(),
          employeeNote:
            typeof employeeNote === "string" && employeeNote.trim().length > 0
              ? employeeNote.trim()
              : null,
          employeeSignature: String(employeeSignature).trim(),
          status: "pending",
        },
        include: {
          employee: {
            select: { id: true, name: true, avatar: true },
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
              UserServiceProject: {
                select: {
                  service_project: {
                    select: {
                      name: true,
                      Project: {
                        select: {
                          location: true,
                          client: {
                            select: {
                              name: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      await this.notifyOfficeUsersAboutRequest({
        companyId,
        actorId: requesterId,
        actorName: attendance.user.name,
        requestId: created.id,
        workDate: attendance.date,
      });

      return res.status(201).json(mapTimeCardEditRequest(created));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.create] Error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to create time card edit request.",
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
        include: {
          employee: {
            select: { id: true, name: true, avatar: true },
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
              UserServiceProject: {
                select: {
                  service_project: {
                    select: {
                      name: true,
                      Project: {
                        select: {
                          location: true,
                          client: {
                            select: { name: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json(requests.map(mapTimeCardEditRequest));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.listMine] Error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to fetch your edit requests.",
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
        include: {
          employee: {
            select: { id: true, name: true, avatar: true },
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
              UserServiceProject: {
                select: {
                  service_project: {
                    select: {
                      name: true,
                      Project: {
                        select: {
                          location: true,
                          client: {
                            select: { name: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json(requests.map(mapTimeCardEditRequest));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.listByCompany] Error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to fetch company edit requests.",
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
      const { status, managerNote, managerSignature, approvedCheckInTime, approvedCheckOutTime } =
        req.body;

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
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              expoPushToken: true,
            },
          },
          attendance: {
            select: {
              id: true,
              check_in_time: true,
              check_out_time: true,
              date: true,
              UserServiceProject: {
                select: {
                  service_project: {
                    select: {
                      name: true,
                      Project: {
                        select: {
                          location: true,
                          client: {
                            select: { name: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
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

        if (finalCheckOut && finalCheckIn > finalCheckOut) {
          return res.status(400).json({
            error: "Approved check-in cannot be later than approved check-out.",
          });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (status === "approved" && finalCheckIn) {
          await tx.userAttendance.update({
            where: {
              id: requestRecord.attendanceId,
            },
            data: {
              check_in_time: finalCheckIn,
              check_out_time: finalCheckOut,
            },
          });
        }

        return tx.timeCardEditRequest.update({
          where: { id: requestRecord.id },
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
          },
          include: {
            employee: {
              select: { id: true, name: true, avatar: true },
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
                UserServiceProject: {
                  select: {
                    service_project: {
                      select: {
                        name: true,
                        Project: {
                          select: {
                            location: true,
                            client: {
                              select: { name: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
      });

      await this.notifyEmployeeAboutReview({
        employeeId: requestRecord.employee.id,
        actorId: reviewer.id,
        actorName: reviewer.name,
        requestId: updated.id,
        status,
        employeeToken: requestRecord.employee.expoPushToken,
      });

      return res.json(mapTimeCardEditRequest(updated));
    } catch (error: any) {
      console.error("[TimeCardEditRequestController.review] Error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to review time card edit request.",
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
        include: {
          employee: {
            select: {
              id: true,
              name: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
            },
          },
          attendance: {
            select: {
              date: true,
            },
          },
        },
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

      const fileName = `timecard-edit-review-${requestRecord.id}.pdf`;
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
