import { requireDocumentMutation, requireDocumentLookup } from '../middlewares/documentAccess';
import { requireOwnSchedule, requireWorkerSchedule } from '../middlewares/workerResourceAccess';
import { requireProjectWorkAccess as workAccess } from '../middlewares/projectWorkAccess';
import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import uploadConfigUtf8 from "../config/uploadUtf8";
import { compressImage } from "../config/compressImage";
import { checkToken } from "../middlewares/checkToken";
import { CreateInvoiceCostProjectController } from "../controllers/projects/CreateInvoiceCostProjectController";
import { CreateCostProjectController } from "../controllers/projects/CreateCostProjectController";
import { FindCostProjectController } from "../controllers/projects/FindCostProjectController";
import { DeleteCostProjectController } from "../controllers/projects/deleteCostProjectController";
import { UpdateInvoiceCostProjectController } from "../controllers/projects/UpdateInvoiceCostProjectController";
import { UpdateCostProjectController } from "../controllers/projects/UpdateCostProjectController";
import { ProjectController } from "../controllers/projects/ProjectController";
import { CreatePdfProjectController } from "../controllers/projects/CreatePdfProjectUploadController";
import { FindPdfProjectAllController } from "../controllers/projects/FindPdfProjectAllController";
import { GalleryProjectController } from "../controllers/projects/GalleryServiceProjectController";
import { createActivity, deleteActivity, listActivities } from "../controllers/projects/activitiesController";
import { TimeController } from "../controllers/projects/timeController";
import { CreatePdContractfProjectController } from "../controllers/projects/CreatePdfProjectUploadContractController";
import { FindPdfContractProjectAllController } from "../controllers/projects/FindPdfContractProjectAllController";
import { CreatePdfProjectEstimateInvoiceController } from "../controllers/projects/CreatePdfProjectEstimateInvoiceController";
import { FindPdfProjectEstimateInvoiceController } from "../controllers/projects/FindPdfProjectEstimateInvoiceController";
import { DashboardProjectController } from "../controllers/projects/dashboardProjectController";
import uploadConfig2 from "../config/uploadUtf8";
import { BalanceController } from "../controllers/projects/balanceController";

const projectRoutes = Router();
const dashboardProjectController = new DashboardProjectController();

const projectController = new ProjectController();
const uploadServiceProject = multer(
  uploadConfig.upload("./public/tmp/service-project")
);

const uploadAttachments = multer(uploadConfig2.uploadUtf8("./public/tmp/estimate-attachments"));

projectRoutes.post("/project", checkToken, access('Projects', [ref('company', 'body.company_id'), ref('client', 'body.client_id', true)]), projectController.createProject);
// Rotas específicas ANTES da genérica /project/:id para não capturar "project-manager" ou "user-seller" como id
projectRoutes.patch("/project/project-manager", checkToken, access('Projects', [ref('project', 'body.id')]), projectController.updateProjectManager.bind(projectController));
projectRoutes.patch("/project/user-seller", checkToken, access('Projects', [ref('project', 'body.id')]), projectController.updateUserSellerProject.bind(projectController));
projectRoutes.get("/project/user-seller", checkToken, access('Projects', [ref('company', 'query.company_id')]), projectController.getUserSeller.bind(projectController));
projectRoutes.patch("/project/:id", checkToken, access('Projects', [ref('project', 'params.id'), ref('client', 'body.client_id', true)]), projectController.updateProject.bind(projectController));
projectRoutes.patch("/project/update/status", checkToken, access('Projects', [ref('project', 'body.id')]), projectController.updateStatusProject);
projectRoutes.delete("/project/delete/:id", checkToken, access('Projects', [ref('project', 'params.id')]), projectController.deleteProject);
projectRoutes.patch("/project/update/start_date", checkToken, access('Projects', [ref('project', 'body.id')]), projectController.startDateProject);
projectRoutes.patch("/project/update/deadline", checkToken, access('Projects', [ref('project', 'body.id')]), projectController.deadlineProject);
projectRoutes.patch("/project/update/location", checkToken, access('Projects', [ref('project', 'body.id')]), projectController.updateLocationProject);
projectRoutes.get(
  "/project/find",
  checkToken,
  access(['Projects', 'Invoice', 'Time Cards', 'Job Schedule', 'Job Dispatch', 'Estimates'], [ref('company', 'query.company_id')]), projectController.getAllProjects.bind(projectController)
);//ok novo modelo
projectRoutes.get("/project/find/:id", checkToken, access(['Projects', 'Invoice'], [ref('project', 'params.id')]), projectController.getProjectById.bind(projectController));//ok novo modelo

projectRoutes.get("/project/dashboard/:companyId", checkToken, access('Projects', [ref('company', 'params.companyId')]), dashboardProjectController.handle.bind(dashboardProjectController));

projectRoutes.post(
  "/service-project",
  checkToken,
  access('Projects', [ref('project', 'body.id_project')]), projectController.createServiceProject.bind(projectController)
);

projectRoutes.put("/service-project", checkToken, access('Projects', [ref('serviceProject', 'body.id'), ref('project', 'body.id_project', true)]), projectController.updateServiceProject.bind(projectController));
projectRoutes.delete("/service-img-project/:id", checkToken, access('Projects', [ref('serviceProject', 'params.id')]), projectController.DeleteAllImgServiceProjectController.bind(projectController));

projectRoutes.post(
  "/img-service-project",
  checkToken,
  uploadServiceProject.single("file"),
  compressImage("service-project"),
  access('Projects', [ref('serviceProject', 'body.serviceProjectId')]), projectController.upLoadPhotoServiceProject.bind(projectController)
);

projectRoutes.patch("/service-project/update-fields", checkToken, access('Projects', [ref('serviceProject', 'body.id')]), projectController.updateFieldsServiceProject.bind(projectController));

projectRoutes.post(
  "/img-url-service-project",
  checkToken,
  access('Projects', [ref('serviceProject', 'body.serviceProjectId')]), projectController.imageUrlServiceProject.bind(projectController)
);


projectRoutes.delete(
  "/service-project/:id",
  checkToken,
  access('Projects', [ref('serviceProject', 'params.id')]), projectController.deleteServiceProject.bind(projectController)
);

//costProject
const createInvoiceCostProjectController = new CreateInvoiceCostProjectController();
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/costproject"));
projectRoutes.post(
  "/invoicecostproject",
  checkToken,
  createInvoiceCostProjectController.handle.bind(createInvoiceCostProjectController)
);

const createPdfProjectController = new CreatePdfProjectController();
const uploadpdf = multer(
  uploadConfigUtf8.uploadUtf8("./public/tmp/pdfproject")
);
projectRoutes.post(
  "/pdfproject",
  checkToken,
  // uploadpdf.single("file"),
  createPdfProjectController.handle.bind(createPdfProjectController)
);

const createContractProjectController = new CreatePdContractfProjectController();
const uploadpdfContract = multer(
  uploadConfigUtf8.uploadUtf8("./public/tmp/pdfcontractproject")
);
// Rota para fazer upload do PDF do contrato
projectRoutes.post("/project/upload-contract",
  checkToken,
  // uploadpdfContract.single('file'), 
  createContractProjectController.handle.bind(createContractProjectController)
);

const createCostProjectController = new CreateCostProjectController();
projectRoutes.post(
  "/costproject",
  checkToken,
  workAccess([{kind:'service',field:'serviceProjectId'},{kind:'costInvoice',field:'invoice_cost_project_id'}], 'body', true), createCostProjectController.handle.bind(createCostProjectController)
);

const findCostProjectController = new FindCostProjectController();
projectRoutes.post(
  "/costproject/find",
  checkToken,
  access('Projects', [ref('company', 'body.company_id')]), findCostProjectController.handle.bind(findCostProjectController)
);

const findPdfProjectAllController = new FindPdfProjectAllController();
projectRoutes.post(
  "/pdfproject/find",
  checkToken,
  access('Projects', [ref('project', 'body.project_id')]), findPdfProjectAllController.handle.bind(findPdfProjectAllController)
);

const findPdfContractProjectAllController = new FindPdfContractProjectAllController();
projectRoutes.post(
  "/pdfcontractproject/find",
  checkToken,
  access('Contracts', [ref('project', 'body.projectId')]), findPdfContractProjectAllController.handle.bind(findPdfContractProjectAllController)
);

const updateInvoiceCostProjectController =
  new UpdateInvoiceCostProjectController();
projectRoutes.put(
  "/invoicecostproject/:id",
  checkToken,
  workAccess([{kind:'costInvoice',field:'id'}], 'params'), updateInvoiceCostProjectController.handle.bind(updateInvoiceCostProjectController)
);

const deleteCostProjectController = new DeleteCostProjectController()
projectRoutes.delete("/costProject/:cost_project_id", checkToken, workAccess([{kind:'cost',field:'cost_project_id'}], 'params'), deleteCostProjectController.handle.bind(deleteCostProjectController))

const updateCostProjectController = new UpdateCostProjectController();
projectRoutes.put("/costproject", checkToken, workAccess([{kind:'cost',field:'id'},{kind:'service',field:'service_project_id'},{kind:'costInvoice',field:'invoice_cost_project_id'}], 'body', true), updateCostProjectController.handle.bind(updateCostProjectController));

// projectRoutes.post("/add_project_responsibles", checkToken, projectController.addProjectResponsibles)
// projectRoutes.delete("/remove_project_responsibles", checkToken, projectController.removeProjectResponsibles)

const galleryProject = new GalleryProjectController()
projectRoutes.post('/project/gallery', checkToken, galleryProject.create.bind(galleryProject))
projectRoutes.delete('/project/gallery', checkToken, workAccess([{kind:'gallery',field:'id'}]), galleryProject.delete.bind(galleryProject))
projectRoutes.get('/project/gallery/:id', galleryProject.find.bind(galleryProject))
projectRoutes.post('/project/gallery/send-email', checkToken, uploadAttachments.array("attachments", 10), access('Projects', [ref('project', 'body.projectId')]), galleryProject.sendEmail.bind(galleryProject))

projectRoutes.get('/project/services-project/:id', checkToken, access(['Projects', 'Time Cards', 'Reports'], [ref('project', 'params.id')]), projectController.findServicesProjectByProjectId.bind(projectController))

projectRoutes.get('/project/services-project/history/:id', checkToken, access('Projects', [ref('serviceProject', 'params.id')]), projectController.findHistoryServicesProjectById.bind(projectController))

// Rota para listar atividades
projectRoutes.get("/project/services-project/activities/:serviceProjectId", checkToken, workAccess([{kind:'service',field:'serviceProjectId'}], 'params'), listActivities);
// Rota para cadastrar uma nova atividade
projectRoutes.post("/project/services-project/activities", checkToken, workAccess([{kind:'service',field:'serviceProjectId'}]), createActivity);
// Rota para excluir uma atividade
projectRoutes.delete("/project/services-project/activities/:id", checkToken, workAccess([{kind:'activity',field:'id'}], 'params'), deleteActivity);

projectRoutes.post("/project/schedule", checkToken, access(['Projects', 'Job Schedule'], [ref('company', 'body.company_id')]), projectController.getSellerSchedule.bind(projectController));

projectRoutes.patch("/service-project/update/dates", checkToken, access('Projects', [ref('serviceProject', 'body.id')]), projectController.updateDatesServiceProject.bind(projectController));

projectRoutes.patch("/service-project/update/status", checkToken, access('Projects', [ref('serviceProject', 'body.id')]), projectController.updateStatusServiceProject.bind(projectController));

