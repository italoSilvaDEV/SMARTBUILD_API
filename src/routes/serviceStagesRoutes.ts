import { Router } from "express";
import { ServiceStageController } from "../controllers/projects/ProjectStagesController";
import { checkToken } from "../middlewares/checkToken";
const serviceStageRoutes = Router();

serviceStageRoutes.post("/", checkToken, ServiceStageController.create);
serviceStageRoutes.get("/:id", checkToken, ServiceStageController.findById);
serviceStageRoutes.put("/:id", checkToken, ServiceStageController.update);
serviceStageRoutes.delete("/:id", checkToken, ServiceStageController.delete);

export { serviceStageRoutes};
