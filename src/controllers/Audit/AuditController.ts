import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class AuditController {
  async create(req: Request, res: Response) {
    try {
      const { action, userId } = req.body;

      // Validate required fields
      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Check if user exists
      const userExists = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!userExists) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Create audit record
      const audit = await prisma.audit.create({
        data: {
          action,
          userId
        }
      });

      return res.status(201).json(audit);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async findByUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const audits = await prisma.audit.findMany({
        where: { userId },
        orderBy: { date_creation: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return res.status(200).json(audits);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async findAll(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const skip = (Number(page) - 1) * Number(limit);
      
      const audits = await prisma.audit.findMany({
        skip,
        take: Number(limit),
        orderBy: { date_creation: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      const total = await prisma.audit.count();

      return res.status(200).json({
        data: audits,
        meta: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
} 