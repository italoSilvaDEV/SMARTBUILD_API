import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindCostProjectController {
    async handle(request: Request, response: Response) {
        try {
            const { material_name, pag } = request.body;

            const filtro: any = {};
            if (material_name) {
                filtro.material_name = { contains: material_name };
            }

            const pageNumber = Number(pag) || 0;

            const result = await prisma.costProject.findMany({
                where: filtro,
                select: {
                    id: true,
                    material_name: true,
                    price: true,
                    amout: true,
                    service: {
                        select: {
                            service_name: true,
                        }
                    },
                    user: {
                        select: {
                            name: true
                        }
                    },
                    invoiceCostProject:{
                        select:{
                            uri: true
                        }
                    }
                },
                skip: pageNumber * 20,
                take: 20,
                orderBy: {
                    material_name: "asc"
                },
            });

            const total = await prisma.costProject.count({
                where: filtro
            });

            return response.json({ total, result });
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
