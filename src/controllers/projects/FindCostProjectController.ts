import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindCostProjectController {
    async handle(request: Request, response: Response) {
        try {
            const { material_name, pag } = request.body; 

            const filtro: any = { invoiceCostProject: { project_id: { not: null }, project: { company_id: request.body.company_id } } };
            if (material_name) {
                filtro.material_name = { contains: material_name };
            }

            const pageNumber = Number(pag) || 0;

            const result = await prisma.costProject.findMany({
                where: filtro,
                select: {
                    id: true,
                    material_name: true,
                    transaction_type: true,
                    price: true,
                    amout: true,
                    ServiceProject: true,
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
