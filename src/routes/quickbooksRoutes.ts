import { Router } from "express";
import { QuickBooksController } from "../controllers/quickbooks/oauth/QuickBooksOauthController";
import { QuickBooksInvoiceController } from "../controllers/quickbooks/invoice/QuickBooksInvoiceController";
import { checkToken } from "../middlewares/checkToken";
import { SyncPreferencesController } from "../controllers/quickbooks/syncPreference/syncPreferenceController";
import { QuickBooksClientController } from "../controllers/quickbooks/customer/QuickBooksCustomerController";
import { SyncOrchestratorController } from "../controllers/quickbooks/sync/SyncOrchestratorController";
import { QuickBooksCustomerOutboundController } from "../controllers/quickbooks/customer/QuickbooksCustomerOutboundController";

const quickbooksRoutes = Router();
const quickbooksController = new QuickBooksController();
const quickbooksInvoiceController = new QuickBooksInvoiceController();
const quickbooksSyncPreferenceController = new SyncPreferencesController();
const quickbooksClientController = new QuickBooksClientController();
const syncOrchestratorController = new SyncOrchestratorController();
const qbOutbound = new QuickBooksCustomerOutboundController();

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

// rotas de sincronizar customers
quickbooksRoutes.get("/clients/sync/:companyId/:userId", checkToken, quickbooksClientController.syncClients);

// Rotas do orquestrador de sincronização
quickbooksRoutes.post("/quickbooks/orchestrate-sync/:companyId/:userId", checkToken, syncOrchestratorController.orchestrateSync);
quickbooksRoutes.post("/quickbooks/execute-sync/:companyId/:userId", checkToken, syncOrchestratorController.executeExistingSync);
quickbooksRoutes.get("/quickbooks/sync-status/:companyId/:userId", checkToken, syncOrchestratorController.getSyncStatus);

// Exportação inicial (Local -> QBO) — cria Customer no QBO p/ quem não tem idQuickbooks
quickbooksRoutes.post("/quickbooks/export-clients/:companyId/:userId", checkToken, qbOutbound.exportMissingToQBO);

// Push de updates (Local -> QBO) — atualiza no QBO quem já tem idQuickbooks
quickbooksRoutes.post("/quickbooks/push-clients/:companyId/:userId", checkToken, qbOutbound.pushLocalUpdatesToQBO);






export { quickbooksRoutes }; 