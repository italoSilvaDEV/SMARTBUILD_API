import { Router } from 'express';
import { CreateClientController } from '../controllers/client/CreateClientController';
import { UpdateClientController } from '../controllers/client/UpdateClientController';
import { ListClientController } from '../controllers/client/ListClientController';
import { GetClientFinancialDetailsController } from '../controllers/client/GetClientFinancialDetailsController';
import { checkToken } from '../middlewares/checkToken';

const clientRoutes = Router();

const createClientController = new CreateClientController();
const updateClientController = new UpdateClientController();
const listClientController = new ListClientController();
const getClientFinancialDetailsController = new GetClientFinancialDetailsController();

clientRoutes.post('/client', checkToken, createClientController.handle);//ok novo modelo
clientRoutes.put('/client/:id', checkToken, updateClientController.handle); //ok novo modelo
clientRoutes.get('/clients', checkToken, listClientController.handleNewClients); //ok novo modelo
clientRoutes.get('/client/financial/:email', checkToken, getClientFinancialDetailsController.handle);

export { clientRoutes };
