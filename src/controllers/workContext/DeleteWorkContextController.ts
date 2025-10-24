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

      // Check if there are linked projects
      if (workContextExists.projects.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete this work context because there are projects linked to it",
          projectsCount: workContextExists.projects.length 
        });
      }

      // Delete WorkContext
      await prisma.workContext.delete({
        where: { id },
      });

      return res.json({ 
        message: "Work context deleted successfully" 
      });
    } catch (error: any) {
      console.error("Error deleting WorkContext:", error);
      
      return res.status(500).json({ 
        error: "Error deleting work context" 
      });
    }
  }
}

