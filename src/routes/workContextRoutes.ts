import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { CreateWorkContextController } from "../controllers/workContext/CreateWorkContextController";
import { UpdateWorkContextController } from "../controllers/workContext/UpdateWorkContextController";
import { DeleteWorkContextController } from "../controllers/workContext/DeleteWorkContextController";
import { FindWorkContextController } from "../controllers/workContext/FindWorkContextController";

const workContextRoutes = Router();

// Instanciar controllers
const createWorkContextController = new CreateWorkContextController();
const updateWorkContextController = new UpdateWorkContextController();
const deleteWorkContextController = new DeleteWorkContextController();
const findWorkContextController = new FindWorkContextController();

// ============================================================
// ROTAS DE CRIAÇÃO
// ============================================================

// POST: Criar novo WorkContext
workContextRoutes.post(
  "/work-context",
  checkToken,
  createWorkContextController.handle
);

// ============================================================
// ROTAS DE ATUALIZAÇÃO
// ============================================================

// PUT: Atualizar WorkContext
workContextRoutes.put(
  "/work-context",
  checkToken,
  updateWorkContextController.handle
);

// ============================================================
// ROTAS DE EXCLUSÃO
// ============================================================

// DELETE: Deletar WorkContext por ID
workContextRoutes.delete(
  "/work-context/:id",
  checkToken,
  deleteWorkContextController.handle
);

// ============================================================
// ROTAS DE BUSCA/LEITURA
// ============================================================

// GET: Buscar WorkContext por ID
workContextRoutes.get(
  "/work-context/:id",
  checkToken,
  findWorkContextController.getById
);

// GET: Buscar Cliente com todos os WorkContexts e Projetos
// Esta é a rota especial que você pediu!
workContextRoutes.get(
  "/work-context/client/:clientId",
  checkToken,
  findWorkContextController.getByClientId
);

// GET: Buscar WorkContexts por Empresa
workContextRoutes.get(
  "/work-context/company/:companyId",
  checkToken,
  findWorkContextController.getByCompanyId
);

// GET: Listar todos com paginação
workContextRoutes.get(
  "/work-contexts/list",
  checkToken,
  findWorkContextController.list
);

// POST: Buscar com filtros avançados
workContextRoutes.post(
  "/work-context/search",
  checkToken,
  findWorkContextController.search
);

export { workContextRoutes };

