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

projectRoutes.post("/project", checkToken, projectController.createProject);
// Rotas específicas ANTES da genérica /project/:id para não capturar "project-manager" ou "user-seller" como id
projectRoutes.patch("/project/project-manager", checkToken, projectController.updateProjectManager.bind(projectController));
projectRoutes.patch("/project/user-seller", checkToken, projectController.updateUserSellerProject.bind(projectController));
projectRoutes.get("/project/user-seller", checkToken, projectController.getUserSeller.bind(projectController));
projectRoutes.patch("/project/:id", checkToken, projectController.updateProject.bind(projectController));
projectRoutes.patch("/project/update/status", checkToken, projectController.updateStatusProject);
projectRoutes.delete("/project/delete/:id", checkToken, projectController.deleteProject);
projectRoutes.patch("/project/update/start_date", checkToken, projectController.startDateProject);
projectRoutes.patch("/project/update/deadline", checkToken, projectController.deadlineProject);
projectRoutes.patch("/project/update/location", checkToken, projectController.updateLocationProject); 
projectRoutes.get(
  "/project/find",
  checkToken,
  projectController.getAllProjects.bind(projectController)
);//ok novo modelo
projectRoutes.get("/project/find/:id", checkToken, projectController.getProjectById.bind(projectController));//ok novo modelo

projectRoutes.get("/project/dashboard/:companyId", checkToken, dashboardProjectController.handle.bind(dashboardProjectController));

projectRoutes.post(
  "/service-project",
  checkToken,
  projectController.createServiceProject.bind(projectController)
);

projectRoutes.put("/service-project", checkToken, projectController.updateServiceProject.bind(projectController));
projectRoutes.delete("/service-img-project/:id", checkToken, projectController.DeleteAllImgServiceProjectController.bind(projectController));

projectRoutes.post(
  "/img-service-project",
  checkToken,
  uploadServiceProject.single("file"),
  compressImage("service-project"),
  projectController.upLoadPhotoServiceProject.bind(projectController)
);

projectRoutes.patch("/service-project/update-fields", checkToken, projectController.updateFieldsServiceProject.bind(projectController));

projectRoutes.post(
  "/img-url-service-project",
  checkToken,
  projectController.imageUrlServiceProject.bind(projectController)
);


projectRoutes.delete(
  "/service-project/:id",
  checkToken,
  projectController.deleteServiceProject.bind(projectController)
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
  createCostProjectController.handle.bind(createCostProjectController)
);

const findCostProjectController = new FindCostProjectController();
projectRoutes.post(
  "/costproject/find",
  checkToken,
  findCostProjectController.handle.bind(findCostProjectController)
);

const findPdfProjectAllController = new FindPdfProjectAllController();
projectRoutes.post(
  "/pdfproject/find",
  checkToken,
  findPdfProjectAllController.handle.bind(findPdfProjectAllController)
);

const findPdfContractProjectAllController = new FindPdfContractProjectAllController();
projectRoutes.post(
  "/pdfcontractproject/find",
  checkToken,
  findPdfContractProjectAllController.handle.bind(findPdfContractProjectAllController)
);

const updateInvoiceCostProjectController =
  new UpdateInvoiceCostProjectController();
projectRoutes.put(
  "/invoicecostproject/:id",
  checkToken,
  updateInvoiceCostProjectController.handle.bind(updateInvoiceCostProjectController)
);

const deleteCostProjectController = new DeleteCostProjectController()
projectRoutes.delete("/costProject/:cost_project_id", checkToken, deleteCostProjectController.handle.bind(deleteCostProjectController))

const updateCostProjectController = new UpdateCostProjectController();
projectRoutes.put("/costproject", checkToken, updateCostProjectController.handle.bind(updateCostProjectController));

// projectRoutes.post("/add_project_responsibles", checkToken, projectController.addProjectResponsibles)
// projectRoutes.delete("/remove_project_responsibles", checkToken, projectController.removeProjectResponsibles)

