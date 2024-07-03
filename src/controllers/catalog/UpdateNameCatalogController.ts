import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateNameCatalogControlller {

async handle(request: Request, response: Response) {
    const {
        id,
        catalog_name,
    } = request.body;

    // Função de validação
    function validateUserData(data: any): string | null {
        if (!data.catalog_name) return "Name is required";
        if (!data.id) return "id is required";
        return null;
    }

    const validationError = validateUserData(request.body);
    if (validationError) {
        return response.status(400).json({ error: validationError });
    }

    try {
        const catalog = await prisma.catalog.findUnique({
            where: { id }
        });

        if (!catalog) {
            return response.status(404).json({ error: "Catalog not found!" });
        }

       
            await prisma.catalog.update({
                where: { id },
                data: {
                    catalog_name,
                }
            });
        

        return response.json({ message: "User updated successfully" });
    } catch (error: any) {
        if (error instanceof Error) {
            return response.status(500).json({ error: error.message });
        }
        return response.status(500).json({ error: "Internal error" });
    }
}
}