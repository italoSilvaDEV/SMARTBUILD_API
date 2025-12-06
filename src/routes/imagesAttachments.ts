import { Router } from "express";
import { UploadController } from "../controllers/imagesAttachments/uploadController";
import { DeleteImagesAttachmentsController } from "../controllers/imagesAttachments/deleteController";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";

const imagesAttachmentsRoutes = Router();
const uploadController = new UploadController();
const deleteController = new DeleteImagesAttachmentsController();

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

export { imagesAttachmentsRoutes };
