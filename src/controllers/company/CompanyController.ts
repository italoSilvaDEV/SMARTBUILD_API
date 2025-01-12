import { INewCompany } from "../../DTOs/IUser";
import { Request, Response } from 'express'
import crypto from "crypto";
import nodemailer from "nodemailer";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";
import { validationResult } from "express-validator";
import { deleteFile } from "../../config/file";
import { prisma } from "../../utils/prisma";
import bcrypt from "bcrypt";
import { NewUser } from "../../templateEmail/newUser";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
export class CompanyController {
    constructor() {
        this.create = this.create.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/user/${file}`);
        deleteFile(`./public/tmp/user/${requestFile}`);
    }
    async create(req: Request, res: Response) {

        function validateNewUser(data: INewCompany): string | null {
            if (!data.company_name) return "Company name is mandatory";
            if (!data.name) return "Name is required";
            if (!data.email) return "Email is required";
            if (!data.document) return "Document is required";
            return null;
        }
        const filePath = req.file?.filename?.split(".")[0] + ".webp"; // Caminho do arquivo
        const s3Bucket = process.env.AMAZON_S3_BUCKET!;

        try {
            const fileName = await uploadImageWebpToS3(`./public/tmp/user/${filePath}`, s3Bucket);
            // console.log('Upload concluído:', fileName);
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res.status(400).json({ errors: errors.array() });
            }

            const data: INewCompany = req.body;
            const validationError = validateNewUser(data);
            if (validationError) {
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res.status(400).json({ error: validationError });
            }

            // Verifica se o email existe
            const userExists = await prisma.user.findUnique({
                where: { email: data.email },
            });
            if (userExists) {
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res
                    .status(400)
                    .json({ error: "Email has already been registered in the system" });
            }

            const documentExists = await prisma.user.findUnique({
                where: { document: data.document },
            });
            if (documentExists) {
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res.status(400).json({
                    error: "Document has already been registered in the system",
                });
            }
            const office = await prisma.office.findFirst({
                where: {
                    name: {
                        equals: 'administrator'
                    }
                }
            })


            // Senha temporária
            const pass = crypto.randomBytes(3).toString("hex").toUpperCase();
            const hashedPassword = bcrypt.hashSync(pass, 10);

            // Email
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: true,
                auth: {
                    user: SMTP_CONFIG.user,
                    pass: SMTP_CONFIG.pass,
                },
                tls: { rejectUnauthorized: false },
            });
            const templateEmail = NewUser(data.name.toUpperCase(), pass);
            const mailOptions = {
                from: SMTP_CONFIG.user,
                to: data.email,
                subject: "Smart Build",
                html: templateEmail,
            };
            const company = await prisma.company.create({
                data: {
                    name: data.company_name,
                    avatar: String(fileName),
                }
            })
            await prisma.user.create({
                data: {
                    avatar: String(fileName),
                    name: data.name,
                    email: data.email,
                    document: data.document,
                    phone: data.phone,
                    city_and_state: data.city_and_state,
                    rules: JSON.stringify(data.rules) || {},
                    office_id: String(office?.id),
                    password: hashedPassword,
                    profession: data.profession,
                    company_id: company.id
                },
            });

            deleteFile(`./public/tmp/user/${req.file?.filename}`);
            await transporter.sendMail(mailOptions);

            return res.status(201).json({ message: "User created successfully" });
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
        // })
    }

    async findMany(req: Request, res: Response) {
        try {
            const response = await prisma.company.findMany({
                include: {
                    User: {
                        where: {
                            office: {
                                name: {
                                    equals: "Administrator"
                                }
                            }
                        },
                        take: 1
                    }
                }
            })
            // Processar URLs dos avatares
            const companyWithPresignedAvatar = await Promise.all(
                response.map(async (company) => ({
                    ...company,
                    avatar: company.avatar ? await getPresignedUrl(company.avatar) : null, // Gera URL assinada
                    User: {
                        ...company.User[0],
                        avatar: company.User[0].avatar ? await getPresignedUrl(company.User[0].avatar) : null
                    }
                }))
            );
            return res.status(200).json(companyWithPresignedAvatar);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }
}