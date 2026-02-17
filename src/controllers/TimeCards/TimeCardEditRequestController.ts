import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { SocketService } from "../../services/SocketService";
import { PushNotificationService } from "../../services/PushNotificationService";

type ReviewStatus = "approved" | "denied";

interface AuthRequest extends Request {
  userId?: string;
}

const MANAGEMENT_OFFICES_BLOCKED = new Set(["worker", "master"]);

const TIMECARD_REQUEST_LINK = "/time-cards?tab=requests";

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
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
}
