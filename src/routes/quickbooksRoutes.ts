import { Router } from "express";
import { QuickBooksController } from "../controllers/quickbooks/QuickBooksController";
import { checkToken } from "../middlewares/checkToken";

const quickbooksRoutes = Router();
const quickbooksController = new QuickBooksController();

// Rota para iniciar o processo de autorização
quickbooksRoutes.get("/quickbooks/authorize/:userId", 
    // checkToken, 
    quickbooksController.authorize);

// Rota de callback (não precisa de token pois é chamada pelo QuickBooks)
quickbooksRoutes.get("/quickbooks/callback", quickbooksController.callback);

// Rota para verificar o status da conexão com QuickBooks
quickbooksRoutes.get("/quickbooks/status/:userId", checkToken, quickbooksController.checkStatus);

export { quickbooksRoutes }; 