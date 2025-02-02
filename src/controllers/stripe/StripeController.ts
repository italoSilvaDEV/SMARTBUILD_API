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
                const account = await stripe.accounts.create({ type: "standard" });
                stripeAccountId = account.id;

                await prisma.company.update({
                    where: { id: companyId },
                    data: { stripeAccountId },
                });
            }

            const account = await stripe.accounts.retrieve(stripeAccountId);

            if (!account.requirements?.disabled_reason) {
                return res.status(400).json({ error: "Account already connected" });
            }

            // Redireciona para o onboarding existente
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

    async checkStripeStatus(req: Request, res: Response) {
        const { companyId } = req.params;

        try {
            const company = await prisma.company.findUnique({
                where: { id: companyId },
            });

            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }

            // Verifica se a empresa já tem um stripeAccountId
            const hasStripeAccount = !!company.stripeAccountId;

            if (!hasStripeAccount) {
                return res.status(200).json({
                    hasStripeAccount: false,
                    connected: false,
                    requiresOnboarding: true,
                    pendingRequirements: []
                });
            }

            if (!company.stripeAccountId) {
                return res.status(400).json({ error: "Stripe account ID is missing" });
            }

            // Recupera os detalhes da conta Stripe
            const account = await stripe.accounts.retrieve(company.stripeAccountId);

            // account.details_submitted === false indica que o onboarding nao foi concluido
            // account.charges_enabled → true (habilitado para receber pagamentos)
            // account.payouts_enabled → true (habilitado para receber transferências)
            // account.requirements.currently_due.length === 0 (nenhum requisito pendente)

            const isConnected = account.details_submitted && account.charges_enabled && account.payouts_enabled;
            const pendingRequirements = account.requirements?.currently_due || [];
            const requiresOnboarding = !isConnected || pendingRequirements.length > 0;

            console.log("StripeAccountId: ", company.stripeAccountId)
            console.log("details_submitted: ", account.details_submitted)
            console.log("charges_enabled: ", account.charges_enabled)
            console.log("payouts_enabled: ", account.payouts_enabled)
            console.log("Requirements: ", account.requirements?.currently_due)


            return res.status(200).json({
                hasStripeAccount: true,
                connected: isConnected,
                requiresOnboarding,
                pendingRequirements
            });
        } catch (error) {
            console.error("Erro ao verificar status do Stripe:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // funcionou menos o link
    // async createInvoice(req: Request, res: Response) {
    //     const { projectId } = req.params;

    //     try {
    //         console.log("Buscando o projeto no banco de dados...");
    //         const project = await prisma.project.findUnique({
    //             where: { id: projectId },
    //             include: {
    //                 client: true,
    //                 serviceProject: true,
    //                 company: true,
    //             },
    //         });

    //         if (!project) {
    //             console.error(" Projeto não encontrado!");
    //             return res.status(404).json({ error: "Project not found" });
    //         }

    //         if (!project.client) {
    //             console.error(" Cliente não encontrado para este projeto!");
    //             return res.status(400).json({ error: "Client not found" });
    //         }

    //         if (!project.company || !project.company.stripeAccountId) {
    //             console.error(" Empresa não conectada ao Stripe!");
    //             return res.status(400).json({ error: "Company not connected to Stripe" });
    //         }

    //         console.log(" Projeto, cliente e empresa encontrados com sucesso!");

    //         // 🔑 Pegar StripeAccountId da empresa
    //         const stripeAccountId = project.company.stripeAccountId;
    //         console.log(" StripeAccountId da empresa:", stripeAccountId);

    //         // 🔍 Verificar se o cliente já tem StripeCustomerId armazenado
    //         let stripeCustomerId = project.client.stripeCustomerId;

    //         if (!stripeCustomerId) {
    //             console.log(" Criando cliente no Stripe...");
    //             const customer = await stripe.customers.create(
    //                 {
    //                     name: project.client.name,
    //                     email: project.client.email,
    //                     phone: project.client.phone ?? undefined,
    //                 },
    //                 { stripeAccount: stripeAccountId }
    //             );
    //             stripeCustomerId = customer.id;

    //             //  Atualizar o cliente no banco de dados com o novo StripeCustomerId
    //             await prisma.client.update({
    //                 where: { id: project.client.id },
    //                 data: { stripeCustomerId },
    //             });

    //             console.log(` Cliente criado no Stripe com ID: ${stripeCustomerId}`);
    //         } else {
    //             console.log(` Cliente já tem um StripeCustomerId: ${stripeCustomerId}`);
    //         }


    //         console.log(" Criando Invoice Items...");
    //         for (const service of project.serviceProject) {
    //             console.log(` Adicionando serviço: ${service.name} - ${service.hours}h x R$${service.price}`);
    //             await stripe.invoiceItems.create(
    //                 {
    //                     customer: stripeCustomerId,
    //                     amount: Number(service.hours) * Number(service.price) * 100,
    //                     currency: "brl",
    //                     description: service.name,
    //                 },
    //                 { stripeAccount: stripeAccountId }
    //             );
    //         }

    //         console.log(" Criando a Invoice no Stripe...");
    //         const invoice = await stripe.invoices.create(
    //             {
    //                 customer: stripeCustomerId,
    //                 collection_method: "send_invoice",
    //                 days_until_due: 7,
    //                 auto_advance: true,
    //                 metadata: {
    //                     projectId: projectId,
    //                 },
    //                 pending_invoice_items_behavior: "include" // Inclui itens pendentes
    //             },
    //             { stripeAccount: stripeAccountId }
    //         );

    //         const invoiceWithItems = await stripe.invoices.retrieve(invoice.id, {
    //             expand: ["lines"],
    //         }, { stripeAccount: stripeAccountId });

    //         console.log("Itens da Fatura:", invoiceWithItems.lines.data);

    //         console.log(" Invoice criada com ID:", invoice.id);

    //         console.log(" Finalizando a Invoice...");
    //         const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, { stripeAccount: stripeAccountId });

    //         console.log(" Enviando Invoice por e-mail...");
    //         await stripe.invoices.sendInvoice(finalizedInvoice.id, { stripeAccount: stripeAccountId });

    //         console.log(" Invoice enviada por e-mail para:", project.client.email);

    //         console.log(" Salvando Invoice no banco de dados...");
    //         const newInvoice = await prisma.invoice.create({
    //             data: {
    //                 stripeInvoiceId: finalizedInvoice.id,
    //                 projectId: project.id,
    //                 companyId: project.company_id,
    //                 totalAmount: project.serviceProject.reduce(
    //                     (sum, service) => sum + (Number(service.hours) * Number(service.price)),
    //                     0
    //                 ),
    //                 status: finalizedInvoice.status ?? "draft",
    //                 invoiceUrl: finalizedInvoice.hosted_invoice_url, //  Link salvo corretamente
    //                 dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    //             },
    //         });

    //         console.log(" Invoice salva no banco com ID:", newInvoice.id);

    //         return res.status(200).json({
    //             message: "Invoice created, sent, and recorded successfully",
    //             invoiceUrl: finalizedInvoice.hosted_invoice_url,
    //             invoiceId: finalizedInvoice.id,
    //             databaseInvoice: newInvoice,
    //         });

    //     } catch (error) {
    //         console.error(" Erro ao criar Invoice:", error);
    //         return res.status(500).json({ error: "Internal Server Error" });
    //     }
    // }

    async createInvoice(req: Request, res: Response) {
        const { projectId } = req.params;

        try {
            console.log("Buscando o projeto no banco de dados...");
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    client: true,
                    serviceProject: true,
                    company: true,
                },
            });

            if (!project) {
                console.error("Projeto não encontrado!");
                return res.status(404).json({ error: "Project not found" });
            }

            if (!project.client) {
                console.error("Cliente não encontrado para este projeto!");
                return res.status(400).json({ error: "Client not found" });
            }

            if (!project.company || !project.company.stripeAccountId) {
                console.error("Empresa não conectada ao Stripe!");
                return res.status(400).json({ error: "Company not connected to Stripe" });
            }

            console.log("Projeto, cliente e empresa encontrados com sucesso!");

            const stripeAccountId = project.company.stripeAccountId;
            console.log("StripeAccountId da empresa:", stripeAccountId);

            let stripeCustomerId = project.client.stripeCustomerId;

            if (!stripeCustomerId) {
                console.log("Criando cliente no Stripe...");
                const customer = await stripe.customers.create(
                    {
                        name: project.client.name,
                        email: project.client.email,
                        phone: project.client.phone ?? undefined,
                    },
                    { stripeAccount: stripeAccountId }
                );
                stripeCustomerId = customer.id;

                await prisma.client.update({
                    where: { id: project.client.id },
                    data: { stripeCustomerId },
                });

                console.log(`Cliente criado no Stripe com ID: ${stripeCustomerId}`);
            } else {
                console.log(`Cliente já tem um StripeCustomerId: ${stripeCustomerId}`);
            }

            console.log("Criando Invoice Items...");
            for (const service of project.serviceProject) {
                console.log(`Adicionando serviço: ${service.name} - ${service.hours}h x R$${service.price}`);
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

            console.log("Criando a Invoice no Stripe...");
            const invoice = await stripe.invoices.create(
                {
                    customer: stripeCustomerId,
                    collection_method: "send_invoice",
                    days_until_due: 7,
                    auto_advance: true,
                    metadata: {
                        projectId: projectId,
                    },
                    pending_invoice_items_behavior: "include"
                },
                { stripeAccount: stripeAccountId }
            );

            const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, { stripeAccount: stripeAccountId });

            console.log("Salvando Invoice no banco de dados...");
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
                    invoiceUrl: finalizedInvoice.hosted_invoice_url,
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            console.log("Invoice salva no banco com ID:", newInvoice.id);

            return res.status(200).json({
                message: "Invoice created and recorded successfully",
                invoiceUrl: finalizedInvoice.hosted_invoice_url,
                invoiceId: finalizedInvoice.id,
                databaseInvoice: newInvoice,
            });

        } catch (error) {
            console.error("Erro ao criar Invoice:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    async sendInvoice(req: Request, res: Response) {
        const { invoiceId } = req.params;

        try {
            const invoice = await prisma.invoice.findUnique({
                where: { stripeInvoiceId: invoiceId },
                include: {
                    project: {
                        include: {
                            client: true,
                            company: true,
                        },
                    },
                },
            });

            if (!invoice || !invoice.project || !invoice.project.company || !invoice.project.client) {
                return res.status(404).json({ error: "Invoice, project, company, or client not found" });
            }

            const stripeAccountId = invoice.project.company.stripeAccountId ?? undefined;

            console.log("Enviando Invoice por e-mail...");
            await stripe.invoices.sendInvoice(invoiceId, { stripeAccount: stripeAccountId });

            console.log("Invoice enviada por e-mail para:", invoice.project.client.email);

            return res.status(200).json({ message: "Invoice sent successfully" });

        } catch (error) {
            console.error("Erro ao enviar Invoice:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    async cancelInvoice(req: Request, res: Response) {
        const { invoiceId } = req.params;

        try {
            const invoice = await prisma.invoice.findUnique({
                where: { stripeInvoiceId: invoiceId },
                include: {
                    project: {
                        include: {
                            company: true,
                        },
                    },
                },
            });

            if (!invoice || !invoice.project || !invoice.project.company) {
                return res.status(404).json({ error: "Invoice, project, or company not found" });
            }

            const stripeAccountId = invoice.project.company.stripeAccountId ?? undefined;

            console.log("Cancelando a Invoice no Stripe...");
            const canceledInvoice = await stripe.invoices.voidInvoice(invoiceId, { stripeAccount: stripeAccountId });

            console.log("Atualizando status da Invoice no banco de dados...");
            const updatedInvoice = await prisma.invoice.update({
                where: { stripeInvoiceId: invoiceId },
                data: { status: "void" },
            });

            console.log("Invoice cancelada com sucesso!");

            return res.status(200).json({
                message: "Invoice canceled successfully",
                updatedInvoice,
            });

        } catch (error) {
            console.error("Erro ao cancelar Invoice:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }



    async getInvoicesByProject(req: Request, res: Response) {
        const { projectId } = req.params;

        try {
            console.log(" Buscando invoices do projeto:", projectId);

            // Buscar invoices relacionadas ao ProjectId com a empresa associada
            const invoices = await prisma.invoice.findMany({
                where: { projectId },
                orderBy: { createdAt: "desc" },
                include: {
                    company: true, // Inclui a empresa para obter o stripeAccountId
                },
            });

            if (invoices.length === 0) {
                console.log(" Nenhuma invoice encontrada para este projeto.");
                return res.status(404).json({ message: "No invoices found for this project." });
            }

            console.log(` ${invoices.length} invoices encontradas.`);

            const updatedInvoices = await Promise.all(
                invoices.map(async (invoice) => {
                    try {
                        // Verificar se a empresa possui um stripeAccountId
                        if (!invoice.company || !invoice.company.stripeAccountId) {
                            console.warn(` Empresa associada à invoice ${invoice.id} não está conectada ao Stripe.`);
                            return invoice;
                        }

                        const stripeAccountId = invoice.company.stripeAccountId;

                        // Buscar o status da fatura na conta conectada do Stripe
                        const stripeInvoice = await stripe.invoices.retrieve(
                            invoice.stripeInvoiceId,
                            { stripeAccount: stripeAccountId }
                        );

                        const status = stripeInvoice.status ?? "draft";

                        // Atualizar o status no banco de dados, se necessário
                        if (invoice.status !== status) {
                            await prisma.invoice.update({
                                where: { id: invoice.id },
                                data: { status },
                            });

                            console.log(` Status da fatura ${invoice.stripeInvoiceId} atualizado para ${status}`);
                            return { ...invoice, status };
                        }

                        return invoice;

                    } catch (stripeError: any) {
                        if (stripeError.code === 'resource_missing') {
                            console.warn(` Invoice não encontrada no Stripe: ${invoice.stripeInvoiceId}.`);
                            return {
                                ...invoice,
                                status: "not_found_in_stripe",
                                error: stripeError.message,
                            };
                        }

                        console.error(` Erro ao buscar invoice ${invoice.stripeInvoiceId} no Stripe:`, stripeError);
                        return invoice;
                    }
                })
            );

            return res.status(200).json(updatedInvoices);

        } catch (error) {
            console.error(" Erro ao buscar invoices:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

}
