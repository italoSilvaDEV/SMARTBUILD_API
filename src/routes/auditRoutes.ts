import { Router } from 'express';
import { AuditController } from '../controllers/Audit/AuditController';
import { checkToken } from '../middlewares/checkToken';

const auditRoutes = Router();
const auditController = new AuditController();


// Get audit records by user ID
auditRoutes.get('/user/:userId', checkToken, auditController.findByUser);

// Get all audit records with pagination
auditRoutes.get('/', checkToken, auditController.findAll);

export { auditRoutes };