const galleryProject = new GalleryProjectController()
projectRoutes.post('/project/gallery', galleryProject.create.bind(galleryProject))
projectRoutes.delete('/project/gallery', checkToken, galleryProject.delete.bind(galleryProject))
projectRoutes.get('/project/gallery/:id', galleryProject.find.bind(galleryProject))
projectRoutes.post('/project/gallery/send-email', checkToken, uploadAttachments.array("attachments", 10), galleryProject.sendEmail.bind(galleryProject))

projectRoutes.get('/project/services-project/:id', checkToken, projectController.findServicesProjectByProjectId.bind(projectController))

projectRoutes.get('/project/services-project/history/:id', checkToken, projectController.findHistoryServicesProjectById.bind(projectController))

// Rota para listar atividades
projectRoutes.get("/project/services-project/activities/:serviceProjectId", checkToken, listActivities);
// Rota para cadastrar uma nova atividade
projectRoutes.post("/project/services-project/activities", checkToken, createActivity);
// Rota para excluir uma atividade
projectRoutes.delete("/project/services-project/activities/:id", checkToken, deleteActivity);

projectRoutes.post("/project/schedule", checkToken, projectController.getSellerSchedule.bind(projectController));

projectRoutes.patch("/service-project/update/dates", checkToken, projectController.updateDatesServiceProject.bind(projectController));

projectRoutes.patch("/service-project/update/status", checkToken, projectController.updateStatusServiceProject.bind(projectController));

projectRoutes.post("/service-project/schedule", checkToken, projectController.getServiceProjectSchedule.bind(projectController));

// Rota para buscar os ServiceProjects relacionados ao usuário
projectRoutes.post("/service-project/scheduleById", projectController.getServiceProjectScheduleByIdUser.bind(projectController));

projectRoutes.get("/service-project/schedule/worker/:id", checkToken, projectController.getWorkerSchedule.bind(projectController));

const timeController = new TimeController()
projectRoutes.get('/time-cards/all', checkToken, timeController.findMany.bind(timeController))
projectRoutes.get('/time-cards/worker_id', checkToken, timeController.findManyByIdWorker.bind(timeController))
projectRoutes.get('/time-cards/worker_id_web', checkToken, timeController.findManyByIdWorkerWeb.bind(timeController))
projectRoutes.get('/time-activies', checkToken, timeController.findManyActivies.bind(timeController))

projectRoutes.get("/project/generate-pdf/:id", checkToken, projectController.generateAndSendPdf.bind(projectController));

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
  createPdfProjectEstimateInvoiceController.updateEstimateId.bind(createPdfProjectEstimateInvoiceController)
);

// Rota PUT para atualizar PDF Project
projectRoutes.put(
  "/pdfproject/estimate-invoice/:id",
  checkToken,
  createPdfProjectEstimateInvoiceController.update.bind(createPdfProjectEstimateInvoiceController)
);

const findPdfProjectEstimateInvoiceController = new FindPdfProjectEstimateInvoiceController();
projectRoutes.post(
  "/pdfproject/estimate-invoice/find",
  checkToken,
  findPdfProjectEstimateInvoiceController.handle.bind(findPdfProjectEstimateInvoiceController)
);

const balanceController = new BalanceController();

projectRoutes.patch("/project/update/balance-due", checkToken, balanceController.updateBalanceDue.bind(balanceController));
projectRoutes.get("/project/amount-paid/:projectId", checkToken, balanceController.getAmountPaid.bind(balanceController));

// Upload e gerenciamento de foto de capa do projeto
const uploadProjectCover = multer(
  uploadConfig.upload("./public/tmp/project-cover")
);
projectRoutes.post(
  "/project/:id/cover-photo",
  checkToken,
  uploadProjectCover.single("file"),
  compressImage("project-cover"),
  projectController.uploadCoverPhoto.bind(projectController)
);
projectRoutes.delete(
  "/project/:id/cover-photo",
  checkToken,
  projectController.deleteCoverPhoto.bind(projectController)
);

export { projectRoutes };
