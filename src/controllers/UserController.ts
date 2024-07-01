import bcrypt from "bcrypt";
import { prisma } from "../utils/prisma";
import { Request, Response } from "express";
import Jwt, { JwtPayload } from 'jsonwebtoken'
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { RecoverPassword } from "../templateEmail/recoverPassword";
import { INewUser } from "../DTOs/IUser";
import { deleteFile } from "../config/file";
import { validationResult } from "express-validator";
import { NewUser } from "../templateEmail/newUser";


export class UserController {

    constructor() {
        this.create = this.create.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/user/${file}`);
        deleteFile(`./public/tmp/user/${requestFile}`);
    }

    async create(req: Request, res: Response) {

        function validateNewUser(data: INewUser): string | null {
            if (!data.name) return "Name is required";
            if (!data.email) return "Email is required";
            if (!data.document) return "Document is required";
            if (!data.office_id) return "Office ID is required";
            return null;
        }
        const file = req.file?.filename;
        const nameFile = file ? `${req.file?.filename.split(".")[0]}.webp` : null;

        try {

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                this.deleteFiles(req.file?.filename?.split('.')[0] + '.webp', req.file?.filename);
                return res.status(400).json({ errors: errors.array() });
            }

            const data: INewUser = req.body;
            const validationError = validateNewUser(data);
            if (validationError) {
                this.deleteFiles(req.file?.filename?.split('.')[0] + '.webp', req.file?.filename);
                return res.status(400).json({ error: validationError });
            }

            //verifica se email existe
            const userExists = await prisma.user.findUnique({
                where: {
                    email: data.email
                }
            });
            if (userExists) {
                this.deleteFiles(req.file?.filename?.split('.')[0] + '.webp', req.file?.filename);
                return res.status(400).json({ error: "Email has already been registered in the system" });
            }

            // Verificar se o documento existe
            const documentExists = await prisma.user.findUnique({
                where: {
                    document: data.document
                }
            });
            if (documentExists) {
                this.deleteFiles(req.file?.filename?.split('.')[0] + '.webp', req.file?.filename);
                return res.status(400).json({ error: "Document has already been registered in the system" });
            }

            // Verificar se o office existe 
            const office = await prisma.user.findMany({
                where: {
                    office_id: data.office_id
                }
            });
            if (!office) {
                this.deleteFiles(req.file?.filename?.split('.')[0] + '.webp', req.file?.filename);
                return res.status(400).json({ error: "office invalid" });
            }

            //senha temporária
            const pass = crypto.randomBytes(3).toString('hex').toUpperCase();
            const hashedPassword = bcrypt.hashSync(pass, 10);

            //email
            const SMTP_CONFIG = require('../config/smtp')
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: true,
                auth: {
                    user: SMTP_CONFIG.user,
                    pass: SMTP_CONFIG.pass
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
            const templateEmail = NewUser(data.name.toUpperCase(), pass)
            const mailOptions = {
                from: SMTP_CONFIG.user,
                to: data.email,
                subject: "RP Pro Contracting",
                html: templateEmail,
            };

            await prisma.user.create({
                data: {
                    avatar: nameFile,
                    name: data.name,
                    email: data.email,
                    document: data.document,
                    phone: data.phone,
                    city_and_state: data.city_and_state,
                    rules: JSON.stringify(data.rules) || {},
                    office_id: data.office_id,
                    password: hashedPassword

                },
            });
            deleteFile(`./public/tmp/user/${req.file?.filename}`)
            await transporter.sendMail(mailOptions);

            return res.status(201).json({ message: "User created successfully" });
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message || "Internal error" });
        }

    }

    async authenticate(req: Request, res: Response) {
        try {

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: "User or password is required!" });
                //throw new Error("Fill in the mandatory fields")
            }

            const user = await prisma.user.findUnique({
                select: {
                    id: true,
                    name: true,
                    password: true,
                    email: true,
                    rules: true,
                    office: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                where: {
                    email
                }
            });

            if (!user) {
                return res.status(400).json({ error: "User or password invalid!" });
                //throw Error("User or password invalid!")
            }

            const isValidPassword = await bcrypt.compare(password, user.password);

            if (!isValidPassword) {
                return res.status(400).json({ error: "User or password invalid!" });
                //throw Error("User or password invalid!")
            }

            const token = Jwt.sign(
                {
                    id: user.id,
                    name: user.name,
                },
                String(process.env.SECRET_JWT),
                {
                    subject: user.id,
                    expiresIn: '1d',
                }
            );

            // return res.json({ user, token });
            return res.json({
                msg: "Authentication completed successfully!",
                token,
                rules: user.rules,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    office: user.office
                },
            })
        } catch (error) {
            if (error instanceof Error) {
                return res.json({ error: error.message });
            }
            return res.json({ error: "Internal error" });
        }
    }

    async update(request: Request, response: Response) {
        const {
            id,
            name,
            email,
            document,
            city_and_state,
            office,
            phone,
            current_password,
            password,
            confirm_password,
        } = request.body;
    
        // Função de validação
        function validateUserData(data: any): string | null {
            if (!data.name) return "Name is required";
            if (!data.email) return "Email is required";
            if (!data.document) return "Document is required";
            if (!data.office.id) return "Office ID is required";
            return null;
        }
    
        const validationError = validateUserData(request.body);
        if (validationError) {
            return response.status(400).json({ error: validationError });
        }
    
        try {
            const user = await prisma.user.findUnique({
                where: { id }
            });
    
            if (!user) {
                return response.status(404).json({ error: "User not found!" });
            }
    
            if (password && password !== confirm_password) {
                return response.status(400).json({ error: "Passwords do not match" });
            }
    
            // Check if email is different and already in use
            if (email !== user.email) {
                const emailExists = await prisma.user.findUnique({
                    where: { email }
                });
                if (emailExists) {
                    return response.status(400).json({ error: "Email already registered" });
                }
            }
    
            // Check if document is different and already in use
            if (document !== user.document) {
                const documentExists = await prisma.user.findUnique({
                    where: { document }
                });
                if (documentExists) {
                    return response.status(400).json({ error: "Document already registered" });
                }
            }
    
            if (current_password && password) {
                const checkPassword = await bcrypt.compare(current_password, user.password);
    
                if (!checkPassword) {
                    return response.status(400).json({ error: "Invalid current password!" });
                }
    
                const hashedPassword = bcrypt.hashSync(password, 10);
    
                await prisma.user.update({
                    where: { id },
                    data: {
                        name,
                        email,
                        password: hashedPassword,
                        document,
                        city_and_state,
                        office_id: office.id,
                        phone,
                    }
                });
            } else {
                await prisma.user.update({
                    where: { id },
                    data: {
                        name,
                        email,
                        document,
                        city_and_state,
                        office_id: office.id,
                        phone,
                    }
                });
            }
    
            return response.json({ message: "User updated successfully" });
        } catch (error: any) {
            if (error instanceof Error) {
                return response.status(500).json({ error: error.message });
            }
            return response.status(500).json({ error: "Internal error" });
        }
    }
    

    async updateImg(request: Request, response: Response) {
        try {
            const {
                id,
            } = request.params;

            let file = ""
            file = `${request.file?.filename.split('.')[0]}.webp`;

            const user = await prisma.user.findUnique({
                where: {
                    id
                }
            });

            if (!user) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                throw new Error("Id invalid!");
            }

            await prisma.user.update({
                where: {
                    id
                },
                data: {
                    avatar: file
                }
            })

            if (user) {
                deleteFile(`./public/tmp/user/${user.avatar}`)
            }
            deleteFile(`./public/tmp/catalog/${request.file?.filename}`)

            return response.json();
        } catch (error: any) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal error" });
        }


    }

    async searchOneUser(request: Request, response: Response) {
        try {

            let { id } = request.params
            const user = await prisma.user.findUnique({
                where: { id }
            });

            if (!user) {
                throw Error("User not found!");
            }
            const result = await prisma.user.findUnique({
                where: {
                    id
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    avatar: true,
                    phone: true,
                    document: true,
                    //rules: true,                                    
                    city_and_state: true,
                    office: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            })

            return response.json(result)
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }

    };

    async serchAllUser(request: Request, response: Response) {
        const { name, email, pag } = request.body;

        const filtro: any = {};
        const name_full: any = {};

        if (name) { name_full.name = { contains: name } };
        if (email) { filtro.email = { contains: email } };

        const result = await prisma.user.findMany({
            skip: Number(pag) * 8,
            take: 8,
            orderBy: {
                //name: "asc"
                date_creation: "desc"
            },
            where: {
                AND: [filtro, { OR: [name_full] }]
            },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                document: true,
                office: {
                    select: {
                        name: true
                    }
                },
                city_and_state: true
            }
        });

        const total = await prisma.user.count({
            where: {
                AND: [filtro, { OR: [name_full] }]
            }
        });

        return response.json({ users: result, total });
    }


    async delete(request: Request, response: Response) {
        try {
            let { id } = request.params

            const user = await prisma.user.findUnique({
                where: { id }
            });

            if (!user) {
                throw new Error("User not found!");
            }

            await prisma.user.delete({
                where: {
                    id: id
                }

            })
            return response.json();
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal error" });
        }

    }

    async sendMailRecover(request: Request, response: Response) {
        const { email } = request.body;

        if (!email) {
            return response.status(400).json({ error: "e-mail is mandatory" });
        }

        ///check if user exists
        const user = await prisma.user.findUnique({
            where: {
                email
            }
        })

        if (!user) {
            return response.status(400).json({ error: "User not found!" });
        }
        const token = crypto.randomBytes(3).toString('hex').toUpperCase();
        await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                token_recover_password: token
            }
        })

        const SMTP_CONFIG = require('../config/smtp')

        const transporter = nodemailer.createTransport({
            host: SMTP_CONFIG.host,
            port: SMTP_CONFIG.port,
            secure: SMTP_CONFIG.port === 465, // true for 465, false for other ports
            auth: {
                user: SMTP_CONFIG.user,
                pass: SMTP_CONFIG.pass
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Verificar a configuração do transportador
        transporter.verify((error, success) => {
            if (error) {
                console.error('Erro ao configurar o transportador de e-mail:', error);
            } else {
                console.log('Transportador de e-mail configurado com sucesso:', success);
            }
        });

        const templateEmail = RecoverPassword(user.name.toUpperCase(), token);
        const mailOptions = {
            from: SMTP_CONFIG.user,
            to: email,
            subject: "RP PRO Contracting - Password Reset",
            html: templateEmail,
        };

        try {
            const result = await transporter.sendMail(mailOptions);
            console.log("e-mail enviado com sucesso!");
            return response.json(result);
        } catch (error) {
            console.error("Erro ao enviar e-mail:", error);
            return response.status(500).json({ error: "Erro ao enviar e-mail" });
        }
    }

    async updatePassword(request: Request, response: Response) {
        try {
            const { code, pass, confirmPass } = request.body;
            if (!pass || !confirmPass) {
                return response.status(400).json({ error: "Fill in the mandatory fields" });

            }

            if (pass != confirmPass) {
                return response.status(400).json({ error: "Passwords do not match" });
            }
            const password = bcrypt.hashSync(pass, 10)

            const user = await prisma.user.findUnique({
                where: {
                    token_recover_password: code
                }
            })

            if (!user) {
                return response.status(400).json({ error: "Invalid recovery code" });
            }

            const result = await prisma.user.update({
                where: {
                    email: user.email
                },
                data: {
                    token_recover_password: null,
                    password: password
                }
            })
            return response.json(result);


        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal error" });
        }

    }

    async serchOfficeUser(request: Request, response: Response) {
        try {
            const result = await prisma.office.findMany({
                select: {
                    id: true,
                    name: true,
                }
            });
            return response.json(result);
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal error" });
        }
    }


}
