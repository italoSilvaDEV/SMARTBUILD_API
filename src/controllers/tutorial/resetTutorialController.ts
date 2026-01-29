import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ResetTutorialController {
    async handle(req: Request, res: Response) {
        const { tutorialCode } = req.params;
        const userId = req.headers["x-user-id"] as string;

        if (!userId) {
            return res.status(401).json({
                error: "User ID not found in request"
            });
        }

        if (!tutorialCode) {
            return res.status(400).json({
                error: "Tutorial code is required"
            });
        }

        try {
            const existing = await prisma.tutorialProgress.findUnique({
                where: {
                    userId_tutorialCode: {
                        userId,
                        tutorialCode,
                    },
                },
            });

            if (!existing) {
                return res.status(404).json({
                    error: "Tutorial not found"
                });
            }

            await prisma.tutorialProgress.delete({
                where: {
                    userId_tutorialCode: {
                        userId,
                        tutorialCode,
                    },
                },
            });

            return res.status(200).json({
                message: "Tutorial reset successfully"
            });
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

