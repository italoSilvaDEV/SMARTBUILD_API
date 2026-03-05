import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";
import { CreateSubcontractorFileController } from "../controllers/SubcontractorFiles/createSubcontractorFileController";
import { DeleteSubcontractorFileController } from "../controllers/SubcontractorFiles/deleteSubcontractorFileController";
import { GetSubcontractorFilesController } from "../controllers/SubcontractorFiles/getSubcontractorFilesController";
import { GetSubcontractorFileController } from "../controllers/SubcontractorFiles/getSubcontractorFileController";
import { GetSubcontractorFilesByPasteController } from "../controllers/SubcontractorFiles/getSubcontractorFilesByPasteController";
import { UpdateSubcontractorFileController } from "../controllers/SubcontractorFiles/updateSubcontractorFileController";

const subcontractorFileRoutes = Router();

const uploadFile = multer(uploadConfig.upload("./public/tmp/files"));

const createSubcontractorFileController = new CreateSubcontractorFileController();
subcontractorFileRoutes.post("/subcontractor-file", checkToken, uploadFile.single("file"), createSubcontractorFileController.handle.bind(createSubcontractorFileController));

const getSubcontractorFilesController = new GetSubcontractorFilesController();
subcontractorFileRoutes.get("/subcontractor-files/:subcontractorId/:userId", checkToken, getSubcontractorFilesController.handle.bind(getSubcontractorFilesController));

const getSubcontractorFileController = new GetSubcontractorFileController();
subcontractorFileRoutes.get("/subcontractor-file/get/:id/:userId/:subcontractorId", checkToken, getSubcontractorFileController.handle.bind(getSubcontractorFileController));

const getSubcontractorFilesByPasteController = new GetSubcontractorFilesByPasteController();
subcontractorFileRoutes.get("/subcontractor-files/paste/:pasteId/:userId/:subcontractorId", checkToken, getSubcontractorFilesByPasteController.handle.bind(getSubcontractorFilesByPasteController));

const updateSubcontractorFileController = new UpdateSubcontractorFileController();
subcontractorFileRoutes.put("/subcontractor-file", checkToken, uploadFile.single("file"), updateSubcontractorFileController.handle.bind(updateSubcontractorFileController));

const deleteSubcontractorFileController = new DeleteSubcontractorFileController();
subcontractorFileRoutes.delete("/subcontractor-file/:id", checkToken, deleteSubcontractorFileController.handle.bind(deleteSubcontractorFileController));

export default subcontractorFileRoutes;