projectRoutes.post("/service-project/schedule", checkToken, access(['Projects', 'Job Dispatch'], [ref('company', 'body.company_id')]), projectController.getServiceProjectSchedule.bind(projectController));

// Rota para buscar os ServiceProjects relacionados ao usuário
projectRoutes.post("/service-project/scheduleById", checkToken, requireOwnSchedule, projectController.getServiceProjectScheduleByIdUser.bind(projectController));

projectRoutes.get("/service-project/schedule/worker/:id", checkToken, requireWorkerSchedule(), projectController.getWorkerSchedule.bind(projectController));

const timeController = new TimeController()
projectRoutes.get('/time-cards/all', checkToken, access('Time Cards', [ref('company', 'query.id')]), timeController.findMany.bind(timeController))
projectRoutes.get('/time-cards/worker_id', checkToken, timeController.findManyByIdWorker.bind(timeController))
projectRoutes.get('/time-cards/worker_id_web', checkToken, timeController.findManyByIdWorkerWeb.bind(timeController))
projectRoutes.get('/time-activies', checkToken, access(['Time Cards', 'Activities'], [ref('company', 'query.id')]), timeController.findManyActivies.bind(timeController))

projectRoutes.get("/project/generate-pdf/:id", checkToken, access('Projects', [ref('project', 'params.id')]), projectController.generateAndSendPdf.bind(projectController));

projectRoutes.get("/project/generate-pdf-estimate/:id", projectController.generatePdfEstimate.bind(projectController));


// Nova rota para PDF com relacionamento estimate/invoice
const createPdfProjectEstimateInvoiceController = new CreatePdfProjectEstimateInvoiceController();
projectRoutes.post(
  "/pdfproject/estimate-invoice",
  checkToken,
  createPdfProjectEstimateInvoiceController.handle.bind(createPdfProjectEstimateInvoiceController)
);

projectRoutes.put(
  "/pdfproject/estimate-invoice/update-estimate-id",
  checkToken,
  requireDocumentMutation([ref('pdf', 'body.pdfId'), ref('estimate', 'body.estimateId')]), createPdfProjectEstimateInvoiceController.updateEstimateId.bind(createPdfProjectEstimateInvoiceController)
);

// Rota PUT para atualizar PDF Project
projectRoutes.put(
  "/pdfproject/estimate-invoice/:id",
  checkToken,
  requireDocumentMutation([ref('pdf', 'params.id'), ref('project', 'body.projectId', true), ref('invoice', 'body.invoiceId', true)]), createPdfProjectEstimateInvoiceController.update.bind(createPdfProjectEstimateInvoiceController)
);

const findPdfProjectEstimateInvoiceController = new FindPdfProjectEstimateInvoiceController();
projectRoutes.post(
  "/pdfproject/estimate-invoice/find",
  checkToken,
  requireDocumentLookup, findPdfProjectEstimateInvoiceController.handle.bind(findPdfProjectEstimateInvoiceController)
);

const balanceController = new BalanceController();

projectRoutes.patch("/project/update/balance-due", checkToken, access('Projects', [ref('project', 'body.projectId')]), balanceController.updateBalanceDue.bind(balanceController));
projectRoutes.get("/project/amount-paid/:projectId", checkToken, access('Projects', [ref('project', 'params.projectId')]), balanceController.getAmountPaid.bind(balanceController));

// Upload e gerenciamento de foto de capa do projeto
const uploadProjectCover = multer(
  uploadConfig.upload("./public/tmp/project-cover")
);
projectRoutes.post(
  "/project/:id/cover-photo",
  checkToken,
  uploadProjectCover.single("file"),
  compressImage("project-cover"),
  access('Projects', [ref('project', 'params.id')]), projectController.uploadCoverPhoto.bind(projectController)
);
projectRoutes.delete(
  "/project/:id/cover-photo",
  checkToken,
  access('Projects', [ref('project', 'params.id')]), projectController.deleteCoverPhoto.bind(projectController)
);

export { projectRoutes };
