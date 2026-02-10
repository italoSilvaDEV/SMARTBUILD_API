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
taskRoutes.post("/", checkToken, (req, res) => taskController.create(req, res));
taskRoutes.get("/project/:projectId", checkToken, (req, res) => taskController.listByProject(req, res));
taskRoutes.get("/user/:userId", checkToken, (req, res) => taskController.listByUser(req, res));
taskRoutes.put("/:id", checkToken, (req, res) => taskController.update(req, res));
taskRoutes.delete("/:id", checkToken, (req, res) => taskController.delete(req, res));

// Arquivos de Tasks
taskRoutes.post("/:taskId/files", checkToken, upload.single("file"), (req, res) => taskController.uploadFile(req, res));
taskRoutes.delete("/files/:fileId", checkToken, (req, res) => taskController.deleteFile(req, res));

// Comentários de Tasks
taskRoutes.post("/:taskId/comments", checkToken, (req, res) => taskCommentController.create(req, res));
taskRoutes.get("/:taskId/comments", checkToken, (req, res) => taskCommentController.listByTask(req, res));
taskRoutes.delete("/comments/:id", checkToken, (req, res) => taskCommentController.delete(req, res));

// Notificações de Tasks
taskRoutes.get("/notifications/user/:userId", checkToken, (req, res) => taskNotificationController.listByUser(req, res));
taskRoutes.put("/notifications/:id/read", checkToken, (req, res) => taskNotificationController.markAsRead(req, res));
taskRoutes.put("/notifications/user/:userId/read-all", checkToken, (req, res) => taskNotificationController.markAllAsRead(req, res));

export { taskRoutes };
