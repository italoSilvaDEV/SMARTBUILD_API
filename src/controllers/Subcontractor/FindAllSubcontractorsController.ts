import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface FindAllSubcontractorsRequest {
  company_id: string;
  search?: string;
  skip?: number;
  take?: number;
}

export class FindAllSubcontractorsController {
  async handle(req: Request, res: Response) {
    try {
      const {
        company_id,
        search = "",
        skip = 0,
        take = 1000
      } = req.body as FindAllSubcontractorsRequest;

      if (!company_id) {
        return res.status(400).json({ error: "Company ID is required!" });
      }

      const whereClause: any = {
        company_id: company_id,
      };

      if (search && search.trim() !== "") {
        whereClause.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } }
        ];
      }

      // Get subcontractors with their worked hours
      const subcontractors = await prisma.subcontractor.findMany({
        where: whereClause,
        skip: Number(skip),
        take: Number(take),
        include: {
          workedHours: {
            include: {
              project: true
            }
          }
        },
        orderBy: {
          date_creation: 'desc'
        }
      });

      // Calculate totals for each subcontractor
      const subcontractorsWithTotals = subcontractors.map(subcontractor => {
        // Calculate total spent with this subcontractor
        const totalSpent = subcontractor.workedHours.reduce((acc, wh) => {
          return acc + Number(wh.hourly_price || 0);
        }, 0);

        // Get unique projects this subcontractor worked on
        const uniqueProjectIds = new Set(
          subcontractor.workedHours
            .filter(wh => wh.project_id)
            .map(wh => wh.project_id)
        );
        const projectsCount = uniqueProjectIds.size;

        return {
          id: subcontractor.id,
          name: subcontractor.name,
          email: subcontractor.email,
          phone: subcontractor.phone,
          address: subcontractor.address,
          date_creation: subcontractor.date_creation,
          totalSpent: totalSpent,
          projectsCount: projectsCount
        };
      });

      const total = await prisma.subcontractor.count({
        where: whereClause
      });

      // Get subcontractors created this month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const totalCurrentMonth = await prisma.subcontractor.count({
        where: {
          ...whereClause,
          date_creation: {
            gte: firstDayOfMonth
          }
        }
      });

      return res.status(200).json({
        subcontractors: subcontractorsWithTotals,
        total,
        totalCurrentMonth
      });

    } catch (error) {
      console.error("Error finding subcontractors:", error);
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal error" });
    }
  }
}

