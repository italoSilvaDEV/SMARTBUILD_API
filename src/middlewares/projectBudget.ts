import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { canAccessProjectBudget } from '../services/ProjectBudgetService';
import { isReceiptScanAvailable } from '../services/ReceiptExtractionService';

export function projectBudgetActorId(req: Request) {
  return (req as Request & { userId: string }).userId;
}

export async function requireProjectBudgetAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await canAccessProjectBudget(req.params.projectId, projectBudgetActorId(req))) {
      return res.status(403).json({ error: 'Project finances unavailable', code: 'BUDGET_FORBIDDEN' });
    }
    return next();
  } catch {
    return res.status(503).json({ error: 'Project finances unavailable' });
  }
}

const scans = new Map<string, { count: number; expires: number }>();

export function limitReceiptScans(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [id, value] of scans) if (value.expires <= now) scans.delete(id);
  const userId = projectBudgetActorId(req);
  const item = scans.get(userId) || { count: 0, expires: now + 60_000 };
  if (item.count >= 5 || scans.size >= 5000) {
    return res.status(429).json({ code: 'RECEIPT_RATE_LIMIT', error: 'Try again later' });
  }
  item.count++;
  scans.set(userId, item);
  return next();
}

export function requireReceiptScanConfiguration(req: Request, res: Response, next: NextFunction) {
  if (!isReceiptScanAvailable()) {
    return res.status(503).json({ code: 'RECEIPT_AI_UNAVAILABLE', error: 'Receipt scan is not configured' });
  }
  return next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5, fields: 0 },
}).array('file', 5);

export function uploadProjectReceipt(req: Request, res: Response, next: NextFunction) {
  upload(req, res, error => {
    if (error || !Array.isArray(req.files) || !req.files.length) {
      return res.status(400).json({ code: 'INVALID_RECEIPT_IMAGE', error: 'Use 1 to 5 images, up to 8 MB each' });
    }
    return next();
  });
}
