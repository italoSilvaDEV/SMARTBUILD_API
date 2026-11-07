import { Router } from "express";
import { OfficeController } from "../controllers/office/OfficeController";
import { checkToken } from "../middlewares/checkToken";

import { requireOfficeAccess } from "../middlewares/officeAccess";

const officeRoutes = Router();
const officeController = new OfficeController();

// Listar todos os offices
officeRoutes.get("/office", checkToken, requireOfficeAccess, officeController.list);

// Obter permissões por empresa
officeRoutes.get("/office/permissions/:companyId", checkToken, requireOfficeAccess, officeController.getPermissionsByCompany);

// Obter office por ID
officeRoutes.get("/office/:id", checkToken, requireOfficeAccess, officeController.getById);

// Criar novo office
officeRoutes.post("/office", checkToken, requireOfficeAccess, officeController.create);

// Atualizar office
officeRoutes.put("/office/:id", checkToken, requireOfficeAccess, officeController.update);

// Deletar office
officeRoutes.delete("/office/:id", checkToken, requireOfficeAccess, officeController.delete);

export { officeRoutes };
 