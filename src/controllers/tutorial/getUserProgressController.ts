import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetUserProgressController {
    async handle(req: Request, res: Response) {
        const userId = req.headers["x-user-id"] as string;

        if (!userId) {
            return res.status(401).json({
                error: "User ID not found in request"
            });
        }

        try {
            const progress = await prisma.tutorialProgress.findMany({
                where: { userId },
                orderBy: {
                    updatedAt: "desc",
                },
            });

            return res.status(200).json({
                message: "User progress fetched successfully",
                data: progress
            });
        } catch (error) {
            console.error("Error fetching user progress:", error);
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

