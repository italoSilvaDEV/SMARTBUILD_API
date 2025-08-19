import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { EstimateController } from "../controllers/projects/EstimateController";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";
import { GetAllEstimatesByCompanyController } from "../controllers/estimates/getAllEstimatesByCompanyController";
import { ConvertToProjectController } from "../controllers/estimates/convertToProjectController";
import { DeleteEstimateController } from "../controllers/estimates/deleteEstimateController";
import { DeleteServiceEstimateController } from "../controllers/estimates/deleteServiceEstimateController";

const estimateRoutes = Router();
const estimateController = new EstimateController();
const getAllEstimatesByCompanyController = new GetAllEstimatesByCompanyController();
const convertToProjectController = new ConvertToProjectController();
const deleteEstimateController = new DeleteEstimateController();
const deleteServiceEstimateController = new DeleteServiceEstimateController();


// Configurar multer para aceitar múltiplos arquivos de anexo
const uploadAttachments = multer(uploadConfig.uploadUtf8("./public/tmp/estimate-attachments"));

estimateRoutes.get("/allestimates/:companyId", checkToken, getAllEstimatesByCompanyController.handle);
estimateRoutes.post("/convert-to-project", checkToken, convertToProjectController.handle);
estimateRoutes.delete("/:estimateId", checkToken, deleteEstimateController.handle);
estimateRoutes.delete("/:id/service/:serviceId/:estimateId", checkToken, deleteServiceEstimateController.handle);


estimateRoutes.post("/", checkToken, estimateController.create);
estimateRoutes.get("/project/:projectId", checkToken, estimateController.findByProject);
estimateRoutes.get("/project/:projectId/generate-number", checkToken, estimateController.generateNumber);
estimateRoutes.get("/global/:companyId/generate-number", checkToken, estimateController.generateGlobalNumber);
estimateRoutes.get("/:id", estimateController.findById);
estimateRoutes.put("/:id", checkToken, estimateController.update);
estimateRoutes.patch("/:id/status", estimateController.updateStatus);
estimateRoutes.patch("/:id/sign", estimateController.addSignature);
estimateRoutes.put("/:id/cancel", checkToken, estimateController.cancel);
estimateRoutes.post("/:id/service", checkToken, estimateController.addService);
estimateRoutes.delete("/:id/service/:serviceProjectId", checkToken, estimateController.removeService);
estimateRoutes.put("/:id/service/:serviceProjectId", checkToken, estimateController.updateService);
estimateRoutes.post("/:id/resend", checkToken, estimateController.resendEmail);
estimateRoutes.post("/:id/send", checkToken, uploadAttachments.array("attachments", 10), estimateController.sendEmail);

export { estimateRoutes }; 