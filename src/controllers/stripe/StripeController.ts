import { Request, Response } from "express";
import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-01-27.acacia",
});

export class StripeController {
  
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


    // funcionou mais duplicou cliente
    async createInvoice(req: Request, res: Response) {
        const { projectId } = req.params;

        try {
            console.log("🔍 Buscando o projeto no banco de dados...");
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    client: true,
                    serviceProject: true,
                    company: true,
                },
            });

            if (!project) {
                console.error("❌ Projeto não encontrado!");
                return res.status(404).json({ error: "Project not found" });
            }

            if (!project.client) {
                console.error("❌ Cliente não encontrado para este projeto!");
                return res.status(400).json({ error: "Client not found" });
            }

            if (!project.company || !project.company.stripeAccountId) {
                console.error("❌ Empresa não conectada ao Stripe!");
                return res.status(400).json({ error: "Company not connected to Stripe" });
            }

            console.log("✅ Projeto, cliente e empresa encontrados com sucesso!");

            // 🔑 Pegar StripeAccountId da empresa
            const stripeAccountId = project.company.stripeAccountId;
            console.log("🔑 StripeAccountId da empresa:", stripeAccountId);

            // 🔍 Verificar se o cliente já tem StripeCustomerId armazenado
            let stripeCustomerId = project.client.stripeCustomerId;

            if (!stripeCustomerId) {
                console.log("📌 Criando cliente no Stripe...");
                const customer = await stripe.customers.create(
                    {
                        name: project.client.name,
                        email: project.client.email,
                        phone: project.client.phone ?? undefined,
                    },
                    { stripeAccount: stripeAccountId }
                );
                stripeCustomerId = customer.id;
    
                // 💾 Atualizar o cliente no banco de dados com o novo StripeCustomerId
                await prisma.client.update({
                    where: { id: project.client.id },
                    data: { stripeCustomerId },
                });
    
                console.log(`✅ Cliente criado no Stripe com ID: ${stripeCustomerId}`);
            } else {
                console.log(`✅ Cliente já tem um StripeCustomerId: ${stripeCustomerId}`);
            }


            console.log("🛒 Criando Invoice Items...");
            for (const service of project.serviceProject) {
                console.log(`📌 Adicionando serviço: ${service.name} - ${service.hours}h x R$${service.price}`);
                await stripe.invoiceItems.create(
                    {
                        customer: stripeCustomerId,
                        amount: Number(service.hours) * Number(service.price) * 100,
                        currency: "brl",
                        description: service.name,
                    },
                    { stripeAccount: stripeAccountId }
                );
            }

            console.log("📄 Criando a Invoice no Stripe...");
            const invoice = await stripe.invoices.create(
                {
                    customer: stripeCustomerId,
                    collection_method: "send_invoice",
                    days_until_due: 7,
                    auto_advance: true,
                    metadata: {
                        projectId: projectId,
                    },
                    pending_invoice_items_behavior: "include" // Inclui itens pendentes
                },
                { stripeAccount: stripeAccountId }
            );

            const invoiceWithItems = await stripe.invoices.retrieve(invoice.id, {
                expand: ["lines"],
            }, { stripeAccount: stripeAccountId });

            console.log("Itens da Fatura:", invoiceWithItems.lines.data);

            console.log("✅ Invoice criada com ID:", invoice.id);

            console.log("📤 Finalizando a Invoice...");
            const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, { stripeAccount: stripeAccountId });

            console.log("📧 Enviando Invoice por e-mail...");
            await stripe.invoices.sendInvoice(finalizedInvoice.id, { stripeAccount: stripeAccountId });

            console.log("✅ Invoice enviada por e-mail para:", project.client.email);

            console.log("📝 Salvando Invoice no banco de dados...");
            const newInvoice = await prisma.invoice.create({
                data: {
                    stripeInvoiceId: finalizedInvoice.id,
                    projectId: project.id,
                    companyId: project.company_id,
                    totalAmount: project.serviceProject.reduce(
                        (sum, service) => sum + (Number(service.hours) * Number(service.price)),
                        0
                    ),
                    status: finalizedInvoice.status ?? "draft",
                    invoiceUrl: finalizedInvoice.hosted_invoice_url, // ✅ Link salvo corretamente
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            console.log("✅ Invoice salva no banco com ID:", newInvoice.id);

            return res.status(200).json({
                message: "Invoice created, sent, and recorded successfully",
                invoiceUrl: finalizedInvoice.hosted_invoice_url,
                invoiceId: finalizedInvoice.id,
                databaseInvoice: newInvoice,
            });

        } catch (error) {
            console.error(" Erro ao criar Invoice:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }






}
