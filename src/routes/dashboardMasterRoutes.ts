import { Router } from "express";
import { DashboardController } from "../controllers/MasterDashboard/DashboardController";
import { FindClientById } from "../controllers/MasterDashboard/findClient";
import { checkToken } from "../middlewares/checkToken";

const dashboardMasterRoutes = Router();
const dashboardController = new DashboardController();
const findClientController = new FindClientById();

dashboardMasterRoutes.get("/master-dashboard", checkToken, dashboardController.handle);
dashboardMasterRoutes.get("/client/details/:companyId", checkToken, findClientController.handle);

export { dashboardMasterRoutes };
