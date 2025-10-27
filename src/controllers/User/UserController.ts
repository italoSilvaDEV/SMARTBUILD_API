import bcrypt from "bcrypt";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import Jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { RecoverPassword } from "../../templateEmail/recoverPassword";
import { CompanyInvitation } from "../../templateEmail/companyInvitation";
import { INewUser } from "../../DTOs/IUser";
import { deleteFile } from "../../config/file";
import { validationResult } from "express-validator";
import { NewUser } from "../../templateEmail/newUser";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";

import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import S3Storage from "../../utils/S3/s3Storage";
import { stripeConfig } from "../../config/stripe";
import { isMultiCompanyEnabled } from "../../helpers/featureToggle";


export class UserController {
  constructor() {
    this.create = this.create.bind(this);
    this.deleteFiles = this.deleteFiles.bind(this);
  }

  deleteFiles(file: string, requestFile: string | undefined) {
    deleteFile(`./public/tmp/user/${file}`);
    deleteFile(`./public/tmp/user/${requestFile}`);
  }
  // criar
  async create(req: Request, res: Response) {
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Verificar o limite de funcionários
    const { company_id } = req.body;
    const isMultiCompany = await isMultiCompanyEnabled();
    if (company_id) {
      try {

        const company = await prisma.company.findUnique({
          where: { id: company_id },
          select: { allowedEmployees: true, extraEmployees: true }
        });
        if (company) {
          const allowedEmployees = company.allowedEmployees || 0;
          const extraEmployees = company.extraEmployees || 0;
          const maxEmployees = allowedEmployees + extraEmployees;

          const whereCount = isMultiCompany
            ? { companies: { some: { companyId: company_id } } }
            : { company_id };

          const currentEmployeesCount = await prisma.user.count({ where: whereCount });
          if (currentEmployeesCount >= maxEmployees) {
            return res.status(400).json({
              error: `Unable to create new user. Company has reached the maximum number of employees allowed (${maxEmployees}).`
            });
          }
        }
        console.timeEnd(`[create][${reqId}] employee-limit-check`);
      } catch (error) {
        console.error(`[create][${reqId}] Error verifying employee limit:`, error);
        // continua
      }
    }

    function validateNewUser(data: INewUser): string | null {
      if (!data.name) return "Name is required";
      if (!data.email) return "Email is required";
      if (!data.office_id) return "Office ID is required";
      return null;
    }

    const filePath = req.file?.filename?.split(".")[0] + ".webp";
    const s3Bucket = process.env.AMAZON_S3_BUCKET!;
    let fileName: string | null = null;

    try {
      // Upload opcional
      if (req.file) {
        fileName = await uploadImageWebpToS3(`./public/tmp/user/${filePath}`, s3Bucket);
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        this.deleteFiles(req.file?.filename?.split(".")[0] + ".webp", req.file?.filename);
        return res.status(400).json({ errors: errors.array() });
      }

      const data: INewUser = req.body;

      const validationError = validateNewUser(data);
      if (validationError) {
        this.deleteFiles(req.file?.filename?.split(".")[0] + ".webp", req.file?.filename);
        return res.status(400).json({ error: validationError });
      }


      const office = await prisma.user.findMany({ where: { office_id: data.office_id } });

      if (!office) {
        this.deleteFiles(req.file?.filename?.split(".")[0] + ".webp", req.file?.filename);
        return res.status(400).json({ error: "office invalid" });
      }

      // Verifica se o email existe
      const userExists = await prisma.user.findUnique({ where: { email: data.email } });

      if (userExists) {
        const userCompany = await prisma.userCompany.findFirst({
          where: { userId: userExists.id, companyId: company_id }
        });
        if (userCompany) {
          this.deleteFiles(req.file?.filename?.split(".")[0] + ".webp", req.file?.filename);
          return res.status(400).json({ error: "Email has already been registered in the system" });
        }

        const uc = await prisma.userCompany.create({
          data: { userId: userExists.id, companyId: company_id, office_id: data.office_id }
        });

        // Buscar informações da empresa para o email
        const company = await prisma.company.findUnique({
          where: { id: company_id },
          select: { name: true, avatar: true }
        });

        if (company) {
          // SMTP
          const SMTP_CONFIG = require("../../config/smtp");
          const transporter = nodemailer.createTransport({
            host: SMTP_CONFIG.host,
            port: SMTP_CONFIG.port,
            secure: SMTP_CONFIG.port === 465,
            auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
            tls: { rejectUnauthorized: false },
          });

          const urlLogo = company.avatar ? await getPresignedUrl(company.avatar) : '';

          const templateEmail = CompanyInvitation(userExists.name.toUpperCase(), urlLogo, company.name);
          const mailOptions = {
            from: SMTP_CONFIG.user,
            to: userExists.email,
            subject: "Smart Build - Access to New Company",
            html: templateEmail,
          };

          try {
            await transporter.sendMail(mailOptions);
            console.log(`[create][${reqId}] Email de convite enviado para ${userExists.email}`);
          } catch (mailErr) {
            console.error(`[create][${reqId}] Erro ao enviar email de convite:`, mailErr);
            // Não retorna erro, pois o usuário foi criado com sucesso
          }
        }

        return res.status(201).json({ message: "User created successfully" });
      }

      // Senha temporária
      const pass = crypto.randomBytes(3).toString("hex").toUpperCase();
      const hashedPassword = bcrypt.hashSync(pass, 10);

      // SMTP

      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
        tls: { rejectUnauthorized: false },
      });
      transporter.verify((error, success) => {
        if (error) console.error(`[create][${reqId}] transporter.verify ERROR:`, error);
        else console.log(`[create][${reqId}] transporter.verify OK:`, success);
      });

      // Criação do usuário
      const user = await prisma.user.create({
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
          ...(!isMultiCompany && { company_id: data.company_id })
        },
      });


      if (isMultiCompany) {
        const ucNew = await prisma.userCompany.create({
          data: { companyId: data.company_id, userId: user.id, office_id: data.office_id },
        });
      }

      // Buscar logo da company
      const company = await prisma.company.findUnique({
        where: { id: data.company_id },
        select: { avatar: true }
      });
      const urlLogo = company?.avatar ? await getPresignedUrl(company.avatar) : '';
      // Monta e envia e-mail
      const templateEmail = NewUser(data.name.toUpperCase(), urlLogo, pass);
      const mailOptions = {
        from: SMTP_CONFIG.user,
        to: data.email,
        subject: "Smart Build",
        html: templateEmail,
      };

      // apagar tmp
      if (req.file?.filename) {
        deleteFile(`./public/tmp/user/${req.file.filename}`);
      }

      try {
        const result = await transporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.error(`[create][${reqId}] email SEND ERROR:`, mailErr);
        // segue retorno 201 mesmo assim? (mantive sua lógica atual de sucesso antes do send)
      }

      return res.status(201).json({ message: "User created successfully" });
    } catch (error: any) {
      console.error(`[create][${reqId}] CATCH ERROR:`, error);
      return res.status(500).json({ error: error.message || "Internal error" });
    }
  }

  async authenticateAtualSemPermissoes(req: Request, res: Response) {
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
          company: true
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

      await prisma.user.update({
        where: { id: user.id },
        data: { last_acess: new Date() },   // Use new Date() para o horário atual
      });

      // Gerar URL assinada para o avatar, se existir
      const avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null;

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

      // return res.json({ user, token });
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
          company: user.company

        },
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.json({ error: error.message });
      }
      return res.json({ error: "Internal error" });
    }
  }
  // essa rota que vai ser usada agora pois ela trabalha com as permissões
  async authenticate(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "User or password is required!" });
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          office: true,
          company: {
            include: {
              Plan: true
            }
          }
        }
      });

      if (!user) {
        return res.status(400).json({ error: "User or password invalid!" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "User or password invalid" });
      }

      // Verificar se o usuário está desativado
      if (user.isDisabled) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Atualizar último acesso
      await prisma.user.update({
        where: { id: user.id },
        data: { last_acess: new Date() }
      });

      // Gerar URL assinada para o avatar, se existir
      const avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null;

      // Verificar plano e assinatura
      let planInfo = null;
      let subscriptionInfo = null;
      let isExpired = false;
      let stripeSubscriptionCanceled = false;
      let paymentFailed = false;
      let permissions: string[] = [];

      if (user.company?.id) {

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

          // Obter as permissões do grupo de permissões associado ao plano
          if (plan?.permissionGroup?.GroupPermissionsList) {
            permissions = plan.permissionGroup.GroupPermissionsList.map(item => item.Permissions.description);
          }
        }


        // Obter informações do plano
        planInfo = user.company.Plan ? {
          id: user.company.Plan.id,
          name: user.company.Plan.name,
          validityType: user.company.Plan.validityType,
          validityDuration: user.company.Plan.validityDuration,
          stripePriceId: user.company.Plan.stripePriceId,
          stripeProductId: user.company.Plan.stripeProductId
        } : null;

        // Buscar assinatura local
        const subscription = await prisma.subscription.findFirst({
          where: {
            companyId: user.company.id,
            // isActive: true
          },
          orderBy: { endDate: 'desc' }
        });
        subscriptionInfo = subscription;

        // Lógica simplificada para verificação de planos e assinaturas
        if (!planInfo) {
          // Sem plano definido, considerar expirado
          isExpired = true;
        }
        else if (planInfo.validityType === 'FREE') {
          // Plano FREE nunca expira
          // isExpired = false;
          if (subscription) {
            isExpired = new Date(subscription.endDate) < new Date();
          } else {
            // Sem assinatura para plano FREE, considerar expirado
            isExpired = true;
          }
        }
        else {
          // Para planos PAGOS (não-FREE)
          if (!subscription || !subscription.stripeSubscriptionId) {
            // Sem assinatura ou sem stripeSubscriptionId, considerar expirado
            isExpired = true;
          }
          else {
            try {
              // Inicializar cliente Stripe
              const stripe = stripeConfig.getClient();

              // Buscar a assinatura específica pelo ID salvo no banco
              const stripeSubscription = await stripe.subscriptions.retrieve(
                subscription.stripeSubscriptionId
              );

              // Verificar se a assinatura foi cancelada
              if (stripeSubscription.status === 'canceled') {
                stripeSubscriptionCanceled = true;
              }

              // Verificar status da assinatura
              if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
                // Verificar se tem data de cancelamento programada
                isExpired = stripeSubscription.cancel_at
                  ? new Date(stripeSubscription.cancel_at * 1000) < new Date()
                  : false;
              } else {
                // Status inativo (canceled, unpaid, incomplete_expired, etc)
                isExpired = true;
              }

              // Verificar se a assinatura tem problema de pagamento no banco
              if (stripeSubscription.status === 'past_due' || stripeSubscription.status === 'unpaid') {
                paymentFailed = true;
              }

              console.log(`Assinatura Stripe verificada: ${stripeSubscription.id}, status: ${stripeSubscription.status}, cancelada: ${stripeSubscriptionCanceled}, pagamento falho: ${paymentFailed}`);
            }
            catch (stripeError) {
              console.error('Erro ao verificar assinatura no Stripe:', stripeError);
              // Fallback para verificação local em caso de erro
              isExpired = new Date(subscription.endDate) < new Date();
            }
          }
        }

        // Se o plano expirou e o usuário não é administrador, bloquear acesso
        const isAdmin = user.office.name.toLowerCase() === 'administrator';
        if (isExpired && !isAdmin) {
          return res.status(403).json({
            error: "Sua assinatura expirou. Por favor, renove seu plano para continuar usando o sistema."
          });
        }
      }

      const token = Jwt.sign(
        {
          id: user.id,
          name: user.name,
          email: user.email
        },
        String(process.env.SECRET_JWT),
        {
          expiresIn: "30d"
        }
      );

      // Formatar resposta
      return res.json({
        msg: "Authentication completed successfully!",
        token,
        rules: user.office.name,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: avatarUrl,
          document: user.document,
          city_and_state: user.city_and_state,
          office: user.office,
          phone: user.phone,
          hourly_price: user.hourly_price,
          profession: user.profession,
          company: {
            id: user.company?.id,
            name: user.company?.name,
          },
          plan: planInfo,
          permissions: permissions,
          last_acess: user.last_acess,
          subscription: subscriptionInfo,
          isExpired,
          stripeSubscriptionCanceled,
          paymentFailed
        },
        subscription: subscriptionInfo,
        isExpired,
        stripeSubscriptionCanceled,
        paymentFailed
      });
    } catch (error) {
      console.error("Erro na autenticação:", error);
      return res.status(500).json({ error: "Erro interno do servidor" });
    }
  }

  async update(request: Request, response: Response) {
    const {
      id,
      name,
      email,
      company_id,
      city_and_state,
      office,
      phone,
      current_password,
      password,
      profession,
      hourly_price,
      confirm_password,
      isDisabled,
      isOverTime,
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
      // if (email !== user.email) {
      //   const emailExists = await prisma.user.findUnique({
      //     where: { email },
      //   });
      //   if (emailExists) {
      //     return response
      //       .status(400)
      //       .json({ error: "Email already registered" });
      //   }
      // }

      // Check if email is different and already in use in the same company
      if (email !== user.email) {
        const userWithEmail = await prisma.user.findUnique({
          where: { email },
        });

        if (userWithEmail && user.company_id) {
          const userCompany = await prisma.userCompany.findFirst({
            where: {
              userId: userWithEmail.id,
              companyId: user.company_id // ou passe company_id via body, se necessário
            }
          });

          if (userCompany) {
            return response.status(400).json({
              error: "Email has already been registered in the system for this company"
            });
          }
          await prisma.userCompany.create({
            data: {
              userId: userWithEmail.id,
              companyId: user.company_id,
              office_id: office.id,
            },
          });
        }
      }

      if (office && company_id) {
        await prisma.userCompany.update({
          where: {
            userId_companyId: {
              userId: user.id,
              companyId: company_id
            }
          },
          data: {
            office_id: office.id,
          }
        })
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
            phone,
            hourly_price,
            profession,
            isDisabled,
            isOverTime,
          },
        });
      } else {
        await prisma.user.update({
          where: { id },
          data: {
            name,
            email,
            city_and_state,
            phone,
            hourly_price,
            profession,
            isDisabled,
            isOverTime,
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
      let { id, company_id } = request.params;
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
          isOverTime: true,
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

      const userCompany = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: id,
            companyId: company_id
          }
        },
        select: {
          office: true
        }
      })

      if (!result) {
        throw Error("User not found!");
      }

      const formattedResult = {
        ...result,
        office: userCompany?.office,
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
    const { name, email, company_id } = request.body;
    const isMultiCompany = await isMultiCompanyEnabled()
    const filtro: any = {};
    const name_full: any = {};

    if (name) {
      name_full.name = { contains: name };
    }
    if (email) {
      filtro.email = { contains: email };
    }

    // Condição de filtro completa incluindo company_id
    const whereCondition = {
      AND: [filtro, { OR: [name_full] }, isMultiCompany ? { companies: { some: { companyId: company_id } } } : { company_id }]
    };

    const result = await prisma.user.findMany({
      orderBy: {
        name: "asc",
      },
      where: whereCondition,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        document: true,
        isDisabled: true,
        city_and_state: true,
        hourly_price: true
      },
    });

    const userWithOffice = await Promise.all(result.map(async (user) => {
      const userCompany = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: company_id
          }
        },
        select: {
          office: true
        }
      })

      return {
        ...user,
        avatar: user.avatar ? await getPresignedUrl(user.avatar) : null,
        office: userCompany?.office
      }
    }))

    const total = await prisma.user.count({
      where: whereCondition
    });

    return response.json({
      users: userWithOffice,
      total
    });
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
        where: {
          name: {
            not: "Master" // Excluir office com nome "Master"
          }
        },
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

  async getSubscriptionStatus(req: Request, res: Response) {
    try {
      const userIdFromParam = req.params.userId;
      const userId = userIdFromParam;

      if (!userId) {
        return res.status(401).json({ error: "ID de usuário não fornecido e usuário não autenticado" });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          company: {
            include: {
              Plan: {
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
              }
            }
          }
        }
      });

      if (!user || !user.company?.id) {
        return res.status(404).json({ error: "Usuário ou empresa não encontrados" });
      }

      let subscriptionInfo = null;
      let isExpired = false;
      let stripeSubscriptionCanceled = false;
      let planInfo = null;
      let paymentFailed = false;
      let permissions: string[] = [];

      // Obter permissões do plano
      if (user.company.Plan?.permissionGroup?.GroupPermissionsList) {
        permissions = user.company.Plan.permissionGroup.GroupPermissionsList.map(item => item.Permissions.description);
      }

      // Obter informações do plano
      planInfo = user.company.Plan ? {
        id: user.company.Plan.id,
        name: user.company.Plan.name,
        validityType: user.company.Plan.validityType,
        validityDuration: user.company.Plan.validityDuration,
        stripePriceId: user.company.Plan.stripePriceId,
        stripeProductId: user.company.Plan.stripeProductId
      } : null;

      // Buscar assinatura local
      const subscription = await prisma.subscription.findFirst({
        where: {
          companyId: user.company.id,
        },
        orderBy: { endDate: 'desc' }
      });

      subscriptionInfo = subscription;

      // Lógica simplificada para verificação de planos e assinaturas
      if (!planInfo) {
        // Sem plano definido, considerar expirado
        isExpired = true;
      }
      else if (planInfo.validityType === 'FREE') {
        // Para planos FREE, verificar data de expiração na assinatura local
        if (subscription) {
          isExpired = new Date(subscription.endDate) < new Date();
        } else {
          // Sem assinatura para plano FREE, considerar expirado
          isExpired = true;
        }
      }
      else {
        // Para planos PAGOS (não-FREE)
        if (!subscription || !subscription.stripeSubscriptionId) {
          // Sem assinatura ou sem stripeSubscriptionId, considerar expirado
          isExpired = true;
        }
        else {
          try {
            // Inicializar cliente Stripe
            const stripe = stripeConfig.getClient();

            // Buscar a assinatura específica pelo ID salvo no banco
            const stripeSubscription = await stripe.subscriptions.retrieve(
              subscription.stripeSubscriptionId
            );

            // Verificar se a assinatura foi cancelada
            if (stripeSubscription.status === 'canceled') {
              stripeSubscriptionCanceled = true;
            }

            // Verificar status da assinatura
            if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
              // Verificar se tem data de cancelamento programada
              isExpired = stripeSubscription.cancel_at
                ? new Date(stripeSubscription.cancel_at * 1000) < new Date()
                : false;
            } else {
              // Status inativo (canceled, unpaid, incomplete_expired, etc)
              isExpired = true;
            }

            // Verificar se a assinatura tem problema de pagamento no banco
            if (stripeSubscription.status === 'past_due' || stripeSubscription.status === 'unpaid') {
              paymentFailed = true;

              // Atualizar no banco se identificamos pelo Stripe
              if (!subscription.paymentFailed) {
                await prisma.subscription.update({
                  where: { id: subscription.id },
                  data: { paymentFailed: true }
                });
              }
            }

            console.log(`Assinatura Stripe verificada: ${stripeSubscription.id}, status: ${stripeSubscription.status}, cancelada: ${stripeSubscriptionCanceled}, pagamento falho: ${paymentFailed}`);
          }
          catch (stripeError) {
            console.error('Erro ao verificar assinatura no Stripe:', stripeError);
            // Fallback para verificação local em caso de erro
            isExpired = new Date(subscription.endDate) < new Date();
          }
        }
      }

      // Retornar apenas os dados solicitados
      return res.json({
        subscription: subscriptionInfo,
        isExpired,
        stripeSubscriptionCanceled,
        paymentFailed,
        permissions
      });

    } catch (error) {
      console.error("Erro ao verificar status da assinatura:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Erro interno do servidor"
      });
    }
  }

  async getLocalSubscriptionsStatus(req: Request, res: Response) {
    try {
      const { userId, company_id } = req.params;

      if (!userId || !company_id) {
        return res.status(401).json({
          error: "ID de usuário não fornecido e usuário não autenticado"
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          company: {
            include: {
              Plan: {
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
              }
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          error: "Usuário ou empresa não encontrados"
        });
      }

      // Buscar informações da empresa correta com o plano
      const company = await prisma.company.findUnique({
        where: { id: company_id },
        include: {
          Plan: {
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
          }
        }
      });

      // Obter permissões do plano
      let permissions: string[] = [];
      if (company?.Plan?.permissionGroup?.GroupPermissionsList) {
        permissions = company.Plan.permissionGroup.GroupPermissionsList.map(item => item.Permissions.description);
      }

      // Obter informações do plano
      const planInfo = company?.Plan ? {
        id: company.Plan.id,
        name: company.Plan.name,
        validityType: company.Plan.validityType,
        validityDuration: company.Plan.validityDuration,
        stripePriceId: company.Plan.stripePriceId,
        stripeProductId: company.Plan.stripeProductId
      } : null;

      // Buscar a assinatura mais recente pelo startDate usando o company_id do parâmetro
      const subscription = await prisma.subscription.findFirst({
        where: {
          companyId: company_id,
        },
        orderBy: { startDate: 'desc' }
      });

      // Definir valores padrão
      let isExpired = true;
      let stripeSubscriptionCanceled = false;
      let paymentFailed = false;


      // Lógica de verificação de planos e assinaturas
      if (!planInfo) {
        // Sem plano definido, considerar expirado
        isExpired = true;
      }
      else if (planInfo.validityType === 'FREE') {
        // Para planos FREE, verificar data de expiração na assinatura local
        if (subscription) {
          isExpired = new Date(subscription.endDate) < new Date();
        } else {
          // Sem assinatura para plano FREE, considerar expirado
          isExpired = true;
        }
      }
      else {
        // Para planos PAGOS (não-FREE), usar os valores da assinatura local
        if (subscription) {
          isExpired = !subscription.isActive;
          stripeSubscriptionCanceled = subscription.stripeSubscriptionCanceled;
          paymentFailed = subscription.paymentFailed;
        }
      }

      let office = null;

      if (company_id) {
        const userCompany = await prisma.userCompany.findUnique({
          where: {
            userId_companyId: {
              userId: userId,
              companyId: company_id
            }
          },
          select: {
            office: true
          }
        })

        office = userCompany?.office;
      }

      // Retornar no mesmo formato do getSubscriptionStatus
      return res.json({
        subscription,
        isExpired,
        stripeSubscriptionCanceled,
        paymentFailed,
        permissions,
        plan: planInfo,
        office: office
      });

    } catch (error) {
      console.error("Erro ao verificar status da assinatura local:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Erro interno do servidor"
      });
    }
  }

  async deleteUserCompany(req: Request, res: Response) {
    const {
      userId,
      companyId
    } = req.params

    if (!userId || !companyId) {
      return res.status(400).json({
        error: "ID de usuário e empresa não fornecidos"
      })
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      }
    })

    if (!user) {
      return res.status(404).json({
        where: {
          error: "Usuário não encontrado"
        }
      })
    }

    const company = await prisma.company.findUnique({
      where: {
        id: companyId
      }
    })

    if (!company) {
      return res.status(400).json({
        error: "ID de empresa não fornecido"
      })
    }

    const userCompany = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: company.id
        }
      },
      select: {
        id: true,
        userId: true,
        companyId: true,
        office: {
          select: {
            name: true,
          }
        }
      }
    })

    if (!userCompany) {
      return res.status(404).json({
        error: "Usuário não encontrado na empresa"
      })
    }

    if (userCompany.office.name === "administrator" || userCompany.office.name === "Administrator") {
      return res.status(400).json({
        error: "Não é possível remover o usuário administrador da empresa"
      })
    }

    try {
      await prisma.userCompany.delete({
        where: {
          id: userCompany.id,
          userId: userCompany.userId,
          companyId: userCompany.companyId
        }
      })

      return res.json({
        message: "Usuário removido da empresa com sucesso"
      })
    } catch (error) {
      return res.status(500).json({
        error: "Internal server error"
      })
    }
  }

  async completeOnboardingStatus(req: Request, res: Response) {
    const {
      id
    } = req.params

    try {
      if (!id) {
        return res.status(400).json({
          error: "ID is required"
        })
      }

      const user = await prisma.user.findUnique({
        where: { id }
      })

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        })
      }
      const updatedUser = await prisma.user.update({
        where: {
          id
        },
        data: {
          onBoardingCompleted: true
        }
      })

      return res.status(200).json({
        message: "Onboarding completed successfully",
        user: updatedUser
      })
    } catch (error) {
      return res.status(500).json({
        error: "Internal server error"
      })
    }
  }
}

