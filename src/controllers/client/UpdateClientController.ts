import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateClientController {
    async handle(req: Request, res: Response) {
        try {
            const clientId = req.params.id; // Assumindo que o ID do cliente é passado como parâmetro na URL
            const updatedData = req.body;

            const errors: string[] = [];
            const {
                name,
                email,
                document,
                phone,
                location,
                birth_date,
                lat,
                log,
                radius
            } = updatedData;

            if (!name) {
                errors.push("Name is required!");
            }
            if (!email) {
                errors.push("Email is required!");
            }

            const existingClient = await prisma.client.findUnique({
                where: { id: clientId }
            });

            if (!existingClient) {
                return res.status(404).json({ error: "Client not found!" });
            }

            if (errors.length > 0) {
                return res.status(400).json({ errors });
            }

            const result = await prisma.client.update({
                where: { id: clientId },
                data: {
                    name,
                    email,
                    document,
                    phone,
                    location,
                    birth_date,
                    lat,
                    log,
                    radius: Math.ceil(Number(radius))
                },
            });

            return res.json(result);

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal error" });
        }
    }
}
