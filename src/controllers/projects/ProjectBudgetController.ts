import { Request, Response } from 'express';
import { projectBudgetActorId } from '../../middlewares/projectBudget';
import { getProjectBudget, saveProjectBudget, ProjectBudgetError } from '../../services/ProjectBudgetService';
import { extractReceipt, isReceiptScanAvailable, ReceiptError } from '../../services/ReceiptExtractionService';

export class ProjectBudgetController {
  async get(req: Request, res: Response) {
    try {
      const budget = await getProjectBudget(req.params.projectId);
      return res.json({ budget, receiptScanAvailable: isReceiptScanAvailable() });
    } catch {
      return res.status(503).json({ error: 'Budget unavailable' });
    }
  }

  async save(req: Request, res: Response) {
    try {
      const budget = await saveProjectBudget(req.params.projectId, projectBudgetActorId(req), req.body);
      return res.json({ budget });
    } catch (error) {
      if (error instanceof ProjectBudgetError) {
        if (error.code === 'INVALID_BUDGET') {
          return res.status(400).json({ error: 'Invalid budget', code: error.code });
        }
        return res.status(409).json({ error: 'Budget changed. Reload before saving.', code: error.code });
      }
      return res.status(503).json({ error: 'Budget save failed' });
    }
  }

  async extractReceipt(req: Request, res: Response) {
    if (!Array.isArray(req.files) || !req.files.length) {
      return res.status(400).json({ code: 'INVALID_RECEIPT_IMAGE', error: 'Use 1 to 5 images, up to 8 MB each' });
    }
    try {
      return res.json({ receipt: await extractReceipt(req.files.map(file => file.buffer)) });
    } catch (error) {
      const failure = error instanceof ReceiptError ? error : new ReceiptError('RECEIPT_AI_FAILED', 502);
      return res.status(failure.status).json({ code: failure.code, error: failure.message });
    }
  }
}
