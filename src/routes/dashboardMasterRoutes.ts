import { requireMaster } from '../middlewares/requireMaster';
import { Router } from "express";
import { DashboardController } from "../controllers/MasterDashboard/DashboardController";
import { FindClientById, GetClientEditData, UpdateClientData } from "../controllers/MasterDashboard/findClient";
import { checkToken } from "../middlewares/checkToken";

const dashboardMasterRoutes = Router();
const dashboardController = new DashboardController();
const findClientController = new FindClientById();
const getClientEditDataController = new GetClientEditData();
const updateClientDataController = new UpdateClientData();

dashboardMasterRoutes.get("/master-dashboard", checkToken, requireMaster, dashboardController.handle);
dashboardMasterRoutes.get("/client/details/:companyId", checkToken, requireMaster, findClientController.handle);
dashboardMasterRoutes.get("/client/edit-data/:companyId", checkToken, requireMaster, getClientEditDataController.handle);
dashboardMasterRoutes.put("/client/update/:companyId", checkToken, requireMaster, updateClientDataController.handle);

export { dashboardMasterRoutes };
