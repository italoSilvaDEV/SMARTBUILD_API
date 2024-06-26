import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";


export class DeleteServiceController {

    async handle(request: Request, response: Response) {
        try {
            const { service_id } = request.body;

            const service = await prisma.service.findFirst({
                where: {
                    id: service_id
                }
            });

            if (!service) {
                throw new Error("Service not found!");
            }

            await prisma.service.delete({
                where: {
                    id: service_id
                }
            });

            return response.json();
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
