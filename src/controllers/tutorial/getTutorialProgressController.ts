import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetTutorialProgressController {
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
            const progress = await prisma.tutorialProgress.findUnique({
                where: {
                    userId_tutorialCode: {
                        userId,
                        tutorialCode,
                    },
                },
            });

            return res.status(200).json({
                message: "Tutorial progress fetched successfully",
                data: progress
            });
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

