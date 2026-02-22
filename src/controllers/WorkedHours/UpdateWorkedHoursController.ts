import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateWorkedHoursController {
  async handle(request: Request, response: Response) {
    const {
      id,
      name_user,
      amount_of_hours,
      hourly_price,
      fixed_price,
      type_price,
      start_date,
      end_date,
      description,
      payment_date,
      subcontractor_id,
      subcontractor_service_project_id,
      sub_services_project_id,
      custom_service_schedule_id,
    } = request.body; 

    // Função de validação
    function validateWorkedHoursData(data: any): string | null {
      if (!data.id) return "You cannot change the data coming from the worker's APP!";
      if (!data.name_user) return "Name user is required";
      
      const type = data.type_price || "hourly";
      if (type === "hourly") {
        if (!data.hourly_price) return "Hourly price is required for hourly type";
        if (!data.amount_of_hours && data.amount_of_hours !== null) return "Amount of hours is required";
      } else if (type === "fixed") {
        if (!data.fixed_price) return "Fixed price is required for fixed type";
      }

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

      // Preparar dados base para atualização
      const updateData: any = {
        name_user,
        type_price,
        amount_of_hours: amount_of_hours ? parseFloat(amount_of_hours) : null,
        hourly_price: type_price === "hourly" ? hourly_price : null,
        fixed_price: type_price === "fixed" ? fixed_price : null,
        start_date,
        end_date,
        description: description?.trim() || null,
        payment_date: payment_date ? new Date(payment_date).toISOString() : null,
      };

      if (subcontractor_id) {
        updateData.subcontractor = { connect: { id: subcontractor_id } };
      } else if (subcontractor_id === null || subcontractor_id === "") {
        updateData.subcontractor = { disconnect: true };
      }

      if (subcontractor_service_project_id) {
        updateData.subcontractor_service_project = { connect: { id: subcontractor_service_project_id } };
      } else if (subcontractor_service_project_id === null || subcontractor_service_project_id === "") {
        updateData.subcontractor_service_project = { disconnect: true };
      }

      if (sub_services_project_id) {
        updateData.sub_services_project = { connect: { id: sub_services_project_id } };
      } else if (sub_services_project_id === null || sub_services_project_id === "") {
        updateData.sub_services_project = { disconnect: true };
      }

      if (custom_service_schedule_id) {
        updateData.custom_service_schedule = { connect: { id: custom_service_schedule_id } };
      } else if (custom_service_schedule_id === null || custom_service_schedule_id === "") {
        updateData.custom_service_schedule = { disconnect: true };
      }

      await prisma.workedhours.update({
        where: { id },
        data: updateData,
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
