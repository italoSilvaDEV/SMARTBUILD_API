import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CreateWorkedHoursRequest {
  project_id: string;
  name_user: string;
  amount_of_hours?: string; // Opcional
  hourly_price: number; // Recebido como número do front-end
  start_date?: string; // Opcional
  end_date?: string; // Opcional
  subcontractor_id?: string; // Opcional
  description?: string; // Opcional
  payment_date?: string; // Opcional
}

export class CreateWorkedHoursController {
  async handle(req: Request, res: Response) {
    try {
      const {
        project_id,
        name_user,
        amount_of_hours,
        hourly_price,
        start_date,
        end_date,
        subcontractor_id,
        description,
        payment_date

      } = req.body as CreateWorkedHoursRequest;

      const error: string[] = [];

      if (!name_user || typeof name_user !== 'string' || name_user.trim() === '') {
        error.push("Name user is required and must not be empty!");
      }

      if (amount_of_hours !== undefined && parseFloat(amount_of_hours) <= 0) {
        error.push("If provided, amount of hours must be greater than zero!");
      }

      if (hourly_price === undefined || hourly_price <= 0) {
        error.push("Hourly price is mandatory and must be greater than zero!");
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
        hourly_price,
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
          connect: {
            id: subcontractor_id,
          },
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
