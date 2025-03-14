import { Router } from 'express';
import { PlanController } from '../adapters/controllers/planController';
import { PlanService } from '../application/services/planService';
import { PrismaPlanRepository } from '../infrastructure/repositories/prisma/PrismaPlanRepository';
import { checkToken } from '../middlewares/checkToken';
const planRoutes = Router();
const planRepository = new PrismaPlanRepository();
const planService = new PlanService(planRepository);
const planController = new PlanController(planService);

// Rotas para planos
planRoutes.post('/plans', checkToken, (req, res) => planController.createPlan(req, res));
planRoutes.get('/plans', checkToken, (req, res) => planController.getAllPlans(req, res));
planRoutes.get('/plans/:id', checkToken, (req, res) => planController.getPlanById(req, res));
planRoutes.put('/plans/:id', checkToken, (req, res) => planController.updatePlan(req, res));
planRoutes.delete('/plans/:id', checkToken, (req, res) => planController.deletePlan(req, res));

export { planRoutes }; 