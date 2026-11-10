import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { EstimateController } from "../controllers/projects/EstimateController";
import multer from "multer";
import { checkTokenOrEstimatePublicAccess } from "../middlewares/publicAccess";
import uploadConfig from "../config/uploadUtf8";
import { GetAllEstimatesByCompanyController } from "../controllers/estimates/getAllEstimatesByCompanyController";
import { ConvertToProjectController } from "../controllers/estimates/convertToProjectController";
import { DeleteEstimateController } from "../controllers/estimates/deleteEstimateController";
import { DeleteServiceEstimateController } from "../controllers/estimates/deleteServiceEstimateController";
import { UpdateEstimateFieldsController } from "../controllers/estimates/updateEstimateController";
import { UpdateServiceEstimateController } from "../controllers/estimates/updateServiceEstimateController";
import { CreateServiceEstimateController } from "../controllers/estimates/createServiceEstimateController";
import { CreateNewEstimateController } from "../controllers/estimates/createNewEstimateController";
import { CreateFullEstimateController } from "../controllers/estimates/createFullEstimateController";
import { CreateFullEstimateForProjectController } from "../controllers/estimates/createFullEstimateForProjectController";
import { UpdateFullEstimateController } from "../controllers/estimates/updateFullEstimateController";
import { GetNumberNewEstimateController } from "../controllers/estimates/getNumberNewEstimate";
import { GetNumberEstimateProjectController } from "../controllers/estimates/getNumberEstimateProject";
import { GetEstimateByProjectIdController } from "../controllers/estimates/getEstimateById";
import { DashboardEstimatesController } from "../controllers/estimates/dashboardEstimatesController";
import { updatePdfEstimateController } from "../controllers/estimates/updatePdfEstimateController";
import { BalanceController } from "../controllers/estimates/balanceController";
import { LastEstimateController } from "../controllers/estimates/lastEstimateController";
import { ClearUpdateController } from "../controllers/estimates/clearUpdateController";
import { ManualApprovalEstimateController } from "../controllers/estimates/manualApprovalEstimateController";
import { RemoveManualSignatureEstimateController } from "../controllers/estimates/removeManualSignatureEstimateController";
import { SmartBuilderEstimateController } from "../controllers/estimates/smartBuilderEstimateController";
import { MobileManualEstimateController } from "../controllers/estimates/mobileManualEstimateController";

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
const createFullEstimateController = new CreateFullEstimateController();
const createFullEstimateForProjectController = new CreateFullEstimateForProjectController();
const updateFullEstimateController = new UpdateFullEstimateController();
const getNumberNewEstimateController = new GetNumberNewEstimateController();
const dashboardEstimatesController = new DashboardEstimatesController();
const getNumberEstimateProjectController = new GetNumberEstimateProjectController();
const getEstimateByProjectIdController = new GetEstimateByProjectIdController();
const UpdatePdfEstimateController = new updatePdfEstimateController();
const balanceController = new BalanceController();
const lastEstimateController = new LastEstimateController();
const clearUpdateController = new ClearUpdateController();
const manualApprovalEstimateController = new ManualApprovalEstimateController();
const removeManualSignatureEstimateController = new RemoveManualSignatureEstimateController();
const smartBuilderEstimateController = new SmartBuilderEstimateController();
const mobileManualEstimateController = new MobileManualEstimateController();

// Configurar multer para aceitar múltiplos arquivos de anexo
const uploadAttachments = multer(uploadConfig.uploadUtf8("./public/tmp/estimate-attachments"));
const uploadSmartBuilderAttachments = multer(uploadConfig.uploadUtf8("./public/tmp/estimate-smartbuilder"));
const uploadCreateFullEstimate = multer(uploadConfig.uploadUtf8("./public/tmp/estimate-attachments"));

estimateRoutes.get("/allestimates/:companyId", checkToken, access('Estimates', [ref('company', 'params.companyId')]), getAllEstimatesByCompanyController.handle);
estimateRoutes.post("/convert-to-project", checkToken, access('Estimates', [ref('estimate', 'body.estimateId')]), access('Projects', [ref('estimate', 'body.estimateId')]), convertToProjectController.handle);
estimateRoutes.delete("/:estimateId", checkToken, access('Estimates', [ref('estimate', 'params.estimateId')]), deleteEstimateController.handle);
estimateRoutes.delete("/service/:serviceId", checkToken, access('Estimates', [ref('estimateService', 'params.serviceId')]), deleteServiceEstimateController.handle);
estimateRoutes.patch("/update/fields", checkToken, access('Estimates', [ref('estimate', 'body.estimateId')]), updateEstimateFieldsController.handle);
estimateRoutes.patch("/update/service-fields", checkToken, access('Estimates', [ref('estimateService', 'body.serviceId')]), updateServiceEstimateController.handle);
estimateRoutes.post("/new-service", checkToken, access('Estimates', [ref('estimate', 'body.estimateId')]), createServiceEstimateController.handle);
estimateRoutes.post("/new-estimate", checkToken, access('Estimates', [ref('project', 'body.projectId'), ref('pdf', 'body.idPdfProject')]), createNewEstimateController.handle);
estimateRoutes.post(
  "/create-full",
  checkToken,
  uploadCreateFullEstimate.fields([
    { name: "file", maxCount: 1 },
    { name: "attachments", maxCount: 20 },
  ]),
  access('Estimates', [ref('company', 'body.payload.project.company_id'), ref('client', 'body.payload.project.client_id', true)]), createFullEstimateController.handle.bind(createFullEstimateController)
);
estimateRoutes.post(
  "/create-full/project/:projectId",
  checkToken,
  uploadCreateFullEstimate.fields([
    { name: "file", maxCount: 1 },
    { name: "attachments", maxCount: 20 },
  ]),
  access('Estimates', [ref('project', 'params.projectId')]), createFullEstimateForProjectController.handle.bind(createFullEstimateForProjectController)
);
estimateRoutes.put(
  "/update-full/:estimateId",
  checkToken,
  uploadCreateFullEstimate.fields([
    { name: "file", maxCount: 1 },
    { name: "attachments", maxCount: 20 },
  ]),
  access('Estimates', [ref('estimate', 'params.estimateId')]), updateFullEstimateController.handle.bind(updateFullEstimateController)
);
estimateRoutes.get("/number/:companyId", checkToken, access('Estimates', [ref('company', 'params.companyId')]), getNumberNewEstimateController.handle);
estimateRoutes.patch("/verify-number", checkToken, access('Estimates', [ref('company', 'body.companyId')]), getNumberNewEstimateController.verifyNumber);
estimateRoutes.get("/dashboard/:companyId", checkToken, access('Estimates', [ref('company', 'params.companyId')]), dashboardEstimatesController.handle);
estimateRoutes.get("/number/project/:companyId/:projectId", checkToken, access('Estimates', [ref('company', 'params.companyId'), ref('project', 'params.projectId')]), getNumberEstimateProjectController.handle);
estimateRoutes.patch("/verify-number-project", checkToken, access('Estimates', [ref('company', 'body.companyId'), ref('project', 'body.projectId')]), getNumberEstimateProjectController.verifyNumber);
estimateRoutes.get("/new/project/:projectId", checkToken, access('Estimates', [ref('project', 'params.projectId')]), getEstimateByProjectIdController.handle);
estimateRoutes.get("/last/:companyId/:projectId", checkToken, access('Estimates', [ref('company', 'params.companyId'), ref('project', 'params.projectId')]), lastEstimateController.handle);
estimateRoutes.put("/update/pdf-estimate", checkToken, UpdatePdfEstimateController.handle);
estimateRoutes.patch("/update/balance-due", checkToken, access('Estimates', [ref('estimate', 'body.estimateId')]), balanceController.updateBalanceDue);
estimateRoutes.get("/amount-paid/:estimateId", checkToken, access('Estimates', [ref('estimate', 'params.estimateId')]), balanceController.getAmountPaid);
estimateRoutes.post("/smartbuilder/draft/message", checkToken, uploadSmartBuilderAttachments.array("attachments", 8), access('Estimates', [ref('company', 'body.context.companyId', true), ref('company', 'body.context.company_id', true), ref('company', 'body.context.project.company_id', true)]), smartBuilderEstimateController.messageDraft);
estimateRoutes.get("/:estimateId/smartbuilder/session", checkToken, access('Estimates', [ref('estimate', 'params.estimateId')]), smartBuilderEstimateController.getSession);
estimateRoutes.post("/:estimateId/smartbuilder/message", checkToken, uploadSmartBuilderAttachments.array("attachments", 8), access('Estimates', [ref('estimate', 'params.estimateId')]), smartBuilderEstimateController.messageExisting);
estimateRoutes.post("/:estimateId/smartbuilder/session/import", checkToken, access('Estimates', [ref('estimate', 'params.estimateId')]), smartBuilderEstimateController.importSession);
estimateRoutes.post("/mobile/manual/:estimateId/regenerate-pdf", checkToken, access('Estimates', [ref('estimate', 'params.estimateId')]), mobileManualEstimateController.regeneratePdf.bind(mobileManualEstimateController));

