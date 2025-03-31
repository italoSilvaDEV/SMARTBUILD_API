import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { ChangeOrderController } from "../controllers/projects/ChangeOrderController";

const changeOrderRoutes = Router();
const changeOrderController = new ChangeOrderController();
changeOrderRoutes.post("/", checkToken, changeOrderController.create);
changeOrderRoutes.get("/project/:projectId", checkToken, changeOrderController.findByProject);
changeOrderRoutes.get("/:id", changeOrderController.findById);
changeOrderRoutes.put("/:id", checkToken, changeOrderController.update);
changeOrderRoutes.patch("/:id/status",  changeOrderController.updateStatus);
changeOrderRoutes.patch("/:id/sign", changeOrderController.addSignature);
changeOrderRoutes.put("/:id/cancel", checkToken, changeOrderController.cancel);
changeOrderRoutes.post("/:id/service", checkToken, changeOrderController.addService);
changeOrderRoutes.delete("/:id/service/:serviceProjectId", checkToken, changeOrderController.removeService);
changeOrderRoutes.put("/:id/service/:serviceProjectId", checkToken, changeOrderController.updateService);

export { changeOrderRoutes }; 