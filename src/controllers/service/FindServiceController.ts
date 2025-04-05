import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindServiceController {

    async handle(request: Request, response: Response) {
        try {
            const { sub_category_id } = request.body;

            if (!sub_category_id) {
                throw new Error("Sub category ID is required!");
            }

            const services = await prisma.service.findMany({
                where: {
                    sub_category_id: sub_category_id
                },
                select: {
                    service_name: true,
                    type_variable: true,
                    price_type: true,
                    price_fixe: true,
                    price_minimum: true,
                    price_maximum: true
                }
            });

            return response.json(services);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }

    async getServicesByCompany(req: Request, res: Response) {
        try {
            const { companyId } = req.params;
            
            // Verificar se a empresa existe
            const company = await prisma.company.findUnique({
                where: { id: companyId }
            });
            
            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }
            
            // Buscar todos os serviços da empresa
            const services = await prisma.service.findMany({
                where: { company_id: companyId },
                include: {
                    service: {
                        include: {
                            subcategory: true
                        }
                    }
                },
                orderBy: {
                    service_name: 'asc'
                }
            });
            
            return res.json(services);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Failed to fetch services" });
        }
    }
}

