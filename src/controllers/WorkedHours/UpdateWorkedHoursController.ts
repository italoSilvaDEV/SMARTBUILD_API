import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateWorkedHoursController {
  async handle(request: Request, response: Response) {
    const {
      id,
      name_user,
      amount_of_hours,
      hourly_price,
      start_date,
      end_date,
    } = request.body;

    // Função de validação
    function validateWorkedHoursData(data: any): string | null {
      if (!data.id) return "You cannot change the data coming from the worker's APP!";
      if (!data.name_user) return "Name user is required";
      if (!data.amount_of_hours && data.amount_of_hours !== null) return "Amount of hours is required";
      if (!data.hourly_price) return "Hourly price is required";
      if (data.start_date && data.end_date) {
        const startDate = new Date(data.start_date);
        const endDate = new Date(data.end_date);
        if (endDate < startDate) return "End date cannot be earlier than start date";
      }
      return null;
    }

    const validationError = validateWorkedHoursData(request.body);
    if (validationError) {
      return response.status(400).json({ error: validationError });
    }

    try {
      const workedHours = await prisma.workedhours.findUnique({
        where: { id }
      });

      if (!workedHours) {
        return response.status(404).json({ error: "Worked hours record not found!" });
      }

      await prisma.workedhours.update({
        where: { id },
        data: {
          name_user,
          amount_of_hours: parseFloat(amount_of_hours) || null,
          hourly_price,
          start_date,
          end_date,
        }
      });

      return response.json({ message: "Worked hours record updated successfully" });
    } catch (error: any) {
      if (error instanceof Error) {
        return response.status(500).json({ error: error.message });
      }
      return response.status(500).json({ error: "Internal error" });
    }
  }
}
