import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscriptions/SubscriptionController';
import { checkToken } from '../middlewares/checkToken';

const subscriptionRoutes = Router();
const subscriptionController = new SubscriptionController();

// Rotas para assinaturas
subscriptionRoutes.post('/subscriptions', subscriptionController.create);
subscriptionRoutes.get('/subscriptions', checkToken, subscriptionController.getAllSubscriptions);
subscriptionRoutes.get('/subscriptions/:id', checkToken, subscriptionController.getSubscriptionById);
subscriptionRoutes.get('/companies/:companyId/subscriptions', checkToken, subscriptionController.getSubscriptionsByCompany);
subscriptionRoutes.put('/subscriptions/:id', checkToken, subscriptionController.updateSubscription);
subscriptionRoutes.patch('/subscriptions/:id/cancel', checkToken, subscriptionController.cancelSubscription);
subscriptionRoutes.patch('/subscriptions/:id/renew', checkToken, subscriptionController.renewSubscription);

export { subscriptionRoutes }; 