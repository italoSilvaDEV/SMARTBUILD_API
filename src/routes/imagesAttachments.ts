import { Router } from "express";
import { UploadController } from "../controllers/imagesAttachments/uploadController";
import { DeleteImagesAttachmentsController } from "../controllers/imagesAttachments/deleteController";
import { checkToken } from "../middlewares/checkToken";

const imagesAttachmentsRoutes = Router();
const uploadController = new UploadController();
const deleteController = new DeleteImagesAttachmentsController();

imagesAttachmentsRoutes.post(
    "/images-attachments/upload",
    checkToken,
    uploadController.handle.bind(uploadController)
);

imagesAttachmentsRoutes.delete(
    "/images-attachments/:imageId",
    checkToken,
    deleteController.handle.bind(deleteController)
);

export { imagesAttachmentsRoutes };
