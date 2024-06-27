import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { decodeToken } from "../../config/decodeToken";

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
            } = request.body;

            const subCategory = await prisma.subCategory.findFirst({
                where: {
                    id: sub_category_id
                }
            });

            if (!subCategory) {
                throw new Error("subCategory not found!");
            }
            if (!service_name) {
                throw new Error("Service field is required!");
            }
            if (!type_variable) {
                throw new Error("Variable type is required");
            }
            if (!price_type) {
                throw new Error("Price type is required");
            }

            if (price_type === "FIXE") {
                if (!price_type) {
                    throw new Error("Price type is required");
                }
                if (price_fixe <= 0) {
                    throw new Error("Fixed price field is required");
                }
                await prisma.service.create({
                    data: {
                        service_name,
                        type_variable,
                        price_type,
                        price_fixe,
                        sub_category_id
                    },
                });
            } else if (price_type === "VARIABLE") {
              if(price_maximum<=price_minimum){
                throw new Error("the maximum price must be greater than the minimum price");
              }
                await prisma.service.create({
                    data: {
                        service_name,
                        type_variable,
                        price_type,
                        price_minimum,
                        price_maximum,
                        sub_category_id
                    },
                });
            }

            return response.json();
        } catch (error) {
           // console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
