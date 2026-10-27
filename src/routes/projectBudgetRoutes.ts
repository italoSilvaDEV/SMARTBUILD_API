import { Router } from 'express';
import { checkToken } from '../middlewares/checkToken';
import {
  requireProjectBudgetAccess,
  limitReceiptScans,
  requireReceiptScanConfiguration,
  uploadProjectReceipt,
} from '../middlewares/projectBudget';
import { ProjectBudgetController } from '../controllers/projects/ProjectBudgetController';

export const projectBudgetRoutes = Router();
const controller = new ProjectBudgetController();
const base = '/mobile/projects/:projectId';

projectBudgetRoutes.get(`${base}/budget`, checkToken, requireProjectBudgetAccess, controller.get);
projectBudgetRoutes.put(`${base}/budget`, checkToken, requireProjectBudgetAccess, controller.save);
projectBudgetRoutes.post(
  `${base}/receipt-extraction`,
  checkToken,
  requireProjectBudgetAccess,
  limitReceiptScans,
  requireReceiptScanConfiguration,
  uploadProjectReceipt,
  controller.extractReceipt,
);
