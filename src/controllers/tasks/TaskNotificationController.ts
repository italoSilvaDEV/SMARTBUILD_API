import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const TIMECARD_NOTIFICATION_PREFIX = "timecard_edit_request";

export class TaskNotificationController {
  private async withSignedAvatar<T extends { actor?: { avatar?: string | null } | null }>(
    item: T
  ): Promise<T> {
    if (item.actor?.avatar) {
      const signedAvatar = await getPresignedUrl(item.actor.avatar);
      return {
        ...item,
        actor: {
          ...item.actor,
          avatar: signedAvatar,
        },
      };
    }

    return item;
  }

  // Listar notificações de um usuário
  async listByUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { unreadOnly = "false", limit = "50", offset = "0" } = req.query;

      if (!prisma || !prisma.taskNotification) {
        throw new Error("Prisma client or TaskNotification model is not initialized");
      }

      const parsedLimit = Math.max(parseInt(limit as string, 10) || 50, 1);
      const parsedOffset = Math.max(parseInt(offset as string, 10) || 0, 0);
      const takeForMerge = Math.max(parsedLimit + parsedOffset, 50);
      const onlyUnread = unreadOnly === "true";

      const taskWhereClause: any = { userId };
      if (onlyUnread) {
        taskWhereClause.isRead = false;
      }

      const feedWhereClause: any = {
        userId,
        type: {
          startsWith: TIMECARD_NOTIFICATION_PREFIX,
        },
      };
      if (onlyUnread) {
        feedWhereClause.isRead = false;
      }

      const [taskNotifications, feedNotifications, taskUnreadCount, feedUnreadCount] =
        await Promise.all([
          prisma.taskNotification.findMany({
            where: taskWhereClause,
            include: {
              actor: { select: { id: true, name: true, avatar: true } },
              task: { select: { id: true, title: true, projectId: true } },
            },
            orderBy: { createdAt: "desc" },
            take: takeForMerge,
          }),
          prisma.feedNotification.findMany({
            where: feedWhereClause,
            include: {
              actor: { select: { id: true, name: true, avatar: true } },
            },
            orderBy: { date_creation: "desc" },
            take: takeForMerge,
          }),
          prisma.taskNotification.count({
            where: { userId, isRead: false },
          }),
          prisma.feedNotification.count({
            where: {
              userId,
              isRead: false,
              type: {
                startsWith: TIMECARD_NOTIFICATION_PREFIX,
              },
            },
          }),
        ]);

      const mappedTaskNotifications = taskNotifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        message: notification.message,
        isRead: notification.isRead,
        taskId: notification.taskId,
        userId: notification.userId,
        actorId: notification.actorId,
        actor: notification.actor,
        task: notification.task,
        createdAt: notification.createdAt,
        targetPath: null,
      }));

      const mappedFeedNotifications = feedNotifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        message: notification.message,
        isRead: notification.isRead,
        taskId: null,
        userId: notification.userId,
        actorId: notification.actorId,
        actor: notification.actor,
        task: null,
        createdAt: notification.date_creation,
        targetPath: notification.relatedLink || null,
      }));

      const mergedNotifications = [...mappedTaskNotifications, ...mappedFeedNotifications]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(parsedOffset, parsedOffset + parsedLimit);

      const notificationsWithUrls = await Promise.all(
        mergedNotifications.map((notification) => this.withSignedAvatar(notification))
      );

      const unreadCount = taskUnreadCount + feedUnreadCount;

      return res.json({
        notifications: notificationsWithUrls,
        total: notificationsWithUrls.length,
        unreadCount,
      });
    } catch (error: any) {
      console.error("[TaskNotificationController.listByUser] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Marcar notificação como lida
  async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!prisma || !prisma.taskNotification) {
        throw new Error("Prisma client or TaskNotification model is not initialized");
      }

      const [taskUpdate, feedUpdate] = await Promise.all([
        prisma.taskNotification.updateMany({
          where: { id },
          data: { isRead: true },
        }),
        prisma.feedNotification.updateMany({
          where: {
            id,
            type: {
              startsWith: TIMECARD_NOTIFICATION_PREFIX,
            },
          },
          data: { isRead: true },
        }),
      ]);

      if (taskUpdate.count === 0 && feedUpdate.count === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("[TaskNotificationController.markAsRead] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  // Marcar todas como lidas
  async markAllAsRead(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      if (!prisma || !prisma.taskNotification) {
        throw new Error("Prisma client or TaskNotification model is not initialized");
      }

      await Promise.all([
        prisma.taskNotification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true },
        }),
        prisma.feedNotification.updateMany({
          where: {
            userId,
            isRead: false,
            type: {
              startsWith: TIMECARD_NOTIFICATION_PREFIX,
            },
          },
          data: { isRead: true },
        }),
      ]);

      return res.json({ success: true });
    } catch (error: any) {
      console.error("[TaskNotificationController.markAllAsRead] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}
