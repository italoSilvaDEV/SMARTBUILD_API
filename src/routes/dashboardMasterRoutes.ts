import { Router } from "express";
import { DashboardController } from "../controllers/MasterDashboard/DashboardController";
import { FindClientById, GetClientEditData, UpdateClientData } from "../controllers/MasterDashboard/findClient";
import { checkToken } from "../middlewares/checkToken";

const dashboardMasterRoutes = Router();
const dashboardController = new DashboardController();
const findClientController = new FindClientById();
const getClientEditDataController = new GetClientEditData();
const updateClientDataController = new UpdateClientData();

dashboardMasterRoutes.get("/master-dashboard", checkToken, dashboardController.handle);
dashboardMasterRoutes.get("/client/details/:companyId", checkToken, findClientController.handle);
dashboardMasterRoutes.get("/client/edit-data/:companyId", checkToken, getClientEditDataController.handle);
dashboardMasterRoutes.put("/client/update/:companyId", checkToken, updateClientDataController.handle);

export { dashboardMasterRoutes };
