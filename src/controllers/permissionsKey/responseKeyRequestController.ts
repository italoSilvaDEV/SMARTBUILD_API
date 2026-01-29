import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";
import { permissionKeyResponseEmail } from "../../templateEmail/permissionKeyResponse";

export class ResponseKeyRequestController {
    async handle(req: Request, res: Response) {
        const { keyId } = req.params;
        const { secret } = req.query;
        const approve = req.path.includes('approve');

        try {
            if (!secret || secret !== process.env.KEY_RESPONSE_EMAIL) {
                return res.status(401).send(
                    '<h1>Access Denied</h1><p>Invalid security token.</p>'
                );
            }

            const keyRequest = await prisma.permissionsKeys.findUnique({
                where: { id: keyId },
                include: { permissionUserKey: true }
            });

            if (!keyRequest) {
                return res.status(404).send('<h1>Error</h1><p>Key request not found.</p>');
            }

            if (keyRequest.status !== "pending") {
                return res.status(400).send(`<h1>Error</h1><p>Key is already ${keyRequest.status}.</p>`);
            }

            const user = keyRequest.permissionUserKey;

            if (approve) {
                await prisma.permissionsKeys.update({
                    where: { id: keyId },
                    data: {
                        status: "approved",
                        date_approved: new Date()
                    }
                });
            } else {
                await prisma.permissionsKeys.delete({
                    where: { id: keyId }
                });
            }

            // Notificação por E-mail para o usuário solicitante
            if (user.email) {
                try {
                    await sendEmail({
                        to: user.email,
                        subject: approve ? "Permission Granted: Your Master Key is ready" : "Update on your Permission Key Request",
                        html: permissionKeyResponseEmail(user.name, approve, keyId),
                    });
                } catch (e) {
                    console.error("❌ Email notification failed:", e);
                }
            }

            // Retorno HTML para quem clicou no e-mail
            return res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: ${approve ? '#1E9B5C' : '#D92D20'};">
                        ${approve ? 'Key Approved!' : 'Request Rejected'}
                    </h1>
                    <p>${approve
                    ? 'The permission key is now active and the requester has been notified.'
                    : 'The permission key request has been rejected and deleted.'}</p>
                </div>
            `);

        } catch (error: any) {
            console.error("❌ Error processing decision:", error);
            return res.status(500).send(`<h1>Error</h1><p>Internal server error</p>`);
        }
    }
}
