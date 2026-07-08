import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { StagedUploadController } from "../controllers/uploads/StagedUploadController";

const uploadRoutes = Router();
const stagedUploadController = new StagedUploadController();

uploadRoutes.post("/uploads/staged/presign", checkToken, stagedUploadController.presign.bind(stagedUploadController));

export { uploadRoutes };
