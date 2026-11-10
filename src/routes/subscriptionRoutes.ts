import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscriptions/SubscriptionController';
import { checkToken } from '../middlewares/checkToken';
import { requireMaster } from '../middlewares/requireMaster';
import { requireSubscriptionReadAccess } from '../middlewares/subscriptionAccess';
import { checkTokenOrRegistrationToken } from '../middlewares/publicAccess';

const subscriptionRoutes = Router();
const subscriptionController = new SubscriptionController();

// Rotas para assinaturas
subscriptionRoutes.post('/subscriptions', checkTokenOrRegistrationToken, subscriptionController.create);
subscriptionRoutes.get('/subscriptions', checkToken, requireMaster, subscriptionController.getAllSubscriptions);
subscriptionRoutes.get('/subscriptions/:id', checkToken, requireSubscriptionReadAccess, subscriptionController.getSubscriptionById);
subscriptionRoutes.get('/companies/:companyId/subscriptions', checkToken, requireSubscriptionReadAccess, subscriptionController.getSubscriptionsByCompany);
subscriptionRoutes.put('/subscriptions/:id', checkToken, requireMaster, subscriptionController.updateSubscription);
subscriptionRoutes.patch('/subscriptions/:id/cancel', checkToken, requireMaster, subscriptionController.cancelSubscription);
subscriptionRoutes.patch('/subscriptions/:id/renew', checkToken, requireMaster, subscriptionController.renewSubscription);

export { subscriptionRoutes };
