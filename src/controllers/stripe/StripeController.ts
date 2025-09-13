import { Request, Response } from "express";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import dotenv from "dotenv";

dotenv.config();

const stripe = stripeConfig.getClient();

type Estimate = {
    id: string;
}

// Função auxiliar para garantir que a descrição completa não ultrapasse 500 caracteres
function createSafeDescription(serviceName: string, description: string): string {
    const separator = " - ";
    const maxLength = 500;

    // Se o nome do serviço já for maior que o limite, truncá-lo
    if (serviceName.length >= maxLength) {
        return serviceName.substring(0, maxLength - 3) + "...";
    }

    // Espaço disponível para a descrição = limite total - tamanho do nome - tamanho do separador
    const availableSpace = maxLength - serviceName.length - separator.length;

    // Se não houver espaço para descrição, retornar apenas o nome truncado
    if (availableSpace <= 0) {
        return serviceName.substring(0, maxLength - 3) + "...";
    }

    // Truncar a descrição para caber no espaço disponível
    const truncatedDescription = (description || "No description").substring(0, availableSpace);

    return `${serviceName}${separator}${truncatedDescription}`;
}

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

    async createInvoice(req: Request, res: Response) {
        const { projectId } = req.params;
        const {
            coefficientPerfentage,
            description,
            dueDate,
            userId,
            services,
            type_value,
            totalAmount,
            estimateId
        } = req.body;

        try {
            console.log("Buscando o projeto no banco de dados...");
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    client: true,
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

            const emailClient = project.client.email || "";
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(emailClient)) {
                console.error("Endereço de email inválido!");
                return res.status(400).json({ error: "Invalid client email address" });
            }

            const stripeAccountId = project.company.stripeAccountId;
            console.log("StripeAccountId da empresa:", stripeAccountId);

            let stripeCustomerId = project.client.stripeCustomerId;

            if (stripeCustomerId) {
                try {
                    await stripe.customers.retrieve(
                        stripeCustomerId,
                        { stripeAccount: stripeAccountId }
                    );
                    console.log(`Cliente já tem um StripeCustomerId: ${stripeCustomerId}`);
                } catch (error: any) {
                    if (error.code === 'resource_missing') {
                        console.warn("Cliente não encontrado no Stripe. Criando um novo...");
                        stripeCustomerId = null;
                    } else {
                        throw error;
                    }
                }
            }

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
            }

            console.log("Criando Invoice Items...");
            let totalAmount = 0;
            const lineItems = [];

            const currentDate = new Date();
            const dueDateObj = new Date(dueDate);
            const daysUntilDue = Math.ceil((dueDateObj.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

            // 1️⃣ Criar a fatura antes dos itens
            const invoice = await stripe.invoices.create(
                {
                    customer: stripeCustomerId,
                    collection_method: "send_invoice",
                    days_until_due: daysUntilDue > 0 ? daysUntilDue : 0,
                    auto_advance: true,
                    currency: "usd",
                    metadata: {
                        projectId: projectId,
                    }
                },
                { stripeAccount: stripeAccountId }
            );

            for (const service of services) {
                const quantity = Number(service.quantity) || 0;
                const price = Number(service.price) || 0;
                const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 1;

                // Usar o total fornecido ou calcular se não estiver disponível
                const serviceAmount = service.total || (quantity * price);
                const adjustedAmount = serviceAmount * validCoefficient;

                console.log("-------- Detalhes do Serviço --------");
                console.log(`Serviço: ${service.name}`);
                console.log(`Quantidade: ${service.quantity} -> Convertido: ${quantity}`);
                console.log(`Preço (price): ${service.price} -> Convertido: ${price}`);
                console.log(`Coeficiente (coefficient): ${coefficientPerfentage} -> Válido: ${validCoefficient}`);
                console.log(`Valor Bruto (serviceAmount): ${serviceAmount}`);
                console.log(`Valor Ajustado (adjustedAmount): ${adjustedAmount}`);
                console.log("------------------------------------");

                if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
                    console.warn(`⚠️ Valor inválido para o serviço: ${service.name}. O item será ignorado.`);
                    continue;
                }

                totalAmount += adjustedAmount;

                console.log(` Adicionando serviço ajustado: ${service.name} - Valor final: $${adjustedAmount.toFixed(2)}`);

                lineItems.push({
                    name: service.name,
                    description: createSafeDescription(service.name, service.description || "No additional description"),
                    quantity: quantity,
                    price: price,
                    totalAmount: adjustedAmount
                });

                await stripe.invoiceItems.create(
                    {
                        customer: stripeCustomerId,
                        amount: Math.round(adjustedAmount * 100), // Convertendo para centavos
                        currency: "usd",
                        description: createSafeDescription(service.name, service.description || "No additional description"),
                        invoice: invoice.id // 3️⃣ Associar o item à fatura criada
                    },
                    { stripeAccount: stripeAccountId }
                );
            }

            // 4️⃣ Finalizar a fatura após adicionar os itens
            const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, { stripeAccount: stripeAccountId });


            // Buscar todos os invoices com externalInvoiceId numérico para a empresa
            const allInvoices = await prisma.invoice.findMany({
                where: {
                    companyId: project.company_id,
                    invoiceType: { in: ["custom", "stripe"] },
                    externalInvoiceId: { not: null }
                },
                select: {
                    externalInvoiceId: true
                }
            });

            // Extrair apenas os números válidos e encontrar o maior
            const numericIds = allInvoices
                .map(invoice => parseInt(invoice.externalInvoiceId || ""))
                .filter(num => !isNaN(num) && num > 0);

            // Definir o número do invoice como o próximo número após o maior encontrado, ou 1000 se não houver
            let nextInvoiceNumber = 1000;
            if (numericIds.length > 0) {
                const maxNumber = Math.max(...numericIds);
                nextInvoiceNumber = maxNumber + 1;

            }
            let estimate = null as Estimate | null;

            if (estimateId) {
                estimate = await prisma.estimate.findUnique({
                    where: {
                        id: estimateId
                    },
                    select: {
                        id: true
                    }
                })

            }
            

            console.log("Salvando Invoice no banco de dados...");
            const newInvoice = await prisma.invoice.create({
                data: {
                    stripeInvoiceId: finalizedInvoice.id,
                    // externalInvoiceId: finalizedInvoice.id,
                    externalInvoiceId: nextInvoiceNumber.toString(),
                    invoiceType: "stripe",
                    projectId: project.id,
                    companyId: project.company_id,
                    totalAmount: totalAmount,
                    status: finalizedInvoice.status ?? "draft",
                    invoiceUrl: finalizedInvoice.hosted_invoice_url,
                    dueDate: dueDateObj,
                    description: description,
                    percentageCoefficient: coefficientPerfentage,
                    type_value: type_value,
                    user_id: userId,
                    estimateId: estimate?.id || null,
                },
            });

            console.log("Invoice salva no banco com ID:", newInvoice.id);

            // Registrar evento na timeline
            await prisma.invoiceTimeline.create({
                data: {
                    description: `Created`,
                    invoice: {
                        connect: { id: newInvoice.id }
                    }
                }
            });

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
        const { userId } = req.body;

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

            console.log("userId: ", userId)

            const sendHistory = await prisma.invoiceSendHistory.create({
                data: {
                    invoiceId: invoice.id,               // ID da invoice enviada
                    recipient: invoice.project.client.email, // E-mail do destinatário
                    user_id: userId                      // ID do usuário que enviou a invoice
                },
            });

            await prisma.invoiceTimeline.create({
                data: {
                    description: `Email sent to ${invoice.project.client.email} successfully`,
                    invoice: {
                        connect: { id: invoice.id }
                    }
                }
            });
            return res.status(200).json({ message: "Invoice sent successfully", sendHistory });

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

            // Registrar evento na timeline
            await prisma.invoiceTimeline.create({
                data: {
                    description: `Canceled`,
                    invoice: {
                        connect: { id: invoice.id }
                    }
                }
            });

            return res.status(200).json({
                message: "Invoice canceled successfully",
                updatedInvoice,
            });

        } catch (error) {
            console.error("Erro ao cancelar Invoice:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // com stripe e custom
    async getInvoicesByProject(req: Request, res: Response) {
        const { projectId } = req.params;
        const { searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

        try {
            console.log("Buscando invoices do projeto:", projectId);

            const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
            const itemsLimit = Number(itemsPerPage);
            const search = typeof searchTerm === 'string' ? searchTerm : "";

            // Filtro para incluir faturas com cancel_invoice_edit = false OU null
            const filtro = {
                projectId,
                OR: [
                    { cancel_invoice_edit: false },
                    { cancel_invoice_edit: null }
                ],
                AND: {
                    OR: [
                        {
                            project: {
                                is: {
                                    client: {
                                        is: {
                                            name: {
                                                contains: search,
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        {
                            stripeInvoiceId: {
                                contains: search,
                            }
                        }
                    ]
                }
            };

            // Buscar invoices relacionadas ao projeto
            const invoices = await prisma.invoice.findMany({
                where: filtro,
                orderBy: { createdAt: "desc" },
                include: {
                    company: true, // Inclui a empresa para obter o stripeAccountId
                    InvoiceSendHistory: {
                        orderBy: { sentAt: "desc" }
                    },
                    InvoiceItems: true, // Incluir os itens da fatura
                    PdfProject: true, // Incluir os PDFs relacionados
                    project: {
                        include: {
                            client: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    location: true,
                                }
                            }
                        }
                    },
                    payment: {
                        select: {
                            id: true,
                            paymentMethod: true,
                            notes: true,
                            createdAt: true,
                            amount: true
                        }
                    }
                },
                skip: pageNumber * itemsLimit,
                take: itemsLimit
            });

            const total = await prisma.invoice.count({ where: filtro });

            if (invoices.length === 0) {
                console.log("Nenhuma invoice encontrada para este projeto.");
                // return res.status(200).json({ message: "No invoices found for this project." });
                return res.status(200).json({ total, invoices: [], message: "No invoices found for this project." });
            }

            console.log(`${invoices.length} invoices encontradas.`);

            const updatedInvoices = await Promise.all(
                invoices.map(async (invoice) => {
                    // Gerar URLs presigned para PDFs se existirem
                    if (invoice.PdfProject && invoice.PdfProject.length > 0) {
                        for (const pdf of invoice.PdfProject) {
                            if (pdf.uri) {
                                pdf.uri = await getPresignedUrl(pdf.uri);
                            }
                        }
                    }

                    // Se a invoice não for do tipo "stripe", não tenta atualizar via Stripe.
                    if (invoice.invoiceType !== "stripe") {
                        const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
                        return { ...invoice, lastSentAt: lastSend };
                    }

                    // Para invoices do tipo "stripe", execute a atualização via Stripe.
                    try {
                        // Verificar se o item stripeInvoiceId existe
                        if (!invoice.stripeInvoiceId) {
                            console.warn(`Invoice ${invoice.id} é do tipo stripe mas não possui stripeInvoiceId.`);
                            return invoice;
                        }

                        // Verificar se a empresa possui um stripeAccountId
                        if (!invoice.company || !invoice.company.stripeAccountId) {
                            console.warn(`Empresa associada à invoice ${invoice.id} não está conectada ao Stripe.`);
                            return invoice;
                        }

                        const stripeAccountId = invoice.company.stripeAccountId;
                        const stripeInvoice = await stripe.invoices.retrieve(
                            invoice.stripeInvoiceId,
                            { stripeAccount: stripeAccountId }
                        );

                        const status = stripeInvoice.status ?? "draft";

                        // Atualizar o status no banco de dados se houver mudança
                        if (invoice.status !== status) {
                            await prisma.invoice.update({
                                where: { id: invoice.id },
                                data: { status },
                            });
                            console.log(`Status da fatura ${invoice.stripeInvoiceId} atualizado para ${status}`);
                            return { ...invoice, status };
                        }

                        const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
                        return { ...invoice, lastSentAt: lastSend };

                    } catch (stripeError: any) {
                        if (stripeError.code === 'resource_missing') {
                            console.warn(`Invoice não encontrada no Stripe: ${invoice.stripeInvoiceId}.`);
                            return {
                                ...invoice,
                                status: "not_found_in_stripe",
                                error: stripeError.message,
                            };
                        }
                        console.error(`Erro ao buscar invoice ${invoice.stripeInvoiceId} no Stripe:`, stripeError);
                        return invoice;
                    }
                })
            );

            return res.status(200).json({ total, invoices: updatedInvoices });

        } catch (error) {
            console.error("Erro ao buscar invoices:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    async getInvoicesByCompany(req: Request, res: Response) {
        const {
            companyId
        } = req.params;
        const {
            searchTerm = "",
            page = 1,
            itemsPerPage = 10
        } = req.query;

        try {
            const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
            const itemsLimit = Number(itemsPerPage);
            const search = typeof searchTerm === 'string' ? searchTerm : "";

            const filtro = {
                companyId,
                OR: [
                    { cancel_invoice_edit: false },
                    { cancel_invoice_edit: null }
                ],
                AND: {
                    OR: [
                        {
                            project: {
                                is: {
                                    client: {
                                        is: {
                                            name: {
                                                contains: search,
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        {
                            stripeInvoiceId: {
                                contains: search,
                            }
                        }
                    ]
                }

            };

            const invoices = await prisma.invoice.findMany({
                where: filtro,
                orderBy: {
                    createdAt: "desc"
                },
                include: {
                    company: true,
                    estimate: {
                        select: {
                            id: true,
                        }
                    },
                    InvoiceSendHistory: {
                        orderBy: {
                            sentAt: "desc"
                        }
                    },
                    PdfProject: true,
                    project: {
                        include: {
                            client: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    location: true,
                                }
                            },
                            serviceProject: true,
                        }
                    },
                    payment: {
                        select: {
                            id: true,
                            paymentMethod: true,
                            notes: true,
                            createdAt: true,
                            amount: true
                        }
                    },
                },
                skip: pageNumber * itemsLimit,
                take: itemsLimit
            });

            const total = await prisma.invoice.count({ where: filtro });

            if (invoices.length === 0) {
                console.log("Nenhuma invoice encontrada para este projeto.");
                return res.status(200).json({
                    total,
                    invoices: [],
                    message: "No invoices found for this project."
                });
            }

            console.log(`${invoices.length} invoices encontradas.`);

            const updatedInvoices = await Promise.all(
                invoices.map(async (invoice) => {
                    if (invoice.PdfProject && invoice.PdfProject.length > 0) {
                        for (const pdf of invoice.PdfProject) {
                            if (pdf.uri) {
                                pdf.uri = await getPresignedUrl(pdf.uri);
                            }
                        }
                    }

                    if (invoice.invoiceType !== "stripe") {
                        const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
                        return { ...invoice, lastSentAt: lastSend };
                    }

                    try {
                        if (!invoice.company || !invoice.company.stripeAccountId) {
                            console.warn(`Empresa associada à invoice ${invoice.id} não está conectada ao Stripe.`);
                            return invoice;
                        }

                        const stripeAccountId = invoice.company.stripeAccountId;

                        if (!invoice.stripeInvoiceId) {
                            return res.status(400).json({ error: "Stripe invoice ID is missing" });
                        }

                        const stripeInvoice = await stripe.invoices.retrieve(
                            invoice.stripeInvoiceId,
                            { stripeAccount: stripeAccountId }
                        );

                        const status = stripeInvoice.status ?? "draft";

                        if (invoice.status !== status) {
                            await prisma.invoice.update({
                                where: { id: invoice.id },
                                data: { status }
                            });
                            console.log(`Status da fatura ${invoice.stripeInvoiceId} atualizado para ${status}`);
                            return { ...invoice, status };
                        }

                        const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;

                        return {
                            ...invoice,
                            lastSentAt: lastSend
                        };
                    } catch (stripeError: any) {
                        if (stripeError.code === 'resource_missing') {
                            console.warn(`Invoice não encontrada no Stripe: ${invoice.stripeInvoiceId}.`);
                            return { ...invoice, status: "not_found_in_stripe", error: stripeError.message };
                        }

                        console.error(`Erro ao buscar invoice ${invoice.stripeInvoiceId} no Stripe:`, stripeError);
                        return invoice;
                    }
                })
            );

            return res.status(200).json({
                total,
                invoices: updatedInvoices
            });
        } catch (error) {
            console.error("Erro ao buscar invoices:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    /* ------------------------------------------------------------------
   ADICIONE dentro da classe StripeController
-------------------------------------------------------------------*/
    async updateInvoice(req: Request, res: Response) {
        const {
            invoiceId
        } = req.params;

        const {
            coefficientPerfentage,
            description,
            dueDate,
            userId,
            type_value,
            totalAmount
        } = req.body;

        try {
            const oldInvoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                include: {
                    project: {
                        include: {
                            client: true,
                            company: true
                        }
                    },
                    InvoiceItems: true
                }
            });

            if (!oldInvoice || !oldInvoice.project || !oldInvoice.project.company || !oldInvoice.project.client) {
                console.log({
                    message: "Invoice, project, company, or client not found", oldInvoice
                });

                return res.status(404).json({
                    error: "Invoice, project, company, or client not found"
                });
            }

            if (!oldInvoice?.stripeInvoiceId) {
                return res.status(400).json({
                    error: "Invoice is not linked to Stripe yet"
                });
            }
            const stripeInvoiceId = oldInvoice.stripeInvoiceId;

            const company = oldInvoice.project.company;
            const client = oldInvoice.project.client;
            const stripeAccountId = company.stripeAccountId ?? undefined;

            await stripe.invoices.voidInvoice(stripeInvoiceId, { stripeAccount: stripeAccountId });

            await prisma.invoice.update({
                where: {
                    id: oldInvoice.id
                },
                data: {
                    status: "void", cancel_invoice_edit: true
                }
            });

            await prisma.invoiceTimeline.create({
                data: {
                    description: "Invoice canceled for editing",
                    invoiceId: oldInvoice.id
                }
            });

            let stripeCustomerId = client.stripeCustomerId;
            if (!stripeCustomerId) {
                const newCustomer = await stripe.customers.create(
                    {
                        name: client.name,
                        email: client.email,
                        phone: client.phone ?? undefined
                    },
                    { stripeAccount: stripeAccountId }
                );
                stripeCustomerId = newCustomer.id;
                await prisma.client.update({
                    where: { id: client.id },
                    data: { stripeCustomerId }
                });
            }

            const currentDate = new Date();
            const dueDateObj = new Date(dueDate);
            const daysUntilDue = Math.max(
                0,
                Math.ceil((dueDateObj.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
            );

            const draftInvoice = await stripe.invoices.create(
                {
                    customer: stripeCustomerId,
                    collection_method: "send_invoice",
                    days_until_due: daysUntilDue,
                    auto_advance: true,
                    currency: "usd",
                    metadata: { projectId: oldInvoice.projectId }
                },
                { stripeAccount: stripeAccountId }
            );

            const finalized = await stripe.invoices.finalizeInvoice(
                draftInvoice.id,
                { stripeAccount: stripeAccountId }
            );

            const newInvoice = await prisma.invoice.create({
                data: {
                    stripeInvoiceId: finalized.id,
                    // externalInvoiceId: finalized.id,
                    externalInvoiceId: oldInvoice.externalInvoiceId,
                    invoiceType: "stripe",
                    projectId: oldInvoice.projectId,
                    companyId: company.id,
                    totalAmount: totalAmount,
                    status: finalized.status ?? "draft",
                    invoiceUrl: finalized.hosted_invoice_url,
                    dueDate: dueDateObj,
                    description,
                    percentageCoefficient: coefficientPerfentage,
                    type_value,
                    user_id: userId
                }
            });

            await prisma.invoiceTimeline.create({
                data: {
                    description: "Invoice recreated after edit",
                    invoiceId: newInvoice.id
                }
            });

            return res.status(200).json({
                message: "Invoice updated (old one voided, new one created)",
                oldInvoiceId: oldInvoice.id,
                newInvoiceId: newInvoice.id,
                newInvoiceUrl: finalized.hosted_invoice_url
            });

        } catch (err) {
            console.error("Erro no updateInvoice:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    async createCheckoutSession(req: Request, res: Response) {
        try {
            const {
                planId,
                companyId,
                referralId // ✅ Receber o referral ID do front-end
            } = req.body;

            if (!planId || !companyId) {
                return res.status(400).json({ error: "IDs do plano e da empresa são obrigatórios" });
            }

            // Buscar informações do plano
            const plan = await prisma.plan.findUnique({
                where: { id: planId }
            });

            if (!plan) {
                return res.status(404).json({ error: "Plano não encontrado" });
            }

            // Verificar se é um plano gratuito
            if (plan.validityType === 'FREE') {
                return res.status(400).json({
                    error: "Planos gratuitos não precisam de checkout",
                    isFree: true
                });
            }

            // Verificar se temos as informações do Stripe necessárias
            if (!plan.stripePriceId) {
                return res.status(400).json({ error: "Plano não está configurado para pagamentos" });
            }

            // Buscar a empresa para verificar se já tem stripeCustomerId
            const company = await prisma.company.findUnique({
                where: { id: companyId }
            });

            if (!company) {
                return res.status(404).json({ error: "Empresa não encontrada" });
            }

            // Preparar datas para a assinatura
            const startDate = new Date();
            let endDate = new Date();

            if (plan.validityType === 'MONTHLY') {
                endDate.setMonth(endDate.getMonth() + plan.validityDuration);
            } else if (plan.validityType === 'ANNUAL') {
                endDate.setFullYear(endDate.getFullYear() + plan.validityDuration);
            } else {
                endDate.setDate(endDate.getDate() + plan.validityDuration);
            }

            // ✅ SOLUÇÃO FINAL: Separação de responsabilidades
            // client_reference_id: APENAS para Rewardful (referral ID)
            // metadata: Para sistema interno (companyId, planId, etc.)

            const clientReferenceId = referralId || null; // Apenas referral ID (ou null)

            if (referralId) {
                console.log('🎯 [Rewardful] Referral ID enviado para rastreamento:', referralId);
            } else {
                console.log('📋 [Info] Nenhum referral ID - checkout direto');
            }

            // Configuração base da sessão de checkout
            const sessionConfig: Stripe.Checkout.SessionCreateParams = {
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: plan.stripePriceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: `${process.env.URL_FRONT}/loading?checkout_success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.URL_FRONT}/login`,
                // client_reference_id: clientReferenceId, // ✅ APENAS referralId (para Rewardful)
                metadata: {
                    // ✅ Sistema interno usa metadata (sem limites de tamanho)
                    planId,
                    companyId,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    validityType: plan.validityType,
                    validityDuration: plan.validityDuration.toString(),
                    allowedEmployees: company.allowedEmployees !== null ?
                        company.allowedEmployees.toString() :
                        plan.allowedEmployees !== null ?
                            plan.allowedEmployees.toString() :
                            null,
                    // ✅ Referral ID também no metadata para backup/debugging
                    ...(referralId && { referralId })
                },
                ...(referralId && referralId.trim() !== '' && { client_reference_id: referralId }), // Incluir client_reference_id 
            };

            // Se a empresa já tem um stripeCustomerId, usamos ele para evitar duplicação
            if (company.stripeCustomerId) {
                console.log(`Usando cliente Stripe existente: ${company.stripeCustomerId}`);
                sessionConfig.customer = company.stripeCustomerId;
            }

            // Criar a sessão de checkout
            const session = await stripe.checkout.sessions.create(sessionConfig);

            console.log('✅ [StripeController] Sessão de checkout criada com sucesso:', session.id);
            if (referralId) {
                console.log('✅ [Rewardful] Referral ID incluído no checkout para rastreamento');
            }

            return res.status(200).json({
                checkoutUrl: session.url,
                sessionId: session.id
            });
        } catch (error) {
            console.error("Erro ao criar sessão de checkout:", error);
            return res.status(500).json({ error: "Erro interno ao processar o checkout" });
        }
    }

    // portal do cliente
    async createCustomerPortalSession(req: Request, res: Response) {
        try {
            const { companyId } = req.params;
            const { returnUrl } = req.body; // Receber a URL de redirecionamento do front-end

            if (!companyId) {
                return res.status(400).json({ error: "Company ID is required." });
            }

            // Buscar a empresa
            const company = await prisma.company.findUnique({
                where: { id: companyId }
            });

            if (!company) {
                return res.status(404).json({ error: "Company not found." });
            }

            // Buscar a assinatura ativa mais recente
            const subscription = await prisma.subscription.findFirst({
                where: {
                    companyId,
                    // isActive: true
                },
                orderBy: {
                    startDate: 'desc'
                }
            });

            if (!subscription || !subscription.stripeSubscriptionId) {
                return res.status(400).json({ error: "No active subscription found for this company." });
            }

            // Obter a assinatura do Stripe para encontrar o cliente
            const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
            console.log("Assinatura Stripe verificada:", subscription.stripeSubscriptionId, "status:", stripeSubscription.status);

            if (!stripeSubscription.customer) {
                return res.status(400).json({ error: "Stripe customer not found for this subscription." });
            }

            // Criar a sessão do portal do cliente
            const session = await stripe.billingPortal.sessions.create({
                customer: String(stripeSubscription.customer),
                return_url: `${process.env.URL_FRONT}/${returnUrl}` || `${process.env.URL_FRONT}/login`, // Usar a URL fornecida ou fallback para /login
            });

            return res.json({ url: session.url });
        } catch (error) {
            console.error("Erro ao criar sessão do portal do cliente:", error);
            return res.status(500).json({
                error: error instanceof Error ? error.message : "Internal server error"
            });
        }
    }

}
