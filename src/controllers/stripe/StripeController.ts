import { Request, Response } from "express";
import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-01-27.acacia",
});

export class StripeController {
    // Conectar uma Company ao Stripe (Onboarding)
    // async connectCompany(req: Request, res: Response) {
    //     const { companyId } = req.params;

    //     try {
    //         const company = await prisma.company.findUnique({
    //             where: { id: companyId },
    //         });

    //         if (!company) {
    //             return res.status(404).json({ error: "Company not found" });
    //         }

    //         if (company.stripeAccountId) {
    //             console.log(`Conta Stripe já conectada para a companyId: ${companyId}`);
    //             return res.status(400).json({
    //                 error: "Account already connected",
    //                 stripeAccountId: company.stripeAccountId,
    //             });
    //         }

    //         // Criando conta no Stripe
    //         const account = await stripe.accounts.create({ type: "standard" });

    //         // Criando link de onboarding
    //         const accountLink = await stripe.accountLinks.create({
    //             account: account.id,
    //             refresh_url: `${process.env.URL_FRONT}/stripe-config`,
    //             return_url: `${process.env.URL_FRONT}/stripe-config`,
    //             type: "account_onboarding",
    //         });

    //         // Atualizando a tabela Company com o stripeAccountId
    //         await prisma.company.update({
    //             where: { id: companyId },
    //             data: { stripeAccountId: account.id },
    //         });

    //         return res.status(200).json({ url: accountLink.url });
    //     } catch (error) {
    //         console.error("Erro ao criar conta Stripe:", error);
    //         return res.status(500).json({ error: "Error creating Stripe account" });
    //     }
    // }

    async connectCompany(req: Request, res: Response) {
        const { companyId } = req.params;
    
        try {
            const company = await prisma.company.findUnique({
                where: { id: companyId },
            });
    
            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }
    
            let stripeAccountId = company.stripeAccountId;
    
            if (!stripeAccountId) {
                // Criar uma nova conta se o usuário não tiver uma ainda
                const account = await stripe.accounts.create({ type: "standard" });
                stripeAccountId = account.id;
    
                await prisma.company.update({
                    where: { id: companyId },
                    data: { stripeAccountId },
                });
            }
    
            // Recupera o status da conta no Stripe
            const account = await stripe.accounts.retrieve(stripeAccountId);
    
            // Se a conta já está ativa, não precisa fazer onboarding
            if (!account.requirements?.disabled_reason) {
                return res.status(400).json({ error: "Account already connected" });
            }
    
            // Gerar um novo link de onboarding
            const accountLink = await stripe.accountLinks.create({
                account: stripeAccountId,
                refresh_url: `${process.env.URL_FRONT}/stripe-config`,
                return_url: `${process.env.URL_FRONT}/stripe-config`,
                type: "account_onboarding",
            });
    
            return res.status(200).json({ url: accountLink.url });
        } catch (error) {
            console.error("Erro ao criar conta Stripe:", error);
            return res.status(500).json({ error: "Error creating Stripe account" });
        }
    }

    //   Verificar status da conexão Stripe
    // async checkStripeStatus(req: Request, res: Response) {
    //     const { companyId } = req.params;
    
    //     try {
    //         const company = await prisma.company.findUnique({
    //             where: { id: companyId },
    //         });
    
    //         if (!company) {
    //             return res.status(404).json({ error: "Company not found" });
    //         }
    
    //         if (!company.stripeAccountId) {
    //             return res.status(200).json({ connected: false, requiresOnboarding: false });
    //         }
    
    //         // Verifica o status real da conta no Stripe
    //         const account = await stripe.accounts.retrieve(company.stripeAccountId);
    
    //         // Se `requirements.disabled_reason` estiver vazio, significa que a conta está ativa
    //         const isConnected = !account.requirements?.disabled_reason;
    //         const requiresOnboarding = !!account.requirements?.disabled_reason;
    
    //         return res.status(200).json({ connected: isConnected, requiresOnboarding });
    //     } catch (error) {
    //         console.error("Erro ao verificar status do Stripe:", error);
    //         return res.status(500).json({ error: "Internal Server Error" });
    //     }
    // }

    // async checkStripeStatus(req: Request, res: Response) {
    //     const { companyId } = req.params;
    
    //     try {
    //         const company = await prisma.company.findUnique({
    //             where: { id: companyId },
    //         });
    
    //         if (!company) {
    //             return res.status(404).json({ error: "Company not found" });
    //         }
    
    //         if (!company.stripeAccountId) {
    //             return res.status(200).json({ connected: false, requiresOnboarding: false });
    //         }
    
    //         // Recupera os detalhes da conta Stripe conectada
    //         const account = await stripe.accounts.retrieve(company.stripeAccountId);
    
    //         // 🚀 Nova lógica para verificar se a conta está ativa:
    //         const isConnected = account.charges_enabled && account.payouts_enabled;
    //         const requiresOnboarding = !isConnected; // Se não está conectada, ainda precisa de onboarding
    
    //         return res.status(200).json({ connected: isConnected, requiresOnboarding });
    //     } catch (error) {
    //         console.error("Erro ao verificar status do Stripe:", error);
    //         return res.status(500).json({ error: "Internal Server Error" });
    //     }
    // }

    // async checkStripeStatus(req: Request, res: Response) {
    //     const { companyId } = req.params;
    
    //     try {
    //         const company = await prisma.company.findUnique({
    //             where: { id: companyId },
    //         });
    
    //         if (!company) {
    //             return res.status(404).json({ error: "Company not found" });
    //         }
    
    //         if (!company.stripeAccountId) {
    //             return res.status(200).json({ connected: false, requiresOnboarding: false });
    //         }
    
    //         // Recupera os detalhes da conta Stripe conectada
    //         const account = await stripe.accounts.retrieve(company.stripeAccountId);
    
    //         // 🚀 Verificando estados diferentes:
    //         const isConnected = account.charges_enabled && account.payouts_enabled;
    //         const requiresOnboarding = !isConnected;
    
    //         // 📌 NOVO: Verifica se há pendências na conta:
    //         const pendingRequirements = account.requirements?.currently_due || [];
    
    //         return res.status(200).json({ 
    //             connected: isConnected, 
    //             requiresOnboarding, 
    //             pendingRequirements 
    //         });
    
    //     } catch (error) {
    //         console.error("Erro ao verificar status do Stripe:", error);
    //         return res.status(500).json({ error: "Internal Server Error" });
    //     }
    // }

    async checkStripeStatus(req: Request, res: Response) {
        const { companyId } = req.params;
    
        try {
            const company = await prisma.company.findUnique({
                where: { id: companyId },
            });
    
            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }
    
            if (!company.stripeAccountId) {
                return res.status(200).json({ 
                    connected: false, 
                    requiresOnboarding: false, 
                    pendingRequirements: [] 
                });
            }
    
            // 🔹 Recupera os detalhes da conta Stripe conectada
            const account = await stripe.accounts.retrieve(company.stripeAccountId);
    
            // 🔹 Verifica se a conta está ativa
            const isConnected = account.charges_enabled && account.payouts_enabled;
            const requiresOnboarding = !isConnected;
    
            return res.status(200).json({
                connected: isConnected,
                requiresOnboarding,
                pendingRequirements: account.requirements?.currently_due || []
            });
        } catch (error) {
            console.error("Erro ao verificar status do Stripe:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }
    
    
    
}
