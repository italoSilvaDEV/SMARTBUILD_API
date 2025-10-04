import { Router } from "express";
import { QuickBooksConfigController } from "../controllers/quickbooks/QuickBooksConfigController";

const router = Router();
const quickBooksConfigController = new QuickBooksConfigController();

// Buscar todas as configurações de uma empresa
router.get("/company/:companyId", quickBooksConfigController.getConfigurations);

// Buscar uma configuração específica
router.get("/company/:companyId/:configType", quickBooksConfigController.getConfiguration);

// Atualizar ou criar uma configuração
router.patch("/company/:companyId", quickBooksConfigController.updateConfiguration);

// Deletar uma configuração
router.delete("/company/:companyId/:configType", quickBooksConfigController.deleteConfiguration);

export { router as quickBooksConfigRoutes };
