import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";
import { permissionKeyRevokeRequestEmail } from "../../templateEmail/permissionKeyRevokeRequest";

export class RevokeKeyController {
    async handle(req: Request, res: Response) {
        const { keyId } = req.params;

        try {
            const keyRequest = await prisma.permissionsKeys.findUnique({
                where: {
                    id: keyId
                },
                include: {
                    permissionUserKey: true
                }
            });

            if (!keyRequest) {
                return res.status(404).json({
                    error: "Key not found"
                });
            }

            if (keyRequest.status === "revoked") {
                return res.status(400).json({
                    error: "Key is already revoked"
                });
            }

            const user = keyRequest.permissionUserKey;

            if (user.email) {
                try {
                    await sendEmail({
                        to: user.email,
                        subject: "Security: Confirm your Permission Key Revocation",
                        html: permissionKeyRevokeRequestEmail(
                            user.name,
                            keyId,
                            process.env.KEY_RESPONSE_EMAIL || ""
                        ),
                    });

                } catch (e) {
                    return res.status(500).json({ error: "Failed to send confirmation email" });
                }
            }

            return res.json({
                success: true,
                message: "Revocation confirmation email sent to user."
            });

        } catch (error) {
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async confirm(req: Request, res: Response) {
        const { keyId } = req.params;
        const { secret } = req.query;

        try {
            if (!secret || secret !== process.env.KEY_RESPONSE_EMAIL) {
                return res.status(401).send('<h1>Access Denied</h1><p>Invalid security token.</p>');
            }

            const keyRequest = await prisma.permissionsKeys.findUnique({
                where: { id: keyId }
            });

            if (!keyRequest) {
                return res.status(404).send('<h1>Error</h1><p>Key not found.</p>');
            }

            if (keyRequest.status === "revoked") {
                return res.send(`
                    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #6B6B6B;">Already Revoked</h1>
                        <p>This key has already been revoked and is inactive.</p>
                    </div>
                `);
            }

            await prisma.permissionsKeys.update({
                where: { id: keyId },
                data: {
                    status: "revoked",
                    date_revoked: new Date()
                }
            });

            return res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #D92D20;">Key Revoked Successfully</h1>
                    <p>The permission key has been deactivated. It can no longer be used for administrative actions.</p>
                </div>
            `);

        } catch (error) {
            return res.status(500).send('<h1>Error</h1><p>Internal server error</p>');
        }
    }
}
