import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface FindAllSubcontractorsRequest {
  company_id: string;
  search?: string;
  skip?: number;
  take?: number;
  view?: "summary" | string;
}

export class FindAllSubcontractorsController {
  async handle(req: Request, res: Response) {
    try {
      const {
        company_id,
        search = "",
        skip = 0,
        take = 1000,
        view,
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

      const safeSkip = Math.max(Number(skip) || 0, 0);
      const safeTake = Math.min(Math.max(Number(take) || (view === "summary" ? 20 : 1000), 1), view === "summary" ? 50 : 1000);

      if (view === "options") {
        const subcontractors = await prisma.subcontractor.findMany({
          where: whereClause,
          skip: safeSkip,
          take: safeTake,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            date_creation: true,
          },
          orderBy: [{ date_creation: "desc" }, { id: "desc" }],
        });

        return res.status(200).json({ subcontractors });
      }

      if (view === "summary") {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const [subcontractors, total, totalCurrentMonth] = await prisma.$transaction([
          prisma.subcontractor.findMany({
            where: whereClause,
            skip: safeSkip,
            take: safeTake,
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              date_creation: true,
            },
            orderBy: [{ date_creation: "desc" }, { id: "desc" }],
          }),
          prisma.subcontractor.count({ where: whereClause }),
          prisma.subcontractor.count({
            where: {
              ...whereClause,
              date_creation: { gte: firstDayOfMonth },
            },
          }),
        ]);

        const subcontractorIds = subcontractors.map((subcontractor) => subcontractor.id);
        const workedHours = subcontractorIds.length > 0
          ? await prisma.workedhours.findMany({
              where: { subcontractor_id: { in: subcontractorIds } },
              select: {
                subcontractor_id: true,
                project_id: true,
                type_price: true,
                hourly_price: true,
                fixed_price: true,
              },
            })
          : [];

        const totalsBySubcontractor = new Map<string, { totalSpent: number; projectIds: Set<string> }>();
        workedHours.forEach((workedHour) => {
          if (!workedHour.subcontractor_id) return;
          const current = totalsBySubcontractor.get(workedHour.subcontractor_id) ?? {
            totalSpent: 0,
            projectIds: new Set<string>(),
          };
          current.totalSpent += workedHour.type_price === "fixed"
            ? Number(workedHour.fixed_price ?? 0)
            : Number(workedHour.hourly_price ?? 0);
          if (workedHour.project_id) current.projectIds.add(workedHour.project_id);
          totalsBySubcontractor.set(workedHour.subcontractor_id, current);
        });

        return res.status(200).json({
          subcontractors: subcontractors.map((subcontractor) => {
            const totals = totalsBySubcontractor.get(subcontractor.id);
            return {
              ...subcontractor,
              totalSpent: totals?.totalSpent ?? 0,
              projectsCount: totals?.projectIds.size ?? 0,
            };
          }),
          total,
          totalCurrentMonth,
          skip: safeSkip,
          take: safeTake,
          hasMore: safeSkip + subcontractors.length < total,
        });
      }

      // Get subcontractors with their worked hours
      const subcontractors = await prisma.subcontractor.findMany({
        where: whereClause,
        skip: safeSkip,
        take: safeTake,
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

      // Calculate totals for each subcontractor (type_price fixed → fixed_price; else hourly → hourly_price)
      const subcontractorsWithTotals = subcontractors.map(subcontractor => {
        const totalSpent = subcontractor.workedHours.reduce((acc, wh) => {
          const cost = (wh as any).type_price === "fixed"
            ? Number((wh as any).fixed_price ?? 0)
            : Number((wh as any).hourly_price ?? 0);
          return acc + cost;
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

