import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ScheduleNotificationController {
  async unreadCount(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const unreadCount = await prisma.scheduleNotification.count({
        where: { userId, readAt: null },
      });

      return res.json({ unreadCount });
    } catch (error) {
      console.error("[ScheduleNotificationController.unreadCount] Error:", error);
      return res.status(500).json({ error: "Unable to load schedule notifications" });
    }
  }

  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await prisma.scheduleNotification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });

      return res.json({ updatedCount: result.count });
    } catch (error) {
      console.error("[ScheduleNotificationController.markAllAsRead] Error:", error);
      return res.status(500).json({ error: "Unable to update schedule notifications" });
    }
  }
}
