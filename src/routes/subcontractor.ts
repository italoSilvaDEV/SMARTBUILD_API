import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { CreateSubcontractorController } from "../controllers/Subcontractor/CreateSubcontractorController";
import { FindAllSubcontractorsController } from "../controllers/Subcontractor/FindAllSubcontractorsController";
import { UpdateSubcontractorController } from "../controllers/Subcontractor/UpdateSubcontractorController";
import { DeleteSubcontractorController } from "../controllers/Subcontractor/DeleteSubcontractorController";

const subcontractorRoutes = Router();

const createSubcontractorController = new CreateSubcontractorController();
subcontractorRoutes.post("/subcontractor", checkToken, createSubcontractorController.handle);

const findAllSubcontractorsController = new FindAllSubcontractorsController();
subcontractorRoutes.post("/subcontractor/find", checkToken, findAllSubcontractorsController.handle);

const updateSubcontractorController = new UpdateSubcontractorController();
subcontractorRoutes.put("/subcontractor", checkToken, updateSubcontractorController.handle);

const deleteSubcontractorController = new DeleteSubcontractorController();
subcontractorRoutes.delete("/subcontractor/:id", checkToken, deleteSubcontractorController.handle);

export { subcontractorRoutes };

