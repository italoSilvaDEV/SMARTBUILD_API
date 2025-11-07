import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";

import { CreatePasteController } from "../controllers/Pastes/createPasteController";
import { GetPastesController } from "../controllers/Pastes/getPastesController";
import { GetPasteController } from "../controllers/Pastes/getPasteController";
import { UpdatePasteController } from "../controllers/Pastes/updatePasteController";
import { DeletePasteController } from "../controllers/Pastes/deletePasteController";

const pasteRoutes = Router();
const createPasteController = new CreatePasteController();
const getPastesController = new GetPastesController();
const getPasteController = new GetPasteController();
const updatePasteController = new UpdatePasteController();
const deletePasteController = new DeletePasteController();


pasteRoutes.post('/pastes', checkToken, createPasteController.handle);
pasteRoutes.get('/pastes/:companyId', checkToken, getPastesController.handle);
pasteRoutes.get('/pastes/:id', checkToken, getPasteController.handle);
pasteRoutes.put('/pastes/rename', checkToken, updatePasteController.handle);
pasteRoutes.delete('/pastes/:id', checkToken, deletePasteController.handle);

export default pasteRoutes;