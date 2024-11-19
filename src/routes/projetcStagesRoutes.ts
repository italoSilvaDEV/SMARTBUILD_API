import { Router } from "express";
import { ProjectStageController } from "../controllers/projects/ProjectStagesController";
import { checkToken } from "../middlewares/checkToken";
const projectStageRoutes = Router();

projectStageRoutes.post("/", checkToken, ProjectStageController.create);
projectStageRoutes.get("/:id", checkToken, ProjectStageController.findById);
projectStageRoutes.get("/", checkToken, ProjectStageController.findAll);
projectStageRoutes.put("/:id", checkToken, ProjectStageController.update);
projectStageRoutes.delete("/:id", checkToken, ProjectStageController.delete);

export default projectStageRoutes;
