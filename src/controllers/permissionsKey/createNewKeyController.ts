import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import { permissionKeyApprovalEmail } from "../../templateEmail/permissionKeyApproval";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

interface CreatePayload {
    name: string
    email: string
}

export class CreateNewKeyController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreatePayload

        if (!body.email || !body.name) {
            return res.status(400).json({
                error: "Email and name are required"
            })
        }

        try {
            let userId: string;
            let userName: string;
            let userEmail: string;

            const userExists = await prisma.permissionUserKey.findFirst({
                where: {
                    email: body.email
                },
                include: {
                    permissionsKeys: {
                        where: {
                            OR: [
                                { status: "pending" },
                                { status: "approved" }
                            ]
                        }
                    },
                }
            })

            if (userExists) {
                if (userExists.permissionsKeys.length > 0) {
                    return res.status(400).json({
                        error: "User already has a pending or active key."
                    })
                }
                userId = userExists.id;
                userName = userExists.name;
                userEmail = userExists.email;
            } else {
                const newUser = await prisma.permissionUserKey.create({
                    data: {
                        name: body.name,
                        email: body.email
                    }
                })
                userId = newUser.id;
                userName = newUser.name;
                userEmail = newUser.email;
            }

            const rawKey = crypto.randomBytes(32).toString("hex");

            const newKeyRecord = await prisma.permissionsKeys.create({
                data: {
                    key: rawKey,
                    permissionUserKeyId: userId,
                    status: "pending"
                }
            });

            const ownerEmail = process.env.OWNER_EMAIL;
            const smartbuildHeaderLogo = await getPresignedUrl("smartbuild-logo.png");
            const smartbuildFooterLogo = await getPresignedUrl("smartbuild-footer-logo.png");
            const instagramIcon = await getPresignedUrl("instagram-logo.png");

            if (ownerEmail) {
                try {
                    const SMTP_CONFIG = require("../../config/smtp");
                    const transporter = nodemailer.createTransport({
                        host: SMTP_CONFIG.host,
                        port: SMTP_CONFIG.port,
                        secure: SMTP_CONFIG.port === 465,
                        auth: {
                            user: SMTP_CONFIG.user,
                            pass: SMTP_CONFIG.pass,
                        },
                        tls: {
                            rejectUnauthorized: false,
                        },
                    });

                    const mailOptions = {
                        from: SMTP_CONFIG.user,
                        to: ownerEmail,
                        subject: `Action Required: Permission Key Approval Request - ${userName}`,
                        html: permissionKeyApprovalEmail(
                            userName,
                            userEmail,
                            newKeyRecord.id,
                            process.env.KEY_RESPONSE_EMAIL || "",
                            smartbuildHeaderLogo,
                            smartbuildFooterLogo,
                            instagramIcon
                        ),
                        text: `A new permission key has been requested by ${userName} (${userEmail}). Please approve or reject at the dashboard.`
                    };

                    await transporter.sendMail(mailOptions);
                    console.log(`Approval email sent to owner: ${ownerEmail}`);
                } catch (emailError) {
                    console.error('Error sending approval email to owner:', emailError);
                }
            } else {
                console.warn('OWNER_EMAIL not found in environment variables.');
            }

            return res.status(201).json({
                success: true,
                message: "Key request created successfully. Please wait for owner approval.",
                data: {
                    id: newKeyRecord.id,
                    status: newKeyRecord.status
                }
            })

        } catch (error) {
            console.error('Error in CreateNewKeyController:', error);
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
