import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetClientController {
    async handle(req: Request, res: Response) {
        const {
            id,
        } = req.params;

        if (!id) {
            return res.status(400).json({
                error: "Client ID is required"
            })
        }

        const client = await prisma.client.findUnique({
            where: {
                id
            },
            select: {
                id: true,
                avatar: true,
                name: true,
                email: true,
                phone: true,
            }
        })

        if (!client) {
            return res.status(404).json({
                error: "Client not found"
            })
        }

        try {
            const avatarUrl = client.avatar ? await getPresignedUrl(client.avatar) : null;

            return res.status(200).json({
                client: {
                    ...client,
                    avatar: avatarUrl
                }
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while fetching client"
            })
        }
    }
}