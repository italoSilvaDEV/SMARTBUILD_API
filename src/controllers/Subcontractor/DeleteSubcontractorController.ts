import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class DeleteSubcontractorController {
  async handle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { company_id } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Subcontractor ID is required!" });
      }

      if (!company_id) {
        return res.status(400).json({ error: "Company ID is required!" });
      }

      // Check if subcontractor exists and belongs to the company
      const subcontractor = await prisma.subcontractor.findFirst({
        where: {
          id: id,
          company_id: company_id
        },
        include: {
          workedHours: true
        }
      });

      if (!subcontractor) {
        return res.status(404).json({ 
          error: "Subcontractor not found or does not belong to your company!" 
        });
      }

      // Check if subcontractor has worked hours entries
      if (subcontractor.workedHours && subcontractor.workedHours.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete subcontractor with existing work entries. Please remove all work entries first." 
        });
      }

      await prisma.subcontractor.delete({
        where: { id: id }
      });

      return res.status(200).json({ 
        message: "Subcontractor deleted successfully!" 
      });

    } catch (error) {
      console.error("Error deleting subcontractor:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal error" });
    }
  }
}

