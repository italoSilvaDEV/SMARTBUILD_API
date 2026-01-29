import { prisma } from '../utils/prisma';

/**
 * Logs an audit event to the database
 * 
 * @param action - Description of the action being performed
 * @param userId - ID of the user performing the action
 * @returns The created audit record or null if there was an error
 */
export async function logAudit(action: string, userId: string): Promise<any> {
  try {
    if (!action || !userId) {
      // console.error('Audit logging failed: action and userId are required');
      return null;
    }

    const audit = await prisma.audit.create({
      data: {
        action,
        userId
      }
    });

    return audit;
  } catch (error) {
    // console.error('Error logging audit event:', error);
    return null;
  }
} 