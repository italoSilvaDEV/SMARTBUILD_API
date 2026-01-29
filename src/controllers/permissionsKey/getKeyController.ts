import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetKeyController {
    async handle(req: Request, res: Response) {
        const { keyId } = req.params;

        try {
            const keyRecord = await prisma.permissionsKeys.findUnique({
                where: { id: keyId },
                select: {
                    key: true,
                    status: true,
                    permissionUserKey: {
                        select: {
                            name: true,
                            email: true
                        }
                    }
                }
            });

            if (!keyRecord) {
                return res.status(404).json({
                    error: "Key not found"
                });
            }

            if (keyRecord.status !== "approved") {
                return res.status(403).json({
                    error: "Key is not approved yet or has been revoked"
                });
            }

            return res.json({
                success: true,
                data: {
                    key: keyRecord.key,
                    name: keyRecord.permissionUserKey.name,
                    email: keyRecord.permissionUserKey.email
                }
            });

        } catch (error) {
            console.error("Error fetching key:", error);
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}

