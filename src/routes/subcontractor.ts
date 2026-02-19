import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { CreateSubcontractorController } from "../controllers/Subcontractor/CreateSubcontractorController";
import { FindAllSubcontractorsController } from "../controllers/Subcontractor/FindAllSubcontractorsController";
import { UpdateSubcontractorController } from "../controllers/Subcontractor/UpdateSubcontractorController";
import { DeleteSubcontractorController } from "../controllers/Subcontractor/DeleteSubcontractorController";
import { SubcontractorProjectsController } from "../controllers/Subcontractor/SubcontractorProjectsController";
import { DashboardSubcontractorController } from "../controllers/Subcontractor/dashboardSubcontractorController";
import { DashboardSubcontractorCompanyController } from "../controllers/Subcontractor/dashboardSubcontractorCompanyController";

const subcontractorRoutes = Router();

const createSubcontractorController = new CreateSubcontractorController();
subcontractorRoutes.post("/subcontractor", checkToken, createSubcontractorController.handle);

const findAllSubcontractorsController = new FindAllSubcontractorsController();
subcontractorRoutes.post("/subcontractor/find", checkToken, findAllSubcontractorsController.handle);

const updateSubcontractorController = new UpdateSubcontractorController();
subcontractorRoutes.put("/subcontractor", checkToken, updateSubcontractorController.handle);

const deleteSubcontractorController = new DeleteSubcontractorController();
subcontractorRoutes.delete("/subcontractor/:id", checkToken, deleteSubcontractorController.handle);

// Novas rotas para projetos e dashboard do subcontractor
const subcontractorProjectsController = new SubcontractorProjectsController();
subcontractorRoutes.get("/subcontractor/:id/details", checkToken, subcontractorProjectsController.getSubcontractorDetails.bind(subcontractorProjectsController));
subcontractorRoutes.get("/subcontractor/projects", checkToken, subcontractorProjectsController.getSubcontractorProjects.bind(subcontractorProjectsController));

const dashboardSubcontractorController = new DashboardSubcontractorController();
const dashboardSubcontractorCompanyController = new DashboardSubcontractorCompanyController();
// Rota "company" antes da rota :subcontractorId para não interpretar "company" como id
subcontractorRoutes.get("/subcontractor/dashboard/company/:companyId", checkToken, dashboardSubcontractorCompanyController.handle.bind(dashboardSubcontractorCompanyController));
subcontractorRoutes.get("/subcontractor/dashboard/:subcontractorId", checkToken, dashboardSubcontractorController.handle.bind(dashboardSubcontractorController));

export { subcontractorRoutes };

