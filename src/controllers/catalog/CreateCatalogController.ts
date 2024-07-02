import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateCatalogController {
    constructor() {
        this.handle = this.handle.bind(this);
    }

    async handle(request: Request, response: Response) {
        try {
            const { catalog_name } = request.body;

            if (!catalog_name) {
                throw new Error("Category name is required!");
            }

            const category = await prisma.catalog.findFirst({
                where: {
                    catalog_name: catalog_name,
                }
            });

            if (category) {
                throw new Error("This category has already been registered!");
            }

            const result = await prisma.catalog.create({
                data: {
                    catalog_name,
                },
            });

            return response.json(result.id);

        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal server error" });
        }
    }
}
