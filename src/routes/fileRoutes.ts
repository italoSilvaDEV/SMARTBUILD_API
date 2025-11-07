import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";
import { CreateFileController } from "../controllers/Files/createFileController";
import { DeleteFileController } from "../controllers/Files/deleteFileController";
import { GetFilesController } from "../controllers/Files/getFiles";
import { GetFileController } from "../controllers/Files/getFileController";
import { GetFilesController as GetFilesByPasteController } from "../controllers/Files/getFilesByPaste";
import { UpdateFileController } from "../controllers/Files/updateFileController";

const fileRoutes = Router();

const uploadFile = multer(uploadConfig.upload("./public/tmp/files"));

const createFileController = new CreateFileController();
fileRoutes.post("/file", checkToken, uploadFile.single("file"), createFileController.handle.bind(createFileController)
);

const getFilesController = new GetFilesController();
fileRoutes.get("/files/:companyId/:userId", checkToken, getFilesController.handle.bind(getFilesController)
);

const getFileController = new GetFileController();
fileRoutes.get("/file/get/:id/:userId/:companyId", checkToken, getFileController.handle.bind(getFileController)
);

const getFilesByPasteController = new GetFilesByPasteController();
fileRoutes.get("/files/paste/:pasteId/:userId/:companyId", checkToken, getFilesByPasteController.handle.bind(getFilesByPasteController)
);

const updateFileController = new UpdateFileController();
fileRoutes.put("/file", checkToken, uploadFile.single("file"), updateFileController.handle.bind(updateFileController)
);

const deleteFileController = new DeleteFileController();
fileRoutes.delete("/file/:id", checkToken, deleteFileController.handle.bind(deleteFileController)
);

export default fileRoutes;