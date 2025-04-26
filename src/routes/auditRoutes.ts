import { Router } from 'express';
import { AuditController } from '../controllers/Audit/AuditController';

const auditRoutes = Router();
const auditController = new AuditController();


// Get audit records by user ID
auditRoutes.get('/user/:userId', auditController.findByUser);

// Get all audit records with pagination
auditRoutes.get('/', auditController.findAll);

export { auditRoutes }; 