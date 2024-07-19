import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateServiceController {
  async handle(request: Request, response: Response) {
    try {
      const { services } = request.body; // Recebe um array de serviços do corpo da requisição

      if (!services || !Array.isArray(services)) {
        return response.status(400).json({ message: "Invalid input format" });
      }

      const sub_category_id = services[0]?.sub_category_id;
      if (!sub_category_id) {
        return response.status(400).json({ message: "Subcategory ID is required" });
      }

      const subCategory = await prisma.subCategory.findFirst({
        where: {
          id: sub_category_id,
        },
      });

      if (!subCategory) {
        return response.status(404).json({ message: "Subcategory not found" });
      }

      // Pega os ids dos serviços existentes para a subcategoria
      const existingServices = await prisma.service.findMany({
        where: {
          sub_category_id,
        },
      });

      const existingServiceIds = existingServices.map((service) => service.id);

      // Processa cada serviço do corpo da requisição
      for (const serviceData of services) {
        const {
          service_id,
          service_name,
          type_variable,
          price_type,
          price_fixe,
          price_minimum,
          price_maximum,
        } = serviceData;

        if (!service_name || !type_variable || !price_type) {
          throw new Error("Service name, variable type, and price type are required");
        }

        if (price_type === "FIXE" && (price_fixe === undefined || price_fixe <= 0)) {
          throw new Error("Fixed price must be greater than 0");
        }

        if (price_type === "VARIABLE" && (price_maximum <= price_minimum)) {
          throw new Error("The maximum price must be greater than the minimum price");
        }

        if (service_id && existingServiceIds.includes(service_id)) {
          // Atualiza o serviço existente
          await prisma.service.update({
            where: {
              id: service_id,
            },
            data: {
              service_name,
              type_variable,
              price_type,
              price_fixe,
              price_minimum,
              price_maximum,
              sub_category_id,
            },
          });
        } else {
          // Cria um novo serviço
          await prisma.service.create({
            data: {
              service_name,
              type_variable,
              price_type,
              price_fixe,
              price_minimum,
              price_maximum,
              sub_category_id,
            },
          });
        }
      }

      // Exclui serviços que não estão no array do corpo da requisição
      const incomingServiceIds = services.map((service) => service.service_id);
      const servicesToDelete = existingServiceIds.filter(
        (id) => !incomingServiceIds.includes(id)
      );

      for (const serviceId of servicesToDelete) {
        await prisma.service.delete({
          where: {
            id: serviceId,
          },
        });
      }

      return response.status(200).json({ message: "Services updated successfully" });
    } catch (error) {
      if (error instanceof Error) {
        return response.status(400).json({ error: error.message });
      }
      return response.status(500).json({ error: "Internal server error" });
    }
  }
}