estimateRoutes.post("/", checkToken, access('Estimates', [ref('project', 'body.projectId'), ref('pdf', 'body.idPdfProject', true)]), estimateController.create);
estimateRoutes.get("/project/:projectId", checkToken, access(['Estimates', 'Projects', 'Invoice'], [ref('project', 'params.projectId')]), estimateController.findByProject);
estimateRoutes.get("/project/:projectId/generate-number", checkToken, access('Estimates', [ref('project', 'params.projectId')]), estimateController.generateNumber);
estimateRoutes.get("/global/:companyId/generate-number", checkToken, access('Estimates', [ref('company', 'params.companyId')]), estimateController.generateGlobalNumber);
estimateRoutes.get("/:id", checkTokenOrEstimatePublicAccess, access('Estimates', [ref('estimate', 'params.id')], true), estimateController.findById);
estimateRoutes.put("/:id", checkToken, access('Estimates', [ref('estimate', 'params.id')]), estimateController.update);
estimateRoutes.patch("/:id/status", checkTokenOrEstimatePublicAccess, access('Estimates', [ref('estimate', 'params.id')], true), estimateController.updateStatus);
estimateRoutes.patch("/:id/sign", checkTokenOrEstimatePublicAccess, access('Estimates', [ref('estimate', 'params.id')], true), estimateController.addSignature);
estimateRoutes.patch("/:id/manual-approval", checkToken, access('Estimates', [ref('estimate', 'params.id')]), manualApprovalEstimateController.handle);
estimateRoutes.patch("/:id/remove-manual-signature", checkToken, access('Estimates', [ref('estimate', 'params.id')]), removeManualSignatureEstimateController.handle);
estimateRoutes.put("/:id/cancel", checkToken, access('Estimates', [ref('estimate', 'params.id')]), estimateController.cancel);
estimateRoutes.patch("/:id/restore-pending", checkToken, access('Estimates', [ref('estimate', 'params.id')]), estimateController.restoreToPending);
estimateRoutes.post("/:id/service", checkToken, access('Estimates', [ref('estimate', 'params.id')]), estimateController.addService);
estimateRoutes.delete("/:id/service/:serviceProjectId", checkToken, access('Estimates', [ref('estimate', 'params.id'), ref('estimateService', 'params.serviceProjectId')]), estimateController.removeService);
estimateRoutes.put("/:id/service/:serviceProjectId", checkToken, access('Estimates', [ref('estimate', 'params.id'), ref('estimateService', 'params.serviceProjectId')]), estimateController.updateService);
estimateRoutes.post("/:id/resend", checkToken, access('Estimates', [ref('estimate', 'params.id')]), estimateController.resendEmail);
estimateRoutes.post("/:id/send", checkToken, uploadAttachments.array("attachments", 10), access('Estimates', [ref('estimate', 'params.id')]), estimateController.sendEmail);
estimateRoutes.patch("/:estimateId/clear-pdf-flag", checkToken, access('Estimates', [ref('estimate', 'params.estimateId')]), clearUpdateController.handle);

estimateRoutes.post("/mobile/manual", checkToken, access('Estimates', [ref('company', 'body.companyId'), ref('project', 'body.projectId', true)]), mobileManualEstimateController.handle.bind(mobileManualEstimateController));
export { estimateRoutes }; 
