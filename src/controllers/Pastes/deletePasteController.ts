import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class DeletePasteController {
    async handle(req: Request, res: Response) {
        const { 
            id 
        } = req.params;

        if (!id) {
            return res.status(400).json({
                error: "Id is required"
            });
        }

        try {
            const paste = await prisma.projectPastes.findUnique({
                where: {
                    id
                }
            })

            if (!paste) {
                return res.status(404).json({
                    error: "Paste not found"
                })
            }

            await prisma.projectPastes.delete({
                where: {
                    id
                }
            })

            return res.status(200).json({
                success: true,
                message: "Paste deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}   