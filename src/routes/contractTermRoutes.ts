import { Router } from 'express';
import { checkToken } from '../middlewares/checkToken';
import { ContractTermController } from '../controllers/contractterms/contractTermController';

const contractTermRoutes = Router();

const contractTermController = new ContractTermController();

contractTermRoutes.post('/handle', checkToken, contractTermController.handle)
contractTermRoutes.get('/get/:companyId', checkToken, contractTermController.get)

export { contractTermRoutes };
