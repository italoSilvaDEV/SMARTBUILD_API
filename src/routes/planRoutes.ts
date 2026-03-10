import { Router } from 'express';
import { PlanController } from '../controllers/plans/PlanController';
import { checkToken } from '../middlewares/checkToken';

const planRoutes = Router();
const planController = new PlanController();

// Rotas para planos
planRoutes.post('/plans', checkToken, planController.create);
planRoutes.get('/plans', planController.getAllPlans);
planRoutes.get('/plans/available', checkToken, planController.getAvailablePlans.bind(planController));
planRoutes.get('/plans/permission-diff', checkToken, planController.getPermissionDiff.bind(planController));
planRoutes.get('/plans/:id', planController.getPlanById);
planRoutes.put('/plans/:id', checkToken, planController.updatePlan);
planRoutes.patch('/plans/:id/status', checkToken, planController.patchPlanStatus);
planRoutes.delete('/plans/:id', checkToken, planController.deletePlan);

export { planRoutes }; 