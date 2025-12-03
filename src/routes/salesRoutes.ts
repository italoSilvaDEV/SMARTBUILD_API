import { Router } from 'express';
import { SalesPipelineController } from '../controllers/sales/SalesPipelineController';
import { SalesDealController } from '../controllers/sales/SalesDealController';
import { SalesActivityController } from '../controllers/sales/SalesActivityController';
import { SalesStageController } from '../controllers/sales/SalesStageController';
import { SalesSyncController } from '../controllers/sales/SalesSyncController';
import { checkToken } from '../middlewares/checkToken';

const salesRoutes = Router();
const pipelineController = new SalesPipelineController();
const dealController = new SalesDealController();
const activityController = new SalesActivityController();
const stageController = new SalesStageController();
const syncController = new SalesSyncController();

// Pipeline routes
salesRoutes.post('/sales/pipelines/default', checkToken, pipelineController.createDefaultPipeline);
salesRoutes.get('/sales/pipelines', checkToken, pipelineController.list);
salesRoutes.get('/sales/pipelines/:id', checkToken, pipelineController.getById);
salesRoutes.post('/sales/pipelines', checkToken, pipelineController.create);
salesRoutes.put('/sales/pipelines/:id', checkToken, pipelineController.update);
salesRoutes.delete('/sales/pipelines/:id', checkToken, pipelineController.delete);

// Deal routes
salesRoutes.post('/sales/deals', checkToken, dealController.create);
salesRoutes.get('/sales/deals/:id', checkToken, dealController.getById);
salesRoutes.put('/sales/deals/:id', checkToken, dealController.update);
salesRoutes.patch('/sales/deals/:id/move', checkToken, dealController.moveStage);
salesRoutes.post('/sales/deals/:id/convert', checkToken, dealController.convert);
salesRoutes.delete('/sales/deals/:id', checkToken, dealController.delete);

// Activity routes
salesRoutes.post('/sales/activities', checkToken, activityController.create);
salesRoutes.get('/sales/deals/:dealId/activities', checkToken, activityController.getByDeal);
salesRoutes.delete('/sales/activities/:id', checkToken, activityController.delete);

// Stage routes
salesRoutes.post('/sales/stages', checkToken, stageController.create);
salesRoutes.put('/sales/stages/:id', checkToken, stageController.update);
salesRoutes.delete('/sales/stages/:id', checkToken, stageController.delete);

// Sync routes
salesRoutes.post('/sales/sync/companies', checkToken, syncController.syncCompaniesToDeals);

export { salesRoutes };

