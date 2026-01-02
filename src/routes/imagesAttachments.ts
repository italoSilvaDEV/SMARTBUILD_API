import { Router } from "express";
import { UploadController } from "../controllers/imagesAttachments/uploadController";
import { DeleteImagesAttachmentsController } from "../controllers/imagesAttachments/deleteController";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";
import { GetDocumentsController } from "../controllers/imagesAttachments/getDocumentsController";

const imagesAttachmentsRoutes = Router();
const uploadController = new UploadController();
const deleteController = new DeleteImagesAttachmentsController();
const getDocumentsController = new GetDocumentsController();

const upload = multer(uploadConfig.upload("./public/tmp/images-attachments"));

imagesAttachmentsRoutes.post(
    "/images-attachments/upload",
    checkToken,
    upload.single("file"),
    uploadController.handle.bind(uploadController)
);

imagesAttachmentsRoutes.delete(
    "/images-attachments/:imageId",
    checkToken,
    deleteController.handle.bind(deleteController)
);

imagesAttachmentsRoutes.get(
    "/images-attachments/documents/:invoiceId",
    checkToken,
    getDocumentsController.handle.bind(getDocumentsController)
);

export { imagesAttachmentsRoutes };
