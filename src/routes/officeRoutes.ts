import { Router } from "express";
import { OfficeController } from "../controllers/office/OfficeController";
import { checkToken } from "../middlewares/checkToken";

const officeRoutes = Router();
const officeController = new OfficeController();

// Listar todos os offices
officeRoutes.get("/office", checkToken, officeController.list);

// Obter permissões por empresa
officeRoutes.get("/office/permissions/:companyId", checkToken, officeController.getPermissionsByCompany);

// Obter office por ID
officeRoutes.get("/office/:id", checkToken, officeController.getById);

// Criar novo office
officeRoutes.post("/office", checkToken, officeController.create);

// Atualizar office
officeRoutes.put("/office/:id", checkToken, officeController.update);

// Deletar office
officeRoutes.delete("/office/:id", checkToken, officeController.delete);

export { officeRoutes };
 