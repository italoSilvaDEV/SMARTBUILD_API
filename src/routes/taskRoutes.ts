import { Router } from "express";
import { TaskController } from "../controllers/tasks/TaskController";
import { TaskCommentController } from "../controllers/tasks/TaskCommentController";
import { TaskNotificationController } from "../controllers/tasks/TaskNotificationController";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";

const taskRoutes = Router();
const taskController = new TaskController();
const taskCommentController = new TaskCommentController();
const taskNotificationController = new TaskNotificationController();
const upload = multer(uploadConfig.upload("./public/tmp/task-files"));

// CRUD de Tasks
taskRoutes.post("/", checkToken, taskController.create);
taskRoutes.get("/project/:projectId", checkToken, taskController.listByProject);
taskRoutes.get("/user/:userId", checkToken, taskController.listByUser);
taskRoutes.put("/:id", checkToken, taskController.update);
taskRoutes.delete("/:id", checkToken, taskController.delete);

// Arquivos de Tasks
taskRoutes.post("/:taskId/files", checkToken, upload.single("file"), taskController.uploadFile);
taskRoutes.delete("/files/:fileId", checkToken, taskController.deleteFile);

// Comentários de Tasks
taskRoutes.post("/:taskId/comments", checkToken, taskCommentController.create);
taskRoutes.get("/:taskId/comments", checkToken, taskCommentController.listByTask);
taskRoutes.delete("/comments/:id", checkToken, taskCommentController.delete);

// Notificações de Tasks
taskRoutes.get("/notifications/user/:userId", checkToken, taskNotificationController.listByUser);
taskRoutes.put("/notifications/:id/read", checkToken, taskNotificationController.markAsRead);
taskRoutes.put("/notifications/user/:userId/read-all", checkToken, taskNotificationController.markAllAsRead);

export { taskRoutes };
