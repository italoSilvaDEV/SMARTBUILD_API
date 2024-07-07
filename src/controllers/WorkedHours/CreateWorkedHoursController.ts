import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CreateWorkedHoursRequest {
  project_id: string;
  name_user: string;
  amount_of_hours: string; // Recebido como string do front-end
  hourly_price: number; // Recebido como número do front-end
}

export class CreateWorkedHoursController {
  async handle(req: Request, res: Response) {
    try {
      const {
        project_id,
        name_user,
        amount_of_hours,
        hourly_price
      } = req.body as CreateWorkedHoursRequest;

      const errors: string[] = [];

      if (!name_user || typeof name_user !== 'string' || name_user.trim() === '') {
        errors.push("Name user is required and must not be empty!");
      }

      if (amount_of_hours === undefined || parseFloat(amount_of_hours) <= 0) {
        errors.push("Amount of hours is mandatory and must be greater than zero!");
      }

      if (hourly_price === undefined || hourly_price <= 0) {
        errors.push("Hourly price is mandatory and must be greater than zero!");
      }

      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      await prisma.workedhours.create({
        data: {
          project_id,
          name_user,
          amount_of_hours: parseFloat(amount_of_hours),
          hourly_price: hourly_price
        },
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
