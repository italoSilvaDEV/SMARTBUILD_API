import { Router } from 'express';
import { CreateClientController } from '../controllers/client/CreateClientController';
import { UpdateClientController } from '../controllers/client/UpdateClientController';
import { ListClientController } from '../controllers/client/ListClientController';
import { GetClientFinancialDetailsController } from '../controllers/client/GetClientFinancialDetailsController';
import { ClientDashboardController } from '../controllers/client/ClientDashboardController';
import { MergeClientController } from '../controllers/client/MergeClientController';
import { checkToken } from '../middlewares/checkToken';
import { GetClientController } from '../controllers/client/getClientController';

const clientRoutes = Router();

const createClientController = new CreateClientController();
const updateClientController = new UpdateClientController();
const listClientController = new ListClientController();
const getClientFinancialDetailsController = new GetClientFinancialDetailsController();
const getClientController = new GetClientController();
const clientDashboardController = new ClientDashboardController();
const mergeClientController = new MergeClientController();

clientRoutes.post('/client', checkToken, createClientController.handle);//ok novo modelo
clientRoutes.put('/client/:id', checkToken, updateClientController.handle); //ok novo modelo
clientRoutes.get('/clients', checkToken, listClientController.handleNewClients); //ok novo modelo
clientRoutes.get('/clients-with-work-contexts', checkToken, listClientController.handleClientsWithWorkContexts); // clientes com work contexts
clientRoutes.get('/client/financial/:email', checkToken, getClientFinancialDetailsController.handle);
clientRoutes.get('/client/:id', checkToken, getClientController.handle);

// Client Dashboard Routes
clientRoutes.get('/client-dashboard/:clientId/charts/projects', checkToken, clientDashboardController.projectsChart);
clientRoutes.get('/client-dashboard/:clientId/charts/estimates', checkToken, clientDashboardController.estimatesChart);
clientRoutes.get('/client-dashboard/:clientId/charts/invoices', checkToken, clientDashboardController.invoicesChart);

// Client Merge Routes
clientRoutes.get('/client-merge/:clientId/preview', checkToken, mergeClientController.getClientMergePreview);
clientRoutes.post('/client-merge/validate', checkToken, mergeClientController.validateMerge);
clientRoutes.post('/client-merge/execute', checkToken, mergeClientController.executeClientMerge);

export { clientRoutes };
