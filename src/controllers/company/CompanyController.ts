import { INewCompany } from "../../DTOs/IUser";
import { Request, Response } from 'express'
import crypto from "crypto";
import { sendEmail } from "../../utils/sendEmail";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";
import { validationResult } from "express-validator";
import { deleteFile } from "../../config/file";
import { prisma } from "../../utils/prisma";
import bcrypt from "bcrypt";
import { NewUser } from "../../templateEmail/newUser";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { isMultiCompanyEnabled } from "../../helpers/featureToggle";
export class CompanyController {
    constructor() {
        this.create = this.create.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/company/${file}`);
        deleteFile(`./public/tmp/company/${requestFile}`);
    }

    async create(req: Request, res: Response) {
        function validateNewUser(data: INewCompany): string | null {
            if (!data.company_name) return "Company name is mandatory";
            if (!data.name) return "Name is required";
            if (!data.email) return "Email is required";
            if (!data.password) return "Password is required";
            return null;
        }

        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const data: INewCompany = req.body;
            const validationError = validateNewUser(data);

            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            const userExists = await prisma.user.findUnique({
                where: { email: data.email },
            });

            if (userExists) {
                return res
                    .status(400)
                    .json({ error: "Email has already been registered in the system" });
            }

            const office = await prisma.office.findFirst({
                where: {
                    name: {
                        equals: 'Owner'
                    }
                }
            });

            const passwordToHash = Array.isArray(data.password) ? data.password[0] : data.password;
            const hashedPassword = bcrypt.hashSync(passwordToHash, 10);

            const company = await prisma.company.create({
                data: {
                    name: data.company_name,
                }
            });

            const isMultiCompany = await isMultiCompanyEnabled()
            if (isMultiCompany) {
                const user = await prisma.user.create({
                    data: {
                        name: data.name,
                        email: data.email,
                        document: null,
                        phone: data.phone || null,
                        city_and_state: null,
                        rules: JSON.stringify(data.rules) || {},
                        office_id: String(office?.id),
                        password: hashedPassword,
                        profession: data.profession,
                        company_id: company.id,
                        onBoardingCompleted: false
                    },
                });
                await prisma.userCompany.create({
                    data: {
                        userId: user.id,
                        companyId: company.id,
                        office_id: String(office?.id),
                    }
                });
            } else {
                await prisma.user.create({
                    data: {
                        name: data.name,
                        email: data.email,
                        document: null,
                        phone: data.phone || null,
                        city_and_state: null,
                        rules: JSON.stringify(data.rules) || {},
                        office_id: String(office?.id),
                        password: hashedPassword,
                        profession: data.profession,
                        company_id: company.id,
                        onBoardingCompleted: false
                    },
                });
            }

            return res.status(201).json(company);
        } catch (error: any) {
            console.error("36. Erro no processo:", error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

    async createAccountByMaster(req: Request, res: Response) {
        console.log("1. Iniciando create da company");
        console.log("2. Request file:", req.file);
        console.log("3. Request body:", req.body);

        function validateNewUser(data: INewCompany): string | null {
            console.log("4. Validando dados do usuário:", data);
            if (!data.company_name) return "Company name is mandatory";
            if (!data.name) return "Name is required";
            if (!data.email) return "Email is required";
            if (!data.document) return "Document is required";
            return null;
        }

        // Verificar se existe arquivo antes de tentar processar
        if (!req.file) {
            console.log("5. Erro: Nenhum arquivo foi enviado");
            return res.status(400).json({ error: "Avatar file is required" });
        }

        const filePath = req.file?.filename?.split(".")[0] + ".webp";
        console.log("6. FilePath construído:", filePath);
        console.log("7. Caminho completo:", `./public/tmp/company/${filePath}`);

        const s3Bucket = process.env.AMAZON_S3_BUCKET!;
        console.log("8. S3 Bucket:", s3Bucket);

        try {
            console.log("9. Iniciando upload para S3");
            const fileName = await uploadImageWebpToS3(`./public/tmp/company/${filePath}`, s3Bucket);
            console.log("10. Upload concluído, fileName:", fileName);

            const errors = validationResult(req);
            console.log("11. Erros de validação:", errors.array());

            if (!errors.isEmpty()) {
                console.log("12. Encontrados erros de validação");
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res.status(400).json({ errors: errors.array() });
            }

            const data: INewCompany = req.body;
            console.log("13. Dados da company:", data);

            const validationError = validateNewUser(data);
            console.log("14. Erro de validação do usuário:", validationError);

            if (validationError) {
                console.log("15. Erro na validação dos dados do usuário");
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res.status(400).json({ error: validationError });
            }

            console.log("16. Verificando email duplicado");
            const userExists = await prisma.user.findUnique({
                where: { email: data.email },
            });
            console.log("17. Usuário existente:", userExists);

            if (userExists) {
                console.log("18. Email já registrado");
                this.deleteFiles(
                    req.file?.filename?.split(".")[0] + ".webp",
                    req.file?.filename
                );
                return res
                    .status(400)
                    .json({ error: "Email has already been registered in the system" });
            }

            console.log("19. Verificando documento duplicado");
            // const documentExists = await prisma.user.findUnique({
            // where: { document: data.document },
            // });
            // console.log("20. Documento existente:", documentExists);

            // if (documentExists) {
            // console.log("21. Documento já registrado");
            // this.deleteFiles(
            // req.file?.filename?.split(".")[0] + ".webp",
            // req.file?.filename
            // );
            // return res.status(400).json({
            // error: "Document has already been registered in the system",
            // });
            // }

            console.log("22. Buscando cargo de administrador");
            const office = await prisma.office.findFirst({
                where: {
                    name: {
                        equals: 'Owner'
                    }
                }
            });
            console.log("23. Cargo encontrado:", office);

            const pass = crypto.randomBytes(3).toString("hex").toUpperCase();
            const hashedPassword = bcrypt.hashSync(pass, 10);
            console.log("24. Senha temporária gerada");

            console.log("26. Gerando URL presigned para logo");
            const urlLogo = fileName ? await getPresignedUrl(fileName) : '';
            console.log("27. URL do logo:", urlLogo);

            const templateEmail = NewUser(data.name.toUpperCase(), urlLogo, pass);
            console.log("28. Template de email gerado");

            console.log("29. Criando company no banco");
            const company = await prisma.company.create({
                data: {
                    name: data.company_name,
                    avatar: String(fileName),
                    extraEmployees: data.extraEmployees ?
                        (typeof data.extraEmployees === 'string' ?
                            parseInt(data.extraEmployees) :
                            Number(data.extraEmployees)) :
                        null
                }
            });
            console.log("30. Company criada:", company);

            console.log("31. Criando usuário no banco");
            const isMultiCompany = await isMultiCompanyEnabled()
            if (isMultiCompany) {
                const user = await prisma.user.create({
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
                    },
                });
                await prisma.userCompany.create({
                    data: {
                        userId: user.id,
                        companyId: company.id,
                        office_id: String(office?.id),
                    }
                });
            } else {
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
                    }
                });
            }
            console.log("32. Usuário criado");

            console.log("33. Deletando arquivo temporário");
            deleteFile(`./public/tmp/company/${req.file?.filename}`);

            console.log("34. Enviando email");
            await sendEmail({
                to: data.email,
                subject: "Smart Build",
                html: templateEmail,
            });
            console.log("35. Email enviado");

            return res.status(201).json(company);
        } catch (error: any) {
            console.error("36. Erro no processo:", error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

    async updateCompanyData(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const {
            address,
            email,
            phone,
            webSiteUrl,
            name,
            workStartTime,
            workEndTime,
            attendanceMode,
            projectVisibilityMode,
            signature
        } = req.body;
        const file = req.file;

        try {
            const company = await prisma.company.findUnique({ where: { id } });
            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }

            // Validate working hours format and logic
            if (workStartTime || workEndTime) {
                const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

                if (workStartTime && !timeRegex.test(workStartTime)) {
                    return res.status(400).json({ error: "Invalid start time format. Use HH:mm (24-hour format)" });
                }

                if (workEndTime && !timeRegex.test(workEndTime)) {
                    return res.status(400).json({ error: "Invalid end time format. Use HH:mm (24-hour format)" });
                }

                if (workStartTime && workEndTime) {
                    const [startHour, startMinute] = workStartTime.split(':').map(Number);
                    const [endHour, endMinute] = workEndTime.split(':').map(Number);

                    const startMinutes = startHour * 60 + startMinute;
                    const endMinutes = endHour * 60 + endMinute;

                    if (endMinutes <= startMinutes) {
                        return res.status(400).json({ error: "End time must be after start time" });
                    }
                }
            }

            if (attendanceMode && !["manual", "auto"].includes(attendanceMode)) {
                return res.status(400).json({ error: "Invalid attendance mode. Use manual or auto." });
            }

            let avatarUrl = company.avatar;

            if (file) {
                const filePath = `./public/tmp/company/${file.filename.split('.')[0]}.webp`;
                const newAvatarUrl = await uploadImageWebpToS3(filePath, process.env.AMAZON_S3_BUCKET!);
                avatarUrl = newAvatarUrl;
            }

            const updatedCompany = await prisma.company.update({
                where: { id },
                data: {
                    address,
                    email,
                    phone,
                    webSiteUrl,
                    name,
                    avatar: avatarUrl,
                    workStartTime,
                    workEndTime,
                    ...(attendanceMode ? { attendanceMode } : {}),
                    ...(projectVisibilityMode ? { projectVisibilityMode } : {}),
                    ...(signature !== undefined ? { signature: signature || null } : {})
                },
            });

            return res.status(200).json({ company: updatedCompany });
        } catch (error: any) {
            console.error("Error updating company data:", error);
            return res.status(500).json({ error: error.message || "Internal error" });
        } finally {
            if (file) {
                deleteFile(`./public/tmp/company/${file.filename}`);
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
                    signature: true,
                    address: true,
                    district: true,
                    numberHouse: true,
                    complement: true,
                    email: true,
                    phone: true,
                    webSiteUrl: true,
                    name: true,
                    workStartTime: true,
                    workEndTime: true,
                    attendanceMode: true,
                    projectVisibilityMode: true
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

    async searchOneCompanyNotes(request: Request, response: Response) {
        try {
            const { id } = request.params;
            const company = await prisma.company.findUnique({
                where: { id },
                select: {
                    name: true,
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
                            updatedAt: 'asc',
                        },
                        select: {
                            id: true,
                            notes: true,
                            updatedAt: true,
                        },
                    },
                },
            });

            if (!company) {
                return response.status(404).json({ error: "Company not found!" });
            }

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
                name: company.name,
                ContractNotes: company.NotesContrac.map(note => ({
                    id: note.id,
                    notes: note.notes,
                    updatedAt: note.updatedAt,
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
            const { filter, startDate, endDate } = req.query;

            // Construir filtro de data se fornecido
            const dateFilter: any = {};
            if (startDate) {
                dateFilter.gte = new Date(startDate as string);
            }
            if (endDate) {
                dateFilter.lte = new Date(endDate as string);
            }

            const whereClause: any = {};
            if (Object.keys(dateFilter).length > 0) {
                whereClause.date_creation = dateFilter;
            }

            const response = await prisma.company.findMany({
                where: whereClause,
                include: {
                    userCompanies: {
                        where: {
                            user: {
                                is: {
                                    office: {
                                        is: {
                                            name: "Owner"
                                        }
                                    }
                                }
                            }
                        },
                        select: {
                            user: true
                        }
                    },
                    Subscription: {
                        include: {
                            plan: {
                                select: {
                                    id: true,
                                    name: true,
                                    validityType: true,
                                    validityDuration: true,
                                    price: true
                                }
                            }
                        },
                        orderBy: {
                            endDate: 'desc'
                        }
                    }
                }
            });

            // Processar URLs dos avatares e filtrar subscriptions ativas
            const companyWithPresignedAvatar = await Promise.all(
                response.map(async (company) => {
                    const adminUser = company.userCompanies[0]?.user;
                    const oneMonthAgo = new Date();
                    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

                    const lastAccess = adminUser?.last_acess;
                    const isActive = lastAccess ? new Date(lastAccess) >= oneMonthAgo : false;

                    const activeSubscription = company.Subscription?.find(sub => sub.isActive);
                    const planType = activeSubscription?.plan?.validityType;

                    // Aplicar filtro se fornecido
                    if (filter) {
                        let shouldInclude = true;
                        switch (filter) {
                            case 'free':
                                shouldInclude = planType === 'FREE';
                                break;
                            case 'paid':
                                shouldInclude = !!planType && planType !== 'FREE';
                                break;
                            case 'active':
                                shouldInclude = isActive;
                                break;
                            case 'inactive':
                                shouldInclude = !isActive;
                                break;
                            case 'all':
                            default:
                                shouldInclude = true;
                        }
                        if (!shouldInclude) return null;
                    }

                    return {
                        ...company,
                        avatar: company.avatar ? await getPresignedUrl(company.avatar) : null,
                        User: adminUser ? {
                            ...adminUser,
                            avatar: adminUser?.avatar ? await getPresignedUrl(adminUser.avatar) : null
                        } : null,
                        Subscription: company.Subscription?.map(sub => ({
                            id: sub.id,
                            companyId: sub.companyId,
                            planId: sub.planId,
                            startDate: sub.startDate,
                            endDate: sub.endDate,
                            isActive: sub.isActive,
                            plan: sub.plan
                        })) || []
                    };
                })
            );

            // Remover nulls do filtro
            const filteredCompanies = companyWithPresignedAvatar.filter(company => company !== null);

            return res.status(200).json(filteredCompanies);
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
            return res.status(201).json({ message: "Note deleted successfully" });
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
                orderBy: { updatedAt: 'asc' },
            });
            res.status(200).json(notes);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }
    }

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

    async proxyImageByUri(req: Request, res: Response) {
        try {
            const { uri } = req.query;

            if (!uri || typeof uri !== 'string') {
                return res.status(400).json({ error: "URI parameter is required" });
            }

            console.log("URI recebida:", uri);

            // Gerar o presigned URL usando a URI
            const presignedUrl = await getPresignedUrl(uri);
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
            const pngBuffer = await sharp(buffer)
                .resize(800) // Redimensionar para largura máxima de 800px
                .png({ quality: 80 }) // Comprimir com qualidade 80%
                .toBuffer();

            const base64 = `data:image/png;base64,${pngBuffer.toString("base64")}`;

            return res.json({ base64 });
        } catch (error) {
            console.error("Erro no proxy de imagem por URI:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async updateCompanyAndUser(req: Request, res: Response) {
        try {
            const { id } = req.params; // ID da company
            const {
                company_name,
                name,
                email,
                document,
                city_and_state,
                phone,
                userId, // Adicionado userId para identificar o usuário específico
                extraEmployees // Nova propriedade opcional
            } = req.body;

            // Verificar se userId foi fornecido
            if (!userId) {
                if (req.file) {
                    this.deleteFiles(
                        req.file.filename?.split(".")[0] + ".webp",
                        req.file.filename
                    );
                }
                return res.status(400).json({ error: "User ID is required" });
            }

            // Buscar a company
            const company = await prisma.company.findUnique({
                where: { id }
            });

            if (!company) {
                if (req.file) {
                    this.deleteFiles(
                        req.file.filename?.split(".")[0] + ".webp",
                        req.file.filename
                    );
                }
                return res.status(404).json({ error: "Company not found" });
            }

            // Buscar o usuário específico
            const isMultiCompany = await isMultiCompanyEnabled()
            let user;
            if (isMultiCompany) {
                user = await prisma.user.findUnique({
                    where: {
                        id: userId,
                        companies: {
                            some: {
                                companyId: id
                            }
                        }
                    }
                });
            } else {
                user = await prisma.user.findUnique({
                    where: {
                        id: userId,
                        company_id: id // Garantir que o usuário pertence à empresa
                    }
                });
            }

            if (!user) {
                if (req.file) {
                    this.deleteFiles(
                        req.file.filename?.split(".")[0] + ".webp",
                        req.file.filename
                    );
                }
                return res.status(404).json({ error: "User not found or does not belong to this company" });
            }

            // Verificar email duplicado (se foi alterado)
            if (email && email !== user.email) {
                const emailExists = await prisma.user.findFirst({
                    where: {
                        email,
                        id: { not: userId }
                    }
                });

                if (emailExists) {
                    if (req.file) {
                        this.deleteFiles(
                            req.file.filename?.split(".")[0] + ".webp",
                            req.file.filename
                        );
                    }
                    return res.status(400).json({ error: "Email already exists" });
                }
            }

            // // Verificar documento duplicado (se foi alterado)
            // if (document && document !== user.document) {
            //     const documentExists = await prisma.user.findFirst({
            //         where: {
            //             document,
            //             id: { not: userId }
            //         }
            //     });

            //     if (documentExists) {
            //         if (req.file) {
            //             this.deleteFiles(
            //                 req.file.filename?.split(".")[0] + ".webp",
            //                 req.file.filename
            //             );
            //         }
            //         return res.status(400).json({ error: "Document already exists" });
            //     }
            // }

            let avatarUrl = company.avatar;

            // Processar nova imagem se foi enviada
            if (req.file) {
                try {
                    const filePath = req.file.filename?.split(".")[0] + ".webp";
                    avatarUrl = await uploadImageWebpToS3(
                        `./public/tmp/company/${filePath}`,
                        process.env.AMAZON_S3_BUCKET!
                    );
                } catch (error) {
                    console.error("Error uploading new avatar:", error);
                    return res.status(500).json({ error: "Error uploading new avatar" });
                }
            }

            // Atualizar company e usuário em uma transação
            const [updatedCompany, updatedUser] = await prisma.$transaction([
                prisma.company.update({
                    where: { id },
                    data: {
                        name: company_name,
                        ...(req.file && { avatar: avatarUrl }),
                        ...(extraEmployees !== undefined && {
                            extraEmployees: typeof extraEmployees === 'string' ?
                                parseInt(extraEmployees) :
                                Number(extraEmployees)
                        })
                    }
                }),
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        name,
                        email,
                        document,
                        city_and_state,
                        phone,
                        ...(req.file && { avatar: avatarUrl })
                    }
                })
            ]);
            if (req.file) {
                if (user.avatar) {
                    deleteFile(`./public/tmp/company/${company.avatar}`);
                }
                deleteFile(`./public/tmp/company/${req.file.filename}`);
            }

            return res.json({
                company: updatedCompany,
                user: updatedUser
            });

        } catch (error) {
            console.error("Error updating company and user:", error);
            if (req.file) {
                this.deleteFiles(
                    req.file.filename?.split(".")[0] + ".webp",
                    req.file.filename
                );
            }
            return res.status(500).json({
                error: error instanceof Error ? error.message : "Internal server error"
            });
        } finally {
            // Limpar arquivos temporários
            // if (req.file) {
            //     this.deleteFiles(
            //         req.file.filename?.split(".")[0] + ".webp",
            //         req.file.filename
            //     );
            // }
        }
    }

}
