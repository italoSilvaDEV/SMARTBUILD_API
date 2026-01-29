import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface StartTutorialPayload {
    tutorialCode: string;
}

export class StartTutorialController {
    async handle(req: Request, res: Response) {
        const payload = req.body as StartTutorialPayload;
        const userId = req.headers["x-user-id"] as string;

        if (!userId) {
            return res.status(401).json({
                error: "User ID not found in request"
            });
        }

        if (!payload.tutorialCode) {
            return res.status(400).json({
                error: "Tutorial code is required"
            });
        }

        try {
            let progress = await prisma.tutorialProgress.findUnique({
                where: {
                    userId_tutorialCode: {
                        userId,
                        tutorialCode: payload.tutorialCode,
                    },
                },
            });

            if (!progress) {
                progress = await prisma.tutorialProgress.create({
                    data: {
                        userId,
                        tutorialCode: payload.tutorialCode,
                        completed: false,
                    },
                });
            }

            return res.status(200).json({
                message: "Tutorial started successfully",
                data: progress
            });
        } catch (error) {
            console.error("Error starting tutorial:", error);
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

