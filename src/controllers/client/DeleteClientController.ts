import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class DeleteClientController {
  async handle(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Client ID is required' });
      }

      // Check if client exists
      const client = await prisma.client.findUnique({
        where: { id },
        select: { id: true }
      });

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Perform deletion in a transaction
      await prisma.$transaction(async (tx) => {
        // Get all projects for this client
        const projects = await tx.project.findMany({
          where: { client_id: id },
          select: { id: true }
        });

        // For each project, delete related data
        for (const project of projects) {
          // Delete estimates
          await tx.estimate.deleteMany({
            where: { projectId: project.id }
          });

          // Delete invoice send history
          const invoices = await tx.invoice.findMany({
            where: { projectId: project.id },
            select: { id: true }
          });

          for (const invoice of invoices) {
            await tx.invoiceSendHistory.deleteMany({
              where: { invoiceId: invoice.id }
            });
          }

          // Delete invoices
          await tx.invoice.deleteMany({
            where: { projectId: project.id }
          });

          // Get service projects
          const serviceProjects = await tx.serviceProject.findMany({
            where: { projectId: project.id },
            select: { id: true }
          });

          for (const sp of serviceProjects) {
            // Get user service project IDs first
            const userServiceProjects = await tx.userServiceProject.findMany({
              where: { service_project_id: sp.id },
              select: { id: true }
            });

            // Delete user attendance records
            for (const usp of userServiceProjects) {
              await tx.userAttendance.deleteMany({
                where: { user_service_project_id: usp.id }
              });
            }

            // Delete timelines
            await tx.timeLine.deleteMany({
              where: { service_project_id: sp.id }
            });

            // Delete activities
            await tx.activities.deleteMany({
              where: { serviceProjectId: sp.id }
            });

            // Delete gallery before/after
            await tx.galleryBefore.deleteMany({
              where: { serviceProjectId: sp.id }
            });

            await tx.galleryAfter.deleteMany({
              where: { serviceProjectId: sp.id }
            });

            // Delete user service project associations
            await tx.userServiceProject.deleteMany({
              where: { service_project_id: sp.id }
            });
          }

          // Delete service projects
          await tx.serviceProject.deleteMany({
            where: { projectId: project.id }
          });

          // Delete PDF projects
          await tx.pdfProject.deleteMany({
            where: { project_id: project.id }
          });
        }

        // Delete all projects
        await tx.project.deleteMany({
          where: { client_id: id }
        });

        // Delete work contexts
        await tx.workContext.deleteMany({
          where: { clientId: id }
        });

        // Delete QuickBooks raw data
        await tx.quickBooksCustomerRaw.deleteMany({
          where: { clientId: id }
        });

        // Finally, delete the client
        await tx.client.delete({
          where: { id }
        });
      });

      // console.log(`[Delete Client] Client ${id} and all related data successfully deleted`);

      return res.json({
        success: true,
        message: 'Client and all related data deleted successfully'
      });
    } catch (error: any) {
      // console.error('[Delete Client] Error:', error);
      return res.status(500).json({
        error: 'Error deleting client',
        details: error.message
      });
    }
  }
}

