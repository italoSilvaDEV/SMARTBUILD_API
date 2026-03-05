import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";

import { CreateSubcontractorPasteController } from "../controllers/SubcontractorPastes/createSubcontractorPasteController";
import { GetSubcontractorPastesController } from "../controllers/SubcontractorPastes/getSubcontractorPastesController";
import { GetSubcontractorPasteController } from "../controllers/SubcontractorPastes/getSubcontractorPasteController";
import { UpdateSubcontractorPasteController } from "../controllers/SubcontractorPastes/updateSubcontractorPasteController";
import { DeleteSubcontractorPasteController } from "../controllers/SubcontractorPastes/deleteSubcontractorPasteController";

const subcontractorPasteRoutes = Router();
const createSubcontractorPasteController = new CreateSubcontractorPasteController();
const getSubcontractorPastesController = new GetSubcontractorPastesController();
const getSubcontractorPasteController = new GetSubcontractorPasteController();
const updateSubcontractorPasteController = new UpdateSubcontractorPasteController();
const deleteSubcontractorPasteController = new DeleteSubcontractorPasteController();

subcontractorPasteRoutes.post('/subcontractor-pastes', checkToken, createSubcontractorPasteController.handle);
subcontractorPasteRoutes.get('/subcontractor-pastes/subcontractor/:subcontractorId', checkToken, getSubcontractorPastesController.handle);
subcontractorPasteRoutes.get('/subcontractor-pastes/:id', checkToken, getSubcontractorPasteController.handle);
subcontractorPasteRoutes.put('/subcontractor-pastes/rename', checkToken, updateSubcontractorPasteController.handle);
subcontractorPasteRoutes.delete('/subcontractor-pastes/:id', checkToken, deleteSubcontractorPasteController.handle);

export default subcontractorPasteRoutes;
