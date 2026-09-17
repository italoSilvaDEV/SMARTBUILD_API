import { Router } from 'express';
import { PlanController } from '../controllers/plans/PlanController';
import { checkToken } from '../middlewares/checkToken';
import { requireMaster } from '../middlewares/requireMaster';

const planRoutes = Router();
const planController = new PlanController();

// Rotas para planos
planRoutes.post('/plans', checkToken, planController.create);
planRoutes.get('/master/plans', checkToken, requireMaster, planController.getAllPlans);
planRoutes.get('/plans', planController.getAllPlans);
planRoutes.get('/plans/:id', planController.getPlanById);
planRoutes.put('/plans/:id', checkToken, planController.updatePlan);
planRoutes.patch('/plans/:id/status', checkToken, planController.patchPlanStatus);
planRoutes.delete('/plans/:id', checkToken, planController.deletePlan);

export { planRoutes };
