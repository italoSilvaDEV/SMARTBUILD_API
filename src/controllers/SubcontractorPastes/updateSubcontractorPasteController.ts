import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateSubcontractorPasteController {
    async handle(req: Request, res: Response) {
        const {
            id,
            name
        } = req.body

        if (!id || !name) {
            return res.status(400).json({
                error: "Id and name are required"
            })
        }

        try {
            const paste = await prisma.subcontractorPastes.update({
                where: {
                    id
                },
                data: {
                    name
                }
            })

            return res.status(200).json({
                success: true,
                message: "Paste updated successfully",
                data: paste
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
