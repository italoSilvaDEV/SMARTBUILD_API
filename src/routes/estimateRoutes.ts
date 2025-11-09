import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { EstimateController } from "../controllers/projects/EstimateController";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";
import { GetAllEstimatesByCompanyController } from "../controllers/estimates/getAllEstimatesByCompanyController";
import { ConvertToProjectController } from "../controllers/estimates/convertToProjectController";
import { DeleteEstimateController } from "../controllers/estimates/deleteEstimateController";
import { DeleteServiceEstimateController } from "../controllers/estimates/deleteServiceEstimateController";
import { UpdateEstimateFieldsController } from "../controllers/estimates/updateEstimateController";
import { UpdateServiceEstimateController } from "../controllers/estimates/updateServiceEstimateController";
import { CreateServiceEstimateController } from "../controllers/estimates/createServiceEstimateController";
import { CreateNewEstimateController } from "../controllers/estimates/createNewEstimateController";
import { GetNumberNewEstimateController } from "../controllers/estimates/getNumberNewEstimate";
import { GetNumberEstimateProjectController } from "../controllers/estimates/getNumberEstimateProject";
import { GetEstimateByProjectIdController } from "../controllers/estimates/getEstimateById";
import { DashboardEstimatesController } from "../controllers/estimates/dashboardEstimatesController";
import { updatePdfEstimateController } from "../controllers/estimates/updatePdfEstimateController";
import { BalanceController } from "../controllers/estimates/balanceController";
import { LastEstimateController } from "../controllers/estimates/lastEstimateController";

const estimateRoutes = Router();
const estimateController = new EstimateController();
const getAllEstimatesByCompanyController = new GetAllEstimatesByCompanyController();
const convertToProjectController = new ConvertToProjectController();
const deleteEstimateController = new DeleteEstimateController();
const deleteServiceEstimateController = new DeleteServiceEstimateController();
const updateEstimateFieldsController = new UpdateEstimateFieldsController();
const updateServiceEstimateController = new UpdateServiceEstimateController();
const createServiceEstimateController = new CreateServiceEstimateController();
const createNewEstimateController = new CreateNewEstimateController();
const getNumberNewEstimateController = new GetNumberNewEstimateController();
const dashboardEstimatesController = new DashboardEstimatesController();
const getNumberEstimateProjectController = new GetNumberEstimateProjectController();
const getEstimateByProjectIdController = new GetEstimateByProjectIdController();
const UpdatePdfEstimateController = new updatePdfEstimateController();
const balanceController = new BalanceController();
const lastEstimateController = new LastEstimateController();


// Configurar multer para aceitar múltiplos arquivos de anexo
const uploadAttachments = multer(uploadConfig.uploadUtf8("./public/tmp/estimate-attachments"));

estimateRoutes.get("/allestimates/:companyId", checkToken, getAllEstimatesByCompanyController.handle);
estimateRoutes.post("/convert-to-project", checkToken, convertToProjectController.handle);
estimateRoutes.delete("/:estimateId", checkToken, deleteEstimateController.handle);
estimateRoutes.delete("/service/:serviceId", checkToken, deleteServiceEstimateController.handle);
estimateRoutes.patch("/update/fields", checkToken, updateEstimateFieldsController.handle);
estimateRoutes.patch("/update/service-fields", checkToken, updateServiceEstimateController.handle);
estimateRoutes.post("/new-service", checkToken, createServiceEstimateController.handle);
estimateRoutes.post("/new-estimate", checkToken, createNewEstimateController.handle);
estimateRoutes.get("/number/:companyId", checkToken, getNumberNewEstimateController.handle);
estimateRoutes.patch("/verify-number", checkToken, getNumberNewEstimateController.verifyNumber);
estimateRoutes.get("/dashboard/:companyId", checkToken, dashboardEstimatesController.handle);
estimateRoutes.get("/number/project/:companyId/:projectId", checkToken, getNumberEstimateProjectController.handle);
estimateRoutes.patch("/verify-number-project", checkToken, getNumberEstimateProjectController.verifyNumber);
estimateRoutes.get("/new/project/:projectId", checkToken, getEstimateByProjectIdController.handle);
estimateRoutes.get("/last/:companyId/:projectId", checkToken, lastEstimateController.handle);
estimateRoutes.put("/update/pdf-estimate", checkToken, UpdatePdfEstimateController.handle);
estimateRoutes.patch("/update/balance-due", checkToken, balanceController.updateBalanceDue);
estimateRoutes.get("/amount-paid/:estimateId", checkToken, balanceController.getAmountPaid);

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