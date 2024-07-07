import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class DeleteWorkedHoursController {
  async handle(request: Request, response: Response) {
    try {
      const { 
        id 
      } = request.params;

      const workedHour = await prisma.workedhours.findUnique({
        where: { id },
      });

      if (!workedHour) {
        return response.status(400).json({ error: "Worked hour record not found!" });
      }

      await prisma.workedhours.delete({
        where: {
          id: id,
        },
      });

      return response.json({ message: "Worked hour record deleted successfully" });
    } catch (error) {
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Internal error" });
    }
  }
}
