import bcrypt from "bcrypt";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import Jwt from "jsonwebtoken";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { stripeConfig } from "../../config/stripe";

export class UserMultiCompanyController {
  async authenticateMultiCompany(req: Request, res: Response) {
    try {
      const {
        email,
        password
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "User or password is required!" });
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          office: true,
          companies: {
            include: {
              office: true,
              company: true
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
      // const avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null;
      let avatarUrl: string | null = "";


      try {
        avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null;
      } catch (err) {
        avatarUrl = null;
      }

      // Gerar URLs assinadas para os avatares das empresas
      const companiesWithAvatarUrls = await Promise.all(
        user.companies.map(async (userCompany) => {
          let companyAvatarUrl = null;

          try {
            companyAvatarUrl = userCompany.company.avatar ? await getPresignedUrl(userCompany.company.avatar) : null;
          } catch (err) {
            companyAvatarUrl = null;
          }

          return {
            ...userCompany,
            company: {
              ...userCompany.company,
              avatar: companyAvatarUrl
            }
          };
        })
      );


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

      console.log(companiesWithAvatarUrls)
      console.log("Está chegando aqui?")

      // Formatar resposta com array de companies
      return res.json({
        msg: "Authentication completed successfully!",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: avatarUrl,
          document: user.document,
          city_and_state: user.city_and_state,
          phone: user.phone,
          hourly_price: user.hourly_price,
          profession: user.profession,
          companies: companiesWithAvatarUrls, // Array de companies com avatarUrl
          last_acess: user.last_acess,
          office: user.office
        }
      });
    } catch (error) {
      console.error("Erro na autenticação multi-company:", error);
      return res.status(500).json({ error: "Erro interno do servidor" });
    }
  }

  async authenticateByCompany(req: Request, res: Response) {
    try {
      const {
        tokenCompany,
        companyId
      } = req.body;

      console.log(companyId)

      if (!tokenCompany || !companyId) {
        return res.status(400).json({ error: "Token and companyId are required!" });
      }
      const decoded = Jwt.verify(tokenCompany, String(process.env.SECRET_JWT));
      if (!decoded || typeof decoded !== 'object' || !('id' in decoded)) {
        return res.status(401).json({ error: "Token inválido" });
      }

      const user = await prisma.user.findUnique({
        where: {
          id: decoded.id
        },
        include: {
          companies: {
            include: {
              company: true,
            }
          }
        }
      });

      if (!user) {
        return res.status(400).json({ error: "User or password invalid!" });
      }

      const validCompany = user.companies.find(uc => uc.company.id === companyId);

      if (!validCompany) {
        return res.status(403).json({ error: "Access denied to this company!" });
      }

      if (user.isDisabled) {
        return res.status(403).json({ error: "Access denied" });
      }

      const userCompany = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: companyId
          }
        },
        include: {
          office: true,
          company: {
            include: {
              Plan: true
            }
          }
        }
      });

      console.log(userCompany)

      const company = await prisma.company.findUnique({
        where: {
          id: companyId
        },
        include: {
          Plan: true
        }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { last_acess: new Date() }
      });

      const avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null;

      let planInfo = null;
      let subscriptionInfo = null;
      let isExpired = false;
      let stripeSubscriptionCanceled = false;
      let paymentFailed = false;
      let permissions: string[] = [];

      const selectedOffice = userCompany?.office;

      if (company?.id) {
        if (company.planId) {
          const plan = await prisma.plan.findUnique({
            where: { id: company.planId },
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

          if (plan?.permissionGroup?.GroupPermissionsList) {
            permissions = plan.permissionGroup.GroupPermissionsList.map(item => item.Permissions.description);
          }
        }


        planInfo = company.Plan ? {
          id: company.Plan.id,
          name: company.Plan.name,
          validityType: company.Plan.validityType,
          validityDuration: company.Plan.validityDuration,
          stripePriceId: company.Plan.stripePriceId,
          stripeProductId: company.Plan.stripeProductId
        } : null;

        const subscription = await prisma.subscription.findFirst({
          where: {
            companyId: companyId,
          },
          orderBy: { endDate: 'desc' }
        });
        subscriptionInfo = subscription;

        if (!planInfo) {
          isExpired = true;
        }
        else if (planInfo.validityType === 'FREE') {
          if (subscription) {
            isExpired = new Date(subscription.endDate) < new Date();
          } else {
            isExpired = true;
          }
        }
        else {
          if (!subscription || !subscription.stripeSubscriptionId) {
            isExpired = true;
          }
          else {
            try {
              const stripe = stripeConfig.getClient();

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
            // catch (stripeError: any) {
            //   console.error('Erro ao verificar assinatura no Stripe:', stripeError);

            //   // Verificar se é um erro específico de assinatura não encontrada
            //   if (stripeError.type === 'StripeInvalidRequestError' &&
            //     stripeError.code === 'resource_missing' &&
            //     stripeError.param === 'id') {

            //     console.warn(`Assinatura ${subscription.stripeSubscriptionId} não encontrada no Stripe. Marcando como expirada e removendo referência do banco local.`);

            //     // Remover a referência da assinatura Stripe do banco local
            //     try {
            //       await prisma.subscription.update({
            //         where: { id: subscription.id },
            //         data: {
            //           stripeSubscriptionId: null,
            //           isActive: false
            //         }
            //       });
            //       console.log('Referência da assinatura Stripe removida do banco local com sucesso.');
            //     } catch (updateError) {
            //       console.error('Erro ao atualizar assinatura no banco local:', updateError);
            //     }

            //     // Marcar como expirada já que a assinatura não existe no Stripe
            //     isExpired = true;
            //     stripeSubscriptionCanceled = true;
            //   } else {
            //     // Para outros tipos de erro do Stripe, usar fallback para verificação local
            //     console.log('Usando fallback para verificação local devido a erro no Stripe.');
            //     isExpired = new Date(subscription.endDate) < new Date();
            //   }
            // }
            catch (stripeError) {
              console.error('Erro ao verificar assinatura no Stripe:', stripeError);
              // Fallback para verificação local em caso de erro
              isExpired = new Date(subscription.endDate) < new Date();
            }
          }
        }

        // Se o plano expirou e o usuário não é administrador, bloquear acesso
        // Usar o office específico da empresa selecionada
        const isAdmin = selectedOffice?.name.toLowerCase() === 'administrator';
        if (isExpired && !isAdmin) {
          return res.status(403).json({
            error: "Your company's subscription has expired. Please ask your company administrator to renew your plan to continue using the system."
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

      console.log(selectedOffice?.name)
      console.log(selectedOffice)

      console.log("Está chegando aqui?")

      return res.status(200).json({
        msg: "Authentication completed successfully!",
        token,
        rules: selectedOffice?.name, // Usar office da empresa específica
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: avatarUrl,
          document: user.document,
          city_and_state: user.city_and_state,
          office: selectedOffice, // Usar office da empresa específica
          phone: user.phone,
          hourly_price: user.hourly_price,
          profession: user.profession,
          company: {
            id: company?.id,
            name: company?.name,
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
}