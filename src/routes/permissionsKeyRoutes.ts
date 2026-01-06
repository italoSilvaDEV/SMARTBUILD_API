import { Router } from "express";
import { CreateNewKeyController } from "../controllers/permissionsKey/createNewKeyController";
import { ResponseKeyRequestController } from "../controllers/permissionsKey/responseKeyRequestController";
import { RevokeKeyController } from "../controllers/permissionsKey/revokeKeyController";
import { ListActiveKeysController } from "../controllers/permissionsKey/listActiveKeysController";
import { GetKeyController } from "../controllers/permissionsKey/getKeyController";
import { checkToken } from "../middlewares/checkToken";

const permissionsKeyRoutes = Router();

const createNewKeyController = new CreateNewKeyController();
const responseController = new ResponseKeyRequestController();
const revokeController = new RevokeKeyController();
const listActiveKeysController = new ListActiveKeysController();
const getKeyController = new GetKeyController();

permissionsKeyRoutes.post("/create", checkToken, createNewKeyController.handle);

permissionsKeyRoutes.get("/:keyId/approve", responseController.handle);
permissionsKeyRoutes.get("/:keyId/reject", responseController.handle);

permissionsKeyRoutes.post("/:keyId/revoke-request", checkToken, revokeController.handle);
permissionsKeyRoutes.get("/:keyId/confirm-revoke", revokeController.confirm);

permissionsKeyRoutes.get("/active", checkToken, listActiveKeysController.handle);

permissionsKeyRoutes.get("/:keyId/view", getKeyController.handle);

export { permissionsKeyRoutes };
