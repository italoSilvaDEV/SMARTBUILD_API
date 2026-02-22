import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CreateWorkedHoursRequest {
  project_id: string;
  name_user: string;
  amount_of_hours?: string;
  hourly_price?: number;
  fixed_price?: number;
  type_price?: "hourly" | "fixed";
  start_date?: string;
  end_date?: string;
  subcontractor_id?: string;
  description?: string;
  payment_date?: string;
  subcontractor_service_project_id?: string;
  sub_services_project_id?: string;
  custom_service_schedule_id?: string;
}

export class CreateWorkedHoursController {
  async handle(req: Request, res: Response) {
    try {
      const {
        project_id,
        name_user,
        amount_of_hours,
        hourly_price,
        fixed_price,
        type_price,
        start_date,
        end_date,
        subcontractor_id,
        description,
        payment_date,
        subcontractor_service_project_id,
        sub_services_project_id,
        custom_service_schedule_id,
      } = req.body as CreateWorkedHoursRequest;

      const error: string[] = [];

      if (!name_user || typeof name_user !== 'string' || name_user.trim() === '') {
        error.push("Name user is required and must not be empty!");
      }

      if (type_price === "hourly") {
        if (amount_of_hours !== undefined && parseFloat(amount_of_hours) <= 0) {
          error.push("For hourly price, amount of hours must be greater than zero!");
        }
        if (hourly_price === undefined || hourly_price <= 0) {
          error.push("Hourly price is mandatory for hourly type and must be greater than zero!");
        }
      } else if (type_price === "fixed") {
        if (fixed_price === undefined || fixed_price <= 0) {
          error.push("Fixed price is mandatory for fixed type and must be greater than zero!");
        }
      }

      if (start_date && end_date) {
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (endDate < startDate) {
          error.push("End date must be greater than start date!");
        }
      }

      if (error.length > 0) {
        return res.status(400).json({ error }); 
      }

      const data: any = {
        name_user,
        type_price,
        hourly_price: type_price === "hourly" ? hourly_price : null,
        fixed_price: type_price === "fixed" ? fixed_price : null,
        amount_of_hours: amount_of_hours ? parseFloat(amount_of_hours) : null,
        start_date: start_date ? new Date(start_date).toISOString() : null,
        end_date: end_date ? new Date(end_date).toISOString() : null,
        description: description?.trim() || null,
        payment_date: payment_date ? new Date(payment_date).toISOString() : null,
        project: {
          connect: {
            id: project_id,
          },
        },
      };

      if (subcontractor_id) {
        data.subcontractor = {
          connect: { id: subcontractor_id },
        };
      }

      if (subcontractor_service_project_id) {
        data.subcontractor_service_project = {
          connect: { id: subcontractor_service_project_id },
        };
      }

      if (sub_services_project_id) {
        data.sub_services_project = {
          connect: { id: sub_services_project_id },
        };
      }

      if (custom_service_schedule_id) {
        data.custom_service_schedule = {
          connect: { id: custom_service_schedule_id },
        };
      }

      await prisma.workedhours.create({
        data,
      });

      return res.status(201).json({ message: "Worked hours record created successfully!" });

    } catch (error) {
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal error" });
    }
  }
}
