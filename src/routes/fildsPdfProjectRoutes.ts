import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { FildsPdfProjectController } from "../controllers/projects/FildsPdfProjectController";

const fildsPdfProjectRoutes = Router();
const fildsPdfProjectController = new FildsPdfProjectController();

// Criar um novo fildsPdfProject
fildsPdfProjectRoutes.post(
  "/filds-pdf-project",
  checkToken,
  fildsPdfProjectController.create
);

// Atualizar um fildsPdfProject existente
fildsPdfProjectRoutes.put(
  "/filds-pdf-project/:id",
  checkToken,
  fildsPdfProjectController.update
);

// Deletar um fildsPdfProject
fildsPdfProjectRoutes.delete(
  "/filds-pdf-project/:id",
  checkToken,
  fildsPdfProjectController.delete
);

// Buscar um fildsPdfProject por ID
fildsPdfProjectRoutes.get(
  "/filds-pdf-project/:id",
  checkToken,
  fildsPdfProjectController.findById
);

// Buscar fildsPdfProjects por PdfProject
fildsPdfProjectRoutes.get(
  "/filds-pdf-project/pdf-project/:pdfProjectId",
  checkToken,
  fildsPdfProjectController.findByPdfProject
);

// Buscar fildsPdfProjects por Estimate
fildsPdfProjectRoutes.get(
  "/filds-pdf-project/estimate/:estimateId",
  checkToken,
  fildsPdfProjectController.findByEstimate
);

// Buscar fildsPdfProjects por Invoice
fildsPdfProjectRoutes.get(
  "/filds-pdf-project/invoice/:invoiceId",
  checkToken,
  fildsPdfProjectController.findByInvoice
);

export { fildsPdfProjectRoutes }; 