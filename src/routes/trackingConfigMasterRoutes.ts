import { Router } from "express";
import { MasterTrackingConfigController } from "../controllers/tracking/MasterTrackingConfigController";
import { checkToken } from "../middlewares/checkToken";
import { requireMaster } from "../middlewares/requireMaster";

const trackingConfigMasterRoutes = Router();
const controller = new MasterTrackingConfigController();

trackingConfigMasterRoutes.use(checkToken, requireMaster);
trackingConfigMasterRoutes.get("/", controller.list.bind(controller));
trackingConfigMasterRoutes.get(
  "/companies/:companyId",
  controller.readCompany.bind(controller)
);
trackingConfigMasterRoutes.put("/global", controller.saveGlobal.bind(controller));
trackingConfigMasterRoutes.put(
  "/companies/:companyId",
  controller.saveCompany.bind(controller)
);
trackingConfigMasterRoutes.delete(
  "/companies/:companyId",
  controller.restoreCompany.bind(controller)
);

export { trackingConfigMasterRoutes };
