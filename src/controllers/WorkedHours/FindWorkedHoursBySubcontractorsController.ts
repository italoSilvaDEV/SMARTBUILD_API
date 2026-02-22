import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export interface WorkedHourBySubcontractorRow {
  id: string;
  subcontractor_id: string | null;
  type_price: 'fixed' | 'hourly' | null;
  fixed_price: unknown;
  hourly_price: unknown;
  amount_of_hours: unknown;
  subcontractor: { id: string; name: string; email: string; phone: string | null } | null;
  subcontractor_service_project_id: string | null;
  sub_services_project_id: string | null;
  custom_service_schedule_id: string | null;
  subcontractor_service_project: {
    id: string;
    service_project: { id: string; name: string } | null;
    sub_service_project: { id: string; name: string } | null;
    custom_service_schedule: { id: string; name: string } | null;
  } | null;
  sub_services_project: { id: string; name: string } | null;
  custom_service_schedule: { id: string; name: string } | null;
}

/**
 * GET worked hours for the given subcontractor IDs (and company).
 * Used by Subcontractors export "Subcontractor x Services" to list services per subcontractor.
 */
export class FindWorkedHoursBySubcontractorsController {
  async handle(request: Request, response: Response) {
    try {
      const { subcontractor_ids, company_id } = request.body as {
        subcontractor_ids?: string[];
        company_id?: string;
      };

      if (!subcontractor_ids?.length || !company_id) {
        return response.status(400).json({
          error: "subcontractor_ids (array) and company_id are required",
        });
      }

      const result = await prisma.workedhours.findMany({
        where: {
          subcontractor_id: { in: subcontractor_ids },
          subcontractor: {
            company_id,
          },
        },
        select: {
          id: true,
          subcontractor_id: true,
          type_price: true,
          fixed_price: true,
          hourly_price: true,
          amount_of_hours: true,
          subcontractor: {
            select: { id: true, name: true, email: true, phone: true },
          },
          subcontractor_service_project_id: true,
          sub_services_project_id: true,
          custom_service_schedule_id: true,
          subcontractor_service_project: {
            select: {
              id: true,
              service_project: { select: { id: true, name: true } },
              sub_service_project: { select: { id: true, name: true } },
              custom_service_schedule: { select: { id: true, name: true } },
            },
          },
          sub_services_project: { select: { id: true, name: true } },
          custom_service_schedule: { select: { id: true, name: true } },
        },
        orderBy: [{ subcontractor_id: "asc" }, { date_creation: "desc" }],
      });

      return response.json({ result: result as WorkedHourBySubcontractorRow[] });
    } catch (error) {
      console.error("FindWorkedHoursBySubcontractorsController:", error);
      return response.status(500).json({ error: "Failed to fetch worked hours by subcontractors" });
    }
  }
}
