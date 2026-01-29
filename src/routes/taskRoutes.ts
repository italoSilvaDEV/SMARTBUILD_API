import { Router } from "express";
import { TaskController } from "../controllers/tasks/TaskController";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import { multerConfig } from "../config/multer";

const taskRoutes = Router();
const taskController = new TaskController();
const upload = multer(multerConfig);

// CRUD de Tasks
taskRoutes.post("/", checkToken, taskController.create);
taskRoutes.get("/project/:projectId", checkToken, taskController.listByProject);
taskRoutes.get("/user/:userId", checkToken, taskController.listByUser);
taskRoutes.put("/:id", checkToken, taskController.update);
taskRoutes.delete("/:id", checkToken, taskController.delete);

// Arquivos de Tasks
taskRoutes.post("/:taskId/files", checkToken, upload.single("file"), taskController.uploadFile);
taskRoutes.delete("/files/:fileId", checkToken, taskController.deleteFile);

export { taskRoutes };
