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

    async updateCompanyData(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const { 
            address, 
            district, 
            numberHouse, 
            complement,
            email,
            phone,
            webSiteUrl,
         } = req.body;
        const file = req.file;

        try {
            const company = await prisma.company.findUnique({ where: { id } });
            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }

            let avatarUrl = company.avatar;

            if (file) {
                const newAvatarUrl = await uploadImageWebpToS3(`./public/tmp/user/${file.filename}`, process.env.AMAZON_S3_BUCKET!);
                avatarUrl = newAvatarUrl;
                // Optionally delete old avatar from S3 if needed
            }

            const updatedCompany = await prisma.company.update({
                where: { id },
                data: {
                    address,
                    district,
                    numberHouse,
                    complement,
                    email,
                    phone,
                    webSiteUrl,
                    avatar: avatarUrl,
                },
            });

            return res.status(200).json({ company: updatedCompany });
        } catch (error: any) {
            console.error("Error updating company data:", error);
            return res.status(500).json({ error: error.message || "Internal error" });
        } finally {
            // Clean up the uploaded file
            if (file) {
                deleteFile(`./public/tmp/user/${file.filename}`);
            }
        }
    }

    async searchOneCompany(request: Request, response: Response) {
        try {
            const { id } = request.params;
            const company = await prisma.company.findUnique({
                where: { id },
                select: {
                    avatar: true,
                    address: true,
                    district: true,
                    numberHouse: true,
                    complement: true,
                    email: true,
                    phone: true,
                    webSiteUrl: true
                }
            });

            if (!company) {
                return response.status(404).json({ error: "Company not found!" });
            }

            // Get presigned URL for the avatar if it exists
            const avatarUrl = company.avatar ? await getPresignedUrl(company.avatar) : null;

            const formattedCompany = {
                ...company,
                avatar: avatarUrl
            };

            return response.json(formattedCompany);
        } catch (error) {
            console.error('Error searching for company:', error);
            return response.status(500).json({ error: "Internal server error" });
        }
    }

    // async searchOneCompanyNotes(request: Request, response: Response) {
    //     try {
    //         const { id } = request.params;
    //         const company = await prisma.company.findUnique({
    //             where: { id },
    //             select: {
    //                 avatar: true,
    //                 address: true,
    //                 district: true,
    //                 numberHouse: true,
    //                 complement: true,
    //                 NotesContrac: {
    //                     select: {
    //                         id: true,
    //                         notes: true
    //                     }
    //                 }
    //             }
    //         });

    //         if (!company) {
    //             return response.status(404).json({ error: "Company not found!" });
    //         }

    //         // Get presigned URL for the avatar if it exists
    //         const avatarUrl = company.avatar ? await getPresignedUrl(company.avatar) : null;

    //         const formattedCompany = {
    //             avatar: avatarUrl,
    //             address: company.address,
    //             district: company.district,
    //             numberHouse: company.numberHouse,
    //             complement: company.complement,
    //             ContractNotes: company.NotesContrac.map(note => ({
    //                 id: note.id,
    //                 notes: note.notes
    //             }))
    //         };

    //         return response.json(formattedCompany);
    //     } catch (error) {
    //         console.error('Error searching for company:', error);
    //         return response.status(500).json({ error: "Internal server error" });
    //     }
    // }

    async searchOneCompanyNotes(request: Request, response: Response) {
        try {
          const { id } = request.params;
          const company = await prisma.company.findUnique({
            where: { id },
            select: {
              avatar: true,
              address: true,
              district: true,
              numberHouse: true,
              complement: true,
              email: true,
              phone: true,
              webSiteUrl: true,
              NotesContrac: {
                orderBy: {
                  updatedAt: 'asc', // Ordena de forma crescente pela data de atualização
                },
                select: {
                  id: true,
                  notes: true,
                  updatedAt: true, // Opcional: se você quiser enviar também a data de atualização
                },
              },
            },
          });
      
          if (!company) {
            return response.status(404).json({ error: "Company not found!" });
          }
      
          // Obter o presigned URL para o avatar, se existir
          const avatarUrl = company.avatar ? await getPresignedUrl(company.avatar) : null;
      
          const formattedCompany = {
            avatar: avatarUrl,
            address: company.address,
            district: company.district,
            numberHouse: company.numberHouse,
            complement: company.complement,
            email: company.email,
            phone: company.phone,
            webSiteUrl: company.webSiteUrl,
            ContractNotes: company.NotesContrac.map(note => ({
              id: note.id,
              notes: note.notes,
              updatedAt: note.updatedAt, // opcional
            })),
          };
      
          return response.json(formattedCompany);
        } catch (error) {
          console.error('Error searching for company:', error);
          return response.status(500).json({ error: "Internal server error" });
        }
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

    async createNote(req: Request, res: Response) {
        const { companyId } = req.params;
        const { notes } = req.body;
        try {
            const note = await prisma.contractNotes.create({
                data: {
                    notes: notes,
                    company_id: companyId,
                },
            });
            res.status(201).json(note);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

    async updateNote(req: Request, res: Response) {
        const { noteId } = req.params;
        const { notes } = req.body;
        try {
            const updatedNote = await prisma.contractNotes.update({
                where: { id: noteId },
                data: { notes: notes },
            });
            res.status(200).json(updatedNote);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

    async deleteNote(req: Request, res: Response) {
        const { noteId } = req.params;
        try {
            await prisma.contractNotes.delete({
                where: { id: noteId },
            });
            res.status(204).send();
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

    async listNotes(req: Request, res: Response) {
        const { companyId } = req.params;
        try {
            const notes = await prisma.contractNotes.findMany({
                where: { company_id: companyId },
                orderBy: { createdAt: 'desc' },
            });
            res.status(200).json(notes);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

    // async proxyImage(req: Request, res: Response) {
    //     try {
    //         console.log("req.query:", req.query);
    //         const { url } = req.query;
    //         if (!url) {
    //             return res.status(400).json({ error: "Missing 'url' query param" });
    //         }

    //         // Supondo que 'url' seja uma URL completa, extraímos a key do S3.
    //         // Exemplo de URL: 
    //         // https://xmentoria.s3.us-east-2.amazonaws.com/37c6e93b-.webp?X-Amz-Algorithm=...
    //         const rawUrl = url as string;
    //         const parsedUrl = new URL(rawUrl);
    //         const key = parsedUrl.pathname.substring(1); // Remove a '/' inicial, ex: "37c6e93b-.webp"
    //         console.log("Extracted key:", key);

    //         // Gerar o presigned URL usando apenas a key
    //         const presignedUrl = await getPresignedUrl(key);
    //         console.log("Generated presignedUrl:", presignedUrl);

    //         // Importa node-fetch (para Node <18; se estiver usando Node 18+, pode usar o fetch global)
    //         const fetch = await import('node-fetch').then(mod => mod.default || mod);
    //         const response = await fetch(presignedUrl);

    //         if (!response.ok) {
    //             const errorText = await response.text();
    //             console.error("Error fetching image from S3, response text:", errorText);
    //             return res.status(500).json({ error: "Failed to fetch image from S3" });
    //         }

    //         // Obter os dados da imagem e converter para base64
    //         const arrayBuffer = await response.arrayBuffer();
    //         const buffer = Buffer.from(arrayBuffer);
    //         // Aqui assumimos que a imagem é webp. Se for PNG ou JPEG, ajuste o MIME type.
    //         const base64 = `data:image/webp;base64,${buffer.toString("base64")}`;

    //         return res.json({ base64 });
    //     } catch (error) {
    //         console.error("Erro no proxy de imagem:", error);
    //         return res.status(500).json({ error: "Internal server error" });
    //     }
    // }

    async proxyImage(req: Request, res: Response) {
        try {
          console.log("req.query:", req.query);
          const { url } = req.query;
          if (!url) {
            return res.status(400).json({ error: "Missing 'url' query param" });
          }
      
          // Supondo que 'url' seja uma URL completa, extraímos a key do S3.
          // Exemplo de URL: https://xmentoria.s3.us-east-2.amazonaws.com/37c6e93b-.webp?X-Amz-Algorithm=...
          const rawUrl = url as string;
          const parsedUrl = new URL(rawUrl);
          const key = parsedUrl.pathname.substring(1); // Remove a '/' inicial
          console.log("Extracted key:", key);
      
          // Gerar o presigned URL usando apenas a key
          const presignedUrl = await getPresignedUrl(key);
          console.log("Generated presignedUrl:", presignedUrl);
      
          // Importa node-fetch (para Node <18; se estiver usando Node 18+, pode usar o fetch global)
          const fetch = await import("node-fetch").then((mod) => mod.default || mod);
          const response = await fetch(presignedUrl);
      
          if (!response.ok) {
            const errorText = await response.text();
            console.error("Error fetching image from S3, response text:", errorText);
            return res.status(500).json({ error: "Failed to fetch image from S3" });
          }
      
          // Obter os dados da imagem e converter para base64
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
      
          // Converter a imagem de WebP para PNG usando Sharp
          const sharp = require("sharp");
          const pngBuffer = await sharp(buffer).png().toBuffer();
          const base64 = `data:image/png;base64,${pngBuffer.toString("base64")}`;
      
          return res.json({ base64 });
        } catch (error) {
          console.error("Erro no proxy de imagem:", error);
          return res.status(500).json({ error: "Internal server error" });
        }
      }
      





}