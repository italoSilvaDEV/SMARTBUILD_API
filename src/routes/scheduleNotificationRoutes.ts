import { Router } from "express";
import { ScheduleNotificationController } from "../controllers/jobSchedule/ScheduleNotificationController";
import { checkToken } from "../middlewares/checkToken";

const scheduleNotificationRoutes = Router();
const controller = new ScheduleNotificationController();

scheduleNotificationRoutes.get("/unread-count", checkToken, (req, res) =>
  controller.unreadCount(req, res)
);
scheduleNotificationRoutes.put("/read-all", checkToken, (req, res) =>
  controller.markAllAsRead(req, res)
);

export { scheduleNotificationRoutes };
