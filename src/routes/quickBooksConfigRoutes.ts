import { Router } from "express";
import { QuickBooksConfigController } from "../controllers/quickbooks/QuickBooksConfigController";
import { checkToken } from "../middlewares/checkToken";

const router = Router();
const quickBooksConfigController = new QuickBooksConfigController();

// Buscar todas as configurações de uma empresa
router.get("/company/:companyId", checkToken, quickBooksConfigController.getConfigurations);

// Buscar uma configuração específica
router.get("/company/:companyId/:configType", checkToken, quickBooksConfigController.getConfiguration);

// Atualizar ou criar uma configuração
router.patch("/company/:companyId", checkToken, quickBooksConfigController.updateConfiguration);

// Deletar uma configuração
router.delete("/company/:companyId/:configType", checkToken, quickBooksConfigController.deleteConfiguration);

export { router as quickBooksConfigRoutes };
