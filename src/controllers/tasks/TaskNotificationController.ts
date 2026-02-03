import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class TaskNotificationController {
  // Listar notificações de um usuário
  async listByUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { unreadOnly = "false", limit = "50", offset = "0" } = req.query;

      if (!prisma || !prisma.taskNotification) {
        throw new Error("Prisma client or TaskNotification model is not initialized");
      }

      const whereClause: any = { userId };
      if (unreadOnly === "true") {
        whereClause.isRead = false;
      }

      const notifications = await prisma.taskNotification.findMany({
        where: whereClause,
        include: {
          actor: { select: { id: true, name: true, avatar: true } },
          task: { select: { id: true, title: true } }
        } as any,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      const notificationsWithUrls = await Promise.all(
        notifications.map(async (notification: any) => {
          let actorAvatarUrl = null;
          if (notification.actor?.avatar) {
            actorAvatarUrl = await getPresignedUrl(notification.actor.avatar);
          }
          return {
            ...notification,
            actor: notification.actor ? { ...notification.actor, avatar: actorAvatarUrl } : null
          };
        })
      );

      const unreadCount = await prisma.taskNotification.count({
        where: { userId, isRead: false }
      });

      return res.json({
        notifications: notificationsWithUrls,
        total: notificationsWithUrls.length,
        unreadCount
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
      await prisma.taskNotification.update({
        where: { id },
        data: { isRead: true }
      });
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
      await prisma.taskNotification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[TaskNotificationController.markAllAsRead] Error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}
