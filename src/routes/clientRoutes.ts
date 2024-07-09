import { Router } from 'express';
import { CreateClientController } from '../controllers/client/CreateClientController';
const clientRoutes = Router();

const createClientController = new CreateClientController();

clientRoutes.post('/client', createClientController.handle);

export { clientRoutes };
