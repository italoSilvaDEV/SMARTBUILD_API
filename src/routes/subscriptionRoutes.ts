import { Router } from 'express';
import { SubscriptionController } from '../adapters/controllers/subscriptionController';
import { SubscriptionService } from '../application/services/subscriptionService';
import { PrismaSubscriptionRepository } from '../infrastructure/repositories/prisma/PrismaSubscriptionRepository';
import { checkToken } from '../middlewares/checkToken';

const subscriptionRoutes = Router();
const subscriptionRepository = new PrismaSubscriptionRepository();
const subscriptionService = new SubscriptionService(subscriptionRepository);
const subscriptionController = new SubscriptionController(subscriptionService);

// Rotas para assinaturas
subscriptionRoutes.post('/subscriptions', checkToken, (req, res) => subscriptionController.createSubscription(req, res));
subscriptionRoutes.get('/subscriptions', checkToken, (req, res) => subscriptionController.getAllSubscriptions(req, res));
subscriptionRoutes.get('/subscriptions/:id', checkToken, (req, res) => subscriptionController.getSubscriptionById(req, res));
subscriptionRoutes.get('/companies/:companyId/subscriptions', checkToken, (req, res) => subscriptionController.getSubscriptionsByCompany(req, res));
subscriptionRoutes.put('/subscriptions/:id', checkToken, (req, res) => subscriptionController.updateSubscription(req, res));
subscriptionRoutes.patch('/subscriptions/:id/cancel', checkToken, (req, res) => subscriptionController.cancelSubscription(req, res));
subscriptionRoutes.patch('/subscriptions/:id/renew', checkToken, (req, res) => subscriptionController.renewSubscription(req, res));

export { subscriptionRoutes }; 