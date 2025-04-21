import { Request, Response, NextFunction } from 'express';
import { logAudit } from '../utils/auditLogger';

/**
 * Middleware to automatically log audit events for specific routes
 * 
 * @param actionPrefix - Prefix for the audit action (e.g., "Created", "Updated", "Deleted")
 * @returns Middleware function
 */
export function auditMiddleware(actionPrefix: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store the original end method
    const originalEnd = res.end;
    
    // Override the end method
    res.end = function(chunk?: any, encoding?: any, cb?: any): any {
      // Only log successful operations (status codes 2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user?.id; // Assuming you have user info in the request
        
        if (userId) {
          const resourceId = req.params.id || '';
          const action = `${actionPrefix} ${resourceId}`.trim();
          
          // Log the audit asynchronously (don't wait for it)
          logAudit(action, userId).catch(err => {
            console.error('Error in audit middleware:', err);
          });
        }
      }
      
      // Call the original end method
      return originalEnd.call(this, chunk, encoding, cb);
    };
    
    next();
  };
} 