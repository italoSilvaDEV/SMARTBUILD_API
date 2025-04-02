import { Router } from "express";
import { QuickBooksController } from "../controllers/quickbooks/QuickBooksController";
import { QuickBooksInvoiceController } from "../controllers/quickbooks/QuickBooksInvoiceController";
import { checkToken } from "../middlewares/checkToken";

const quickbooksRoutes = Router();
const quickbooksController = new QuickBooksController();
const quickbooksInvoiceController = new QuickBooksInvoiceController();

// Rotas de autorização
quickbooksRoutes.get("/quickbooks/authorize/:userId", quickbooksController.authorize);
quickbooksRoutes.get("/quickbooks/callback", quickbooksController.callback);
quickbooksRoutes.get("/quickbooks/status/:userId", checkToken, quickbooksController.checkStatus);
quickbooksRoutes.post("/quickbooks/refresh-token/:userId", checkToken, quickbooksController.refreshToken);

// Rotas de invoice
quickbooksRoutes.post("/quickbooks/invoice/:projectId", checkToken, quickbooksInvoiceController.createInvoice);
quickbooksRoutes.get("/quickbooks/invoices/:projectId", checkToken, quickbooksInvoiceController.getInvoicesByProject);
quickbooksRoutes.post("/quickbooks/invoice/:invoiceId/send", checkToken, quickbooksInvoiceController.sendInvoice);
quickbooksRoutes.post("/quickbooks/invoice/:invoiceId/cancel", checkToken, quickbooksInvoiceController.cancelInvoice);

export { quickbooksRoutes }; 