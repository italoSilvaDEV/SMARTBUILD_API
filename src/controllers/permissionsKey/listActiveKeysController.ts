import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ListActiveKeysController {
    async handle(req: Request, res: Response) {
        try {
            const activeKeys = await prisma.permissionsKeys.findMany({
                where: {
                    status: {
                        in: ["pending", "approved"]
                    }
                },
                select: {
                    id: true,
                    status: true,
                    permissionUserKey: {
                        select: {
                            name: true
                        }
                    }
                }
            });

            const formattedKeys = activeKeys.map(item => ({
                name: item.permissionUserKey.name,
                status: item.status,
                id: item.id
            }));

            return res.json(formattedKeys);
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

