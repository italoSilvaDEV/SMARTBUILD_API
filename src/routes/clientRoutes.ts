import { Router } from 'express';
import { CreateClientController } from '../controllers/client/CreateClientController';
import { UpdateClientController } from '../controllers/client/UpdateClientController';
import { ListClientController } from '../controllers/client/ListClientController';
import { GetClientFinancialDetailsController } from '../controllers/client/GetClientFinancialDetailsController';
import { checkToken } from '../middlewares/checkToken';
import { GetClientController } from '../controllers/client/getClientController';

const clientRoutes = Router();

const createClientController = new CreateClientController();
const updateClientController = new UpdateClientController();
const listClientController = new ListClientController();
const getClientFinancialDetailsController = new GetClientFinancialDetailsController();
const getClientController = new GetClientController();

clientRoutes.post('/client', checkToken, createClientController.handle);//ok novo modelo
clientRoutes.put('/client/:id', checkToken, updateClientController.handle); //ok novo modelo
clientRoutes.get('/clients', checkToken, listClientController.handleNewClients); //ok novo modelo
clientRoutes.get('/client/financial/:email', checkToken, getClientFinancialDetailsController.handle);
clientRoutes.get('/client/:id', checkToken, getClientController.handle);

export { clientRoutes };
