import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateClientController {
    async handle(req: Request, res: Response) {
        try {
            let client = req.body;

            const errors: string[] = [];
            const {
                name,
                email,
                document,
                phone,
                location,
                birth_date,
                lat,
                log
            } = client;

            if (!name) {
                errors.push("Name is required!");
            }
            if (!email) {
                errors.push("Email is required!");
            }

            const existingClient = await prisma.client.findUnique({
                where: { email: email }
            });

            if (existingClient) {
                errors.push(`Client with email ${email} already exists!`);
            }

            if (errors.length > 0) {
                return res.status(400).json({ errors });
            }
            const result = await prisma.client.create({
                data: {
                    name,
                    email,
                    document,
                    phone,
                    location,
                    birth_date,
                    lat,
                    log
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
