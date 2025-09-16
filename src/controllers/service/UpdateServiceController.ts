import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface ServiceData {
  service_id: string;
  service_name?: string;
  type_variable?: string;
  price_type?: string;
  price_fixe?: number;
  price_minimum?: number;
  price_maximum?: number;
  description?: string;
}

export class UpdateServiceController {
  async handle(request: Request, response: Response) {
    const data = request.body as ServiceData

    if (!data.service_id) {
      return response.status(400).json({
        error: "Service ID is required"
      })
    }

    const service = await prisma.service.findUnique({
      where: {
        id: data.service_id
      }
    })

    if (!service) {
      return response.status(400).json({
        error: "Service not found"
      })
    }

    try {
      let newData = {} as ServiceData

      if (data.service_name) {
        newData.service_name = data.service_name
      }
      if (data.type_variable) {
        newData.type_variable = data.type_variable
      }
      if (data.price_type) {
        newData.price_type = data.price_type
      }
      if (data.price_fixe) {
        newData.price_fixe = data.price_fixe
      }
      if (data.price_minimum) {
        newData.price_minimum = data.price_minimum
      }
      if (data.price_maximum) {
        newData.price_maximum = data.price_maximum
      }
      if (data.description) {
        newData.description = data.description
      }

      const updatedService = await prisma.service.update({
        where: {
          id: data.service_id
        },
        data: newData
      })

      return response.status(200).json({
        message: "Service updated successfully",
        data: updatedService
      })
    } catch (error) {
      if (error instanceof Error) {
        return response.status(400).json({ error: error.message });
      }
      return response.status(500).json({ error: "Internal server error" });
    }
  }
}
