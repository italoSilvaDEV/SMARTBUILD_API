import { Router } from "express";
import { DashboardController } from "../controllers/MasterDashboard/DashboardController";
import { checkToken } from "../middlewares/checkToken";

const dashboardMasterRoutes = Router();
const dashboardController = new DashboardController();

dashboardMasterRoutes.get("/master-dashboard", checkToken, dashboardController.handle);

export { dashboardMasterRoutes };
