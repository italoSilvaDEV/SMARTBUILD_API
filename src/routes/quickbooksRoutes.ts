import { Router } from "express";
import { QuickBooksController } from "../controllers/quickbooks/oauth/QuickBooksOauthController";
import { QuickBooksInvoiceController } from "../controllers/quickbooks/invoice/QuickBooksInvoiceController";
import { checkToken } from "../middlewares/checkToken";
import { SyncPreferencesController } from "../controllers/quickbooks/syncPreference/syncPreferenceController";

const quickbooksRoutes = Router();
const quickbooksController = new QuickBooksController();
const quickbooksInvoiceController = new QuickBooksInvoiceController();
const quickbooksSyncPreferenceController = new SyncPreferencesController();

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

// Rotas de syncPreference
quickbooksRoutes.get("/quickbooks/sync-preferences/:companyId", checkToken, quickbooksSyncPreferenceController.listByCompany);
quickbooksRoutes.get("/quickbooks/sync-preferences/:userId", checkToken, quickbooksSyncPreferenceController.listByUser);
quickbooksRoutes.post("/quickbooks/sync-preferences", checkToken, quickbooksSyncPreferenceController.create);
quickbooksRoutes.put("/quickbooks/sync-preferences/:id", checkToken, quickbooksSyncPreferenceController.update);
quickbooksRoutes.delete("/quickbooks/sync-preferences/:id", checkToken, quickbooksSyncPreferenceController.delete);



export { quickbooksRoutes }; 