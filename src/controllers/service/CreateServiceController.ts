import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateServiceController {
    async handle(request: Request, response: Response) {
        try {
            const {
                sub_category_id,
                service_name,
                type_variable,
                price_type,
                price_fixe,
                price_minimum,
                price_maximum,
                company_id
            } = request.body;

            if (!service_name) {
                return response.status(400).json({ error: "Service field is required!" });
            }
            if (!type_variable) {
                return response.status(400).json({ error: "Variable type is required" });
            }
            if (!price_type) {
                return response.status(400).json({ error: "Price type is required" });
            }

            const subCategory = await prisma.subCategory.findFirst({
                where: { id: sub_category_id }
            });

            if (!subCategory) {
                return response.status(404).json({ error: "Subcategory not found!" });
            }

            if (String(price_type).toLocaleUpperCase() === "FIXE") {
                if (price_fixe <= 0) {
                    return response.status(400).json({ error: "Fixed price must be greater than 0" });
                }
                await prisma.service.create({
                    data: {
                        service_name,
                        type_variable,
                        price_type,
                        price_fixe,
                        sub_category_id, 
                        company_id
                    },
                });
            } else if (String(price_type).toLocaleUpperCase() === "VARIABLE") {
                if (price_maximum <= price_minimum) {
                    return response.status(400).json({ error: "The maximum price must be greater than the minimum price" });
                }
                await prisma.service.create({
                    data: {
                        service_name,
                        type_variable,
                        price_type,
                        price_minimum,
                        price_maximum,
                        sub_category_id,
                        company_id
                    },
                });
            } else {
                return response.status(400).json({ error: "Invalid price type" });
            }

            return response.status(201).json({ error: "Service created successfully" });
        } catch (error) {
            if (error instanceof Error) {
                return response.status(500).json({ error: error.message });
            }
            return response.status(500).json({ error: "Internal server error" });
        }
    }
}
