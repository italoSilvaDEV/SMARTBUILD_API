import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class DeleteWorkContextController {
  async handle(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "Work context ID is required" });
      }

      // Check if WorkContext exists
      const workContextExists = await prisma.workContext.findUnique({
        where: { id },
        include: {
          projects: {
            select: { id: true },
          },
        },
      });

      if (!workContextExists) {
        return res.status(404).json({ error: "Work context not found" });
      }

      // Check if client has only one work context
      const clientWorkContextsCount = await prisma.workContext.count({
        where: { clientId: workContextExists.clientId },
      });

      if (clientWorkContextsCount <= 1) {
        return res.status(400).json({ 
          error: "Cannot delete the last work context. Every client must have at least one work context." 
        });
      }

      // If there are linked projects, remove the work context reference from them
      // This makes them "orphan" projects that can be linked to another work context later
      if (workContextExists.projects.length > 0) {
        
        await prisma.project.updateMany({
          where: { workContextId: id },
          data: { workContextId: null }
        });
        
      }

      // Delete WorkContext
      await prisma.workContext.delete({
        where: { id },
      });


      return res.json({ 
        message: "Work context deleted successfully",
        orphanedProjects: workContextExists.projects.length
      });
    } catch (error: any) {
      
      return res.status(500).json({ 
        error: "Error deleting work context" 
      });
    }
  }
}

