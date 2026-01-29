import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetModuleProgressController {
    async handle(req: Request, res: Response) {
        const { modulePrefix } = req.params;
        const userId = req.headers["x-user-id"] as string;

        if (!userId) {
            return res.status(401).json({
                error: "User ID not found in request"
            });
        }

        if (!modulePrefix) {
            return res.status(400).json({
                error: "Module prefix is required"
            });
        }

        try {
            const submodules = await prisma.tutorialProgress.findMany({
                where: {
                    userId,
                    tutorialCode: {
                        startsWith: modulePrefix,
                    },
                },
                orderBy: {
                    tutorialCode: "asc",
                },
            });

            const totalSubmodules = submodules.length;
            const completedSubmodules = submodules.filter((s) => s.completed).length;
            const allCompleted = totalSubmodules > 0 && completedSubmodules === totalSubmodules;

            const moduleProgress = {
                moduleCode: modulePrefix,
                totalSubmodules,
                completedSubmodules,
                allCompleted,
                submodules: submodules.map((s) => ({
                    code: s.tutorialCode,
                    completed: s.completed,
                    completedAt: s.completedAt,
                    createdAt: s.createdAt,
                })),
            };

            return res.status(200).json({
                message: "Module progress fetched successfully",
                data: moduleProgress
            });
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

