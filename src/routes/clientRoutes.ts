import { Router } from 'express';
import { CreateClientController } from '../controllers/client/CreateClientController';
import { UpdateClientController } from '../controllers/client/UpdateClientController';
import { checkToken } from '../middlewares/checkToken';
const clientRoutes = Router();

const createClientController = new CreateClientController();
clientRoutes.post('/client', checkToken, createClientController.handle);

const updateClientController = new UpdateClientController()
clientRoutes.put('/client/:id',checkToken, updateClientController.handle  )

export { clientRoutes };
