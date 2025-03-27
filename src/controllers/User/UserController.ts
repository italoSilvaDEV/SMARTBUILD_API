import bcrypt from "bcrypt";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import Jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { RecoverPassword } from "../../templateEmail/recoverPassword";
import { INewUser } from "../../DTOs/IUser";
import { deleteFile } from "../../config/file";
import { validationResult } from "express-validator";
import { NewUser } from "../../templateEmail/newUser";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";

import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import S3Storage from "../../utils/S3/s3Storage";


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
    const filePath = req.file?.filename?.split(".")[0] + ".webp"; // Caminho do arquivo
    const s3Bucket = process.env.AMAZON_S3_BUCKET!;
    let fileName: string | null = null;
    try {
      // const fileName = await uploadImageWebpToS3(`./public/tmp/user/${filePath}`, s3Bucket);
      if (req.file) {
        fileName = await uploadImageWebpToS3(`./public/tmp/user/${filePath}`, s3Bucket);
      }
      // console.log('Upload concluído:', fileName);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        this.deleteFiles(
          req.file?.filename?.split(".")[0] + ".webp",
          req.file?.filename
        );
        return res.status(400).json({ errors: errors.array() });
      }

      const data: INewUser = req.body;
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

      // const documentExists = await prisma.user.findUnique({
      //   where: { document: data.document },
      // });
      // if (documentExists) {
      //   this.deleteFiles(
      //     req.file?.filename?.split(".")[0] + ".webp",
      //     req.file?.filename
      //   );
      //   return res.status(400).json({
      //     error: "Document has already been registered in the system",
      //   });
      // }

      // Verificar se o office existe
      const office = await prisma.user.findMany({
        where: { office_id: data.office_id },
      });
      if (!office) {
        this.deleteFiles(
          req.file?.filename?.split(".")[0] + ".webp",
          req.file?.filename
        );
        return res.status(400).json({ error: "office invalid" });
      }

      // Senha temporária
      const pass = crypto.randomBytes(3).toString("hex").toUpperCase();
      const hashedPassword = bcrypt.hashSync(pass, 10);

      // Email
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465, // true for 465, false for other ports
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: { rejectUnauthorized: false },
      });


      await prisma.user.create({
        data: {
          avatar: String(fileName),
          name: data.name,
          email: data.email,
          document: data.document,
          phone: data.phone,
          city_and_state: data.city_and_state,
          rules: JSON.stringify(data.rules) || {},
          office_id: data.office_id,
          password: hashedPassword,
          hourly_price: Number(data.hourly_price) || 0,
          profession: data.profession,
          company_id: data.company_id
        },
      });


      const company = await prisma.company.findUnique({
        where: {
          id: data.company_id
        },
        select: {
          avatar: true
        }
      });
      const urlLogo = company?.avatar ? await getPresignedUrl(company.avatar) : '';
      const templateEmail = NewUser(data.name.toUpperCase(), urlLogo, pass);
      const mailOptions = {
        from: SMTP_CONFIG.user,
        to: data.email,
        subject: "Smart Build",
        html: templateEmail,
      };
      deleteFile(`./public/tmp/user/${req.file?.filename}`);
      await transporter.sendMail(mailOptions);

      return res.status(201).json({ message: "User created successfully" });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message || "Internal error" });
    }
    // })
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
      }

      const user = await prisma.user.findUnique({
        select: {
          id: true,
          name: true,
          avatar: true,
          password: true,
          email: true,
          rules: true,
          isDisabled: true,
          office: {
            select: {
              id: true,
              name: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              planId: true,
            }
          }
        },
        where: {
          email,
        },
      });

      if (!user) {
        return res.status(400).json({ error: "User or password invalid!" });
      }

      if (user.isDisabled) {
        return res.status(403).json({ error: "Access denied!" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(400).json({ error: "User or password invalid!" });
      }

      // Gerar URL assinada para o avatar, se existir
      const avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null;

      // Buscar informações do plano e assinatura
      let planInfo = null;
      let subscriptionInfo = null;
      let isExpired = false;
      let permissions: string[] = [];

      if (user.company?.id) {
        // Buscar o plano da empresa
        if (user.company.planId) {
          const plan = await prisma.plan.findUnique({
            where: { id: user.company.planId },
            include: {
              permissionGroup: {
                include: {
                  GroupPermissionsList: {
                    include: {
                      Permissions: true
                    }
                  }
                }
              }
            }
          });
          
          planInfo = plan;
          
          // Obter as permissões do grupo de permissões associado ao plano
          if (plan?.permissionGroup?.GroupPermissionsList) {
            permissions = plan.permissionGroup.GroupPermissionsList.map(item => item.Permissions.description);
          }
        }

        // Buscar a assinatura ativa mais recente
        const subscription = await prisma.subscription.findFirst({
          where: { 
            companyId: user.company.id,
            isActive: true
          },
          orderBy: {
            endDate: 'desc'
          },
          include: {
            plan: true
          }
        });

        subscriptionInfo = subscription;
        
        // Verificar se o plano expirou
        if (subscription) {
          isExpired = new Date(subscription.endDate) < new Date();
        } else if (planInfo && planInfo.validityType === 'DAYS') {
          // Para planos trial, verificar se já passou o período de validade
          const company = await prisma.company.findUnique({
            where: { id: user.company.id }
          });
          
          if (company && company.date_creation) {
            const trialEndDate = new Date(company.date_creation);
            trialEndDate.setDate(trialEndDate.getDate() + planInfo.validityDuration);
            isExpired = trialEndDate < new Date();
          }
        }
        
        // Se o plano expirou, verificar se o usuário é administrador
        if (isExpired) {
          // Verificar se o usuário é administrador
          const isAdmin = user.office.name.toLowerCase() === 'administrador' || 
                          user.office.name.toLowerCase() === 'administrator';
          
          // Se não for administrador, bloquear o acesso
          if (!isAdmin) {
            return res.status(403).json({ 
              error: "Your subscription has expired. Please renew your plan to continue using the system.",
              isExpired: true,
              plan: planInfo,
              subscription: subscriptionInfo
            });
          }
          // Se for administrador, continua o login mas informa sobre a expiração
        }
      }

      const token = Jwt.sign(
        {
          id: user.id,
          name: user.name,
        },
        String(process.env.SECRET_JWT),
        {
          subject: user.id,
          expiresIn: "1d",
        }
      );

      return res.json({
        msg: "Authentication completed successfully!",
        token,
        rules: user.office.name,
        user: {
          id: user.id,
          email: user.email,
          avatar: avatarUrl,
          name: user.name,
          office: user.office,
          company: user.company,
          permissions: permissions
        },
        subscription: subscriptionInfo,
        isExpired: isExpired
      });
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
      city_and_state,
      office,
      phone,
      current_password,
      password,
      profession,
      hourly_price,
      confirm_password,
      isDisabled,
    } = request.body;

    // Função de validação
    function validateUserData(data: any): string | null {
      if (!data.name) return "Name is required";
      if (!data.email) return "Email is required";
      if (!data.office.id) return "Office ID is required";
      return null;
    }

    const validationError = validateUserData(request.body);
    if (validationError) {
      return response.status(400).json({ error: validationError });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id },
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
          where: { email },
        });
        if (emailExists) {
          return response
            .status(400)
            .json({ error: "Email already registered" });
        }
      }

      

      if (current_password && password) {
        const checkPassword = await bcrypt.compare(
          current_password,
          user.password
        );

        if (!checkPassword) {
          return response
            .status(400)
            .json({ error: "Invalid current password!" });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        await prisma.user.update({
          where: { id },
          data: {
            name,
            email,
            password: hashedPassword,
            city_and_state,
            office_id: office.id,
            phone,
            hourly_price,
            profession,
            isDisabled,
          },
        });
      } else {
        await prisma.user.update({
          where: { id },
          data: {
            name,
            email,
            city_and_state,
            office_id: office.id,
            phone,
            hourly_price,
            profession,
            isDisabled,
          },
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

  async updateUserProfile(request: Request, response: Response) {
    const {
      id,
      name,
      email,
      phone,
      phone_emergency,
      zip_code,
      city_and_state,
      state,
      number_road,
      number_home,
      neighborhood,
    } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return response.status(404).json({ error: "User not found" });

      await prisma.user.update({
        where: { id },
        data: {
          name,
          email,
          phone,
          phone_emergency,
          zip_code,
          city_and_state,
          state,
          number_road,
          number_home,
          neighborhood,
        },
      });

      return response.json({ message: "User updated successfully" });
    } catch (error: any) {
      return response
        .status(500)
        .json({ error: error.message || "Internal Server Error" });
    }
  }

  async updateImg(request: Request, response: Response) {
    try {
      const { id } = request.params;

      if (!request.file) {
        return response.status(400).json({ error: "No file uploaded" });
      }
      const filePath = request.file?.filename?.split(".")[0] + ".webp"; // Caminho do arquivo
      const s3Bucket = process.env.AMAZON_S3_BUCKET!;

      const file = `${request.file.filename.split(".")[0]}.webp`;

      const user = await prisma.user.findUnique({
        where: {
          id,
        },
      });

      if (!user) {
        this.deleteFiles(file, request.file.filename);
        return response.status(404).json({ error: "Invalid ID" });
      }
      const fileName = await uploadImageWebpToS3(`./public/tmp/user/${filePath}`, s3Bucket);

      const updatedUser = await prisma.user.update({
        where: {
          id,
        },
        data: {
          avatar: fileName,
        },
      });

      if (user.avatar) {
        deleteFile(`./public/tmp/user/${user.avatar}`);
      }
      deleteFile(`./public/tmp/user/${request.file.filename}`);
      const urlAvatar = updatedUser.avatar ? await getPresignedUrl(updatedUser.avatar) : null

      return response.status(200).json({
        avatar: urlAvatar,
        message: "Avatar updated successfully",
      });
    } catch (error: any) {
      if (error instanceof Error) {
        return response.status(500).json({ error: error.message });
      }
      return response.status(500).json({ error: "Internal error" });
    }
  }

  async searchOneUser(request: Request, response: Response) {
    try {
      let { id } = request.params;
      const result = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          phone: true,
          document: true,
          city_and_state: true,
          hourly_price: true,
          profession: true,
          isDisabled: true,
          office: {
            select: {
              id: true,
              name: true,
            },
          },
          seller_project: {
            select: {
              status_project: true,
              serviceProject: {
                select: {
                  hours: true,
                  price: true,
                },
              },
              client: {
                select: {
                  name: true,
                  city_and_state: true,
                },
              },
            },
          },
        },
      });
      if (!result) {
        throw Error("User not found!");
      }
      const formattedResult = {
        ...result,
        avatar: result.avatar ? await getPresignedUrl(result.avatar) : null,
        seller_project: result?.seller_project.map((project) => {
          const price_project = project.serviceProject.reduce(
            (total, service) => {
              return total + Number(service.hours) * Number(service.price);
            },
            0
          );

          return {
            status_project: project.status_project,
            price_project,
            client: project.client,
          };
        }),
      };

      return response.json(formattedResult);
    } catch (error) {
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Erro interno do servidor" });
    }
  }
  // APP
  async getUserDetails(request: Request, response: Response) {
    try {
      const { id } = request.params;

      // Consulta o usuário no banco de dados
      const result = await prisma.user.findUnique({
        where: { id },
        select: {
          name: true,
          email: true,
          phone: true,
          phone_emergency: true,
          zip_code: true,
          city_and_state: true,
          state: true,
          number_road: true,
          number_home: true,
          neighborhood: true,
          avatar: true,
        },
      });

      // Verifica se o usuário foi encontrado
      if (!result) {
        throw new Error("User not found!");
      }

      // Formata o resultado e obtém o link do avatar (se houver)
      const formattedResult = {
        ...result,
        avatar: result.avatar && result.avatar !== "null" ? await getPresignedUrl(result.avatar) : null,
      };

      return response.json(formattedResult);
    } catch (error) {
      if (error instanceof Error) {
        return response.status(400).json({ error: error.message });
      }
      return response.status(500).json({ error: "Erro interno do servidor" });
    }
  }

  async serchAllUser(request: Request, response: Response) {
    const { name, email, pag, company_id } = request.body;

    const filtro: any = {};
    const name_full: any = {};

    if (name) {
      name_full.name = { contains: name };
    }
    if (email) {
      filtro.email = { contains: email };
    }

    const result = await prisma.user.findMany({
      skip: Number(pag) * 8,
      take: 8,
      orderBy: {
        //name: "asc"
        date_creation: "desc",
      },
      where: {
        AND: [filtro, { OR: [name_full] }, {
          company_id
        }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        document: true,
        isDisabled: true,
        office: {
          select: {
            name: true,
          },
        },
        city_and_state: true,
        hourly_price: true
      },
    });

    // Processar URLs dos avatares
    const usersWithPresignedAvatar = await Promise.all(
      result.map(async (user) => ({
        ...user,
        avatar: user.avatar ? await getPresignedUrl(user.avatar) : null, // Gera URL assinada
      }))
    );

    const total = await prisma.user.count({
      where: {
        AND: [filtro, { OR: [name_full] }],
      },
    });

    return response.json({ users: usersWithPresignedAvatar, total });
  }

  async delete(request: Request, response: Response) {
    try {
      let { id } = request.params;

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new Error("User not found!");
      }

      await prisma.user.delete({
        where: {
          id: id,
        },
      });
      if (user.avatar) {
        const s3 = new S3Storage()
        await s3.deleteFile(user.avatar);
      }
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
        email,
      },
      include: {
        company: true
      }
    });

    if (!user) {
      return response.status(400).json({ error: "User not found!" });
    }
    const token = crypto.randomBytes(3).toString("hex").toUpperCase();
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        token_recover_password: token,
      },
    });

    const SMTP_CONFIG = require("../../config/smtp");

    const transporter = nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: SMTP_CONFIG.port === 465, // true for 465, false for other ports
      auth: {
        user: SMTP_CONFIG.user,
        pass: SMTP_CONFIG.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verificar a configuração do transportador
    transporter.verify((error, success) => {
      if (error) {
        console.error("Erro ao configurar o transportador de e-mail:", error);
      } else {
        console.log(
          "Transportador de e-mail configurado com sucesso:",
          success
        );
      }
    });
    const logo = user.company?.avatar ? await getPresignedUrl(user.company.avatar) : '';

    const templateEmail = RecoverPassword(user.name.toUpperCase(), logo, token);
    const mailOptions = {
      from: SMTP_CONFIG.user,
      to: email,
      subject: "Smart Build - Password Reset",
      html: templateEmail,
    };

    try {
      const result = await transporter.sendMail(mailOptions);
      console.log("e-mail enviado com sucesso!");
      return response.json({ message: "Email sent successfully" });
    } catch (error) {
      console.error("Erro ao enviar e-mail:", error);
      return response.status(500).json({ error: "Erro ao enviar e-mail" });
    }
  }
  async validCode(request: Request, response: Response) {
    try {
      const { code } = request.body;

      const user = await prisma.user.findUnique({
        where: {
          token_recover_password: code,
        },
      });
      if (user) {
        return response.status(200).json();
      }

      return response.status(400).json({ error: "Invalid recovery code" });
    } catch (error) {
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Internal error" });
    }
  }
  async updatePassword(request: Request, response: Response) {
    try {
      const { code, pass, confirmPass } = request.body;
      if (!pass || !confirmPass) {
        return response
          .status(400)
          .json({ error: "Fill in the mandatory fields" });
      }

      if (pass != confirmPass) {
        return response.status(400).json({ error: "Passwords do not match" });
      }
      const password = bcrypt.hashSync(pass, 10);

      const user = await prisma.user.findUnique({
        where: {
          token_recover_password: code,
        },
      });

      if (!user) {
        return response.status(400).json({ error: "Invalid recovery code" });
      }

      const result = await prisma.user.update({
        where: {
          email: user.email,
        },
        data: {
          token_recover_password: null,
          password: password,
        },
      });
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
        },
      });
      return response.json(result);
    } catch (error) {
      if (error instanceof Error) {
        return response.json({ error: error.message });
      }
      return response.json({ error: "Internal error" });
    }
  }

  async updateUserEmailAndSendPassword(req: Request, res: Response) {
    try {
      const { userId, email } = req.body;

      if (!userId || !email) {
        return res.status(400).json({ error: "User ID and email are required" });
      }

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          company: {
            select: {
              avatar: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verificar se o email já existe para outro usuário
      const emailExists = await prisma.user.findFirst({
        where: {
          email,
          id: { not: userId }
        }
      });

      if (emailExists) {
        return res.status(400).json({ error: "Email has already been registered in the system" });
      }

      // Gerar nova senha aleatória
      const newPassword = crypto.randomBytes(3).toString("hex").toUpperCase();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);

      // Atualizar o email e a senha do usuário
      await prisma.user.update({
        where: { id: userId },
        data: {
          email,
          password: hashedPassword
        }
      });

      // Configurar e enviar email
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: { rejectUnauthorized: false },
      });

      // Obter URL do logo da empresa
      const urlLogo = user.company?.avatar ? await getPresignedUrl(user.company.avatar) : '';
      
      // Criar template de email
      const templateEmail = NewUser(user.name.toUpperCase(), urlLogo, newPassword);
      
      // Enviar email
      await transporter.sendMail({
        from: SMTP_CONFIG.user,
        to: email,
        subject: "Smart Build - Email Updated",
        html: templateEmail,
      });

      return res.status(200).json({ message: "Email updated and password sent successfully" });
    } catch (error) {
      console.error("Error updating email:", error);
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      });
    }
  }

}
