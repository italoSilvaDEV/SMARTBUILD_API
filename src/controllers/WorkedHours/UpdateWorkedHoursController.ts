import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateWorkedHoursController {
  async handle(request: Request, response: Response) {
    const {
      id,
      project_id,
      name_user,
      amount_of_hours,
      hourly_price,
    } = request.body;

    // Função de validação
    function validateWorkedHoursData(data: any): string | null {
      if (!data.id) return "ID is required";
      if (!data.name_user) return "Name user is required";
      if (!data.amount_of_hours) return "Amount of hours is required";
      if (!data.hourly_price) return "Hourly price is required";
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
          project_id,
          name_user,
          amount_of_hours: parseFloat(amount_of_hours),
          hourly_price,
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
