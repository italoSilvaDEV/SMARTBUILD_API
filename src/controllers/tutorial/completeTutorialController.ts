import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface CompleteTutorialPayload {
    tutorialCode: string;
}

export class CompleteTutorialController {
    async handle(req: Request, res: Response) {
        const payload = req.body as CompleteTutorialPayload;
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
            const existing = await prisma.tutorialProgress.findUnique({
                where: {
                    userId_tutorialCode: {
                        userId,
                        tutorialCode: payload.tutorialCode,
                    },
                },
            });

            if (!existing) {
                return res.status(404).json({
                    error: "Tutorial not started yet"
                });
            }

            const progress = await prisma.tutorialProgress.update({
                where: {
                    userId_tutorialCode: {
                        userId,
                        tutorialCode: payload.tutorialCode,
                    },
                },
                data: {
                    completed: true,
                    completedAt: new Date(),
                },
            });

            return res.status(200).json({
                message: "Tutorial completed successfully",
                data: progress
            });
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

