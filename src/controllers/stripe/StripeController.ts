import { Request, Response } from "express";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { QuickBooksInvoiceController } from "../quickbooks/invoice/QuickBooksInvoiceController";
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
    private quickBooksController: QuickBooksInvoiceController;

    constructor() {
        this.quickBooksController = new QuickBooksInvoiceController();
    }

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
            type_invoicebase,
            estimateId,
            multi_emails
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

            console.log("Processando serviços e calculando valores...");
            const servicesArray = Array.isArray(services) ? services : [];
            if (servicesArray.length === 0) {
                console.warn("Nenhum serviço fornecido. Invoice será criada sem itens.");
            }

            // Buscar invoices pagos do projeto para calcular valor já pago
            console.log("Buscando invoices pagos do projeto...");
            const paidInvoices = await prisma.invoice.findMany({
                where: {
                    projectId: project.id,
                    status: "paid"
                },
                select: {
                    totalAmount: true
                }
            });

            const totalPaidAmount = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
            console.log(`Total já pago no projeto: $${totalPaidAmount}`);

            // Calcular valor total original do projeto (sem coeficiente)
            const originalProjectValue = servicesArray.reduce((sum, service) => {
                const quantity = Number(service.quantity) || 0;
                const price = Number(service.price) || 0;
                return sum + (service.total || (quantity * price));
            }, 0);

            console.log(`Valor original do projeto: $${originalProjectValue}`);

            // Calcular saldo restante após pagamentos
            const remainingBalance = Math.max(0, originalProjectValue - totalPaidAmount);
            console.log(`Saldo restante: $${remainingBalance}`);

            // Aplicar coeficiente sobre o saldo restante
            const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 1;
            const invoiceAmountWithCoefficient = remainingBalance * validCoefficient;
            console.log(`Valor da fatura após coeficiente (${validCoefficient}): $${invoiceAmountWithCoefficient}`);

            let totalInvoiceAmount = 0;
            const lineItems: any[] = [];

            const dueDateObj = dueDate ? new Date(dueDate) : new Date();

            // Processar serviços com nova lógica
            for (const service of servicesArray) {
                const quantity = Number(service.quantity) || 0;
                const price = Number(service.price) || 0;
                const originalServiceAmount = service.total || (quantity * price);

                // Calcular proporção deste serviço no valor total original
                const serviceProportion = originalProjectValue > 0 ? originalServiceAmount / originalProjectValue : 0;

                // Aplicar a proporção ao valor da fatura com coeficiente
                const adjustedAmount = invoiceAmountWithCoefficient * serviceProportion;

                if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
                    console.warn(`Valor inválido para o serviço: ${service.name}. O item será ignorado.`);
                    continue;
                }

                totalInvoiceAmount += adjustedAmount;

                lineItems.push({
                    name: service.name,
                    description: createSafeDescription(service.name, service.description || "No additional description"),
                    quantity,
                    price,
                    totalAmount: adjustedAmount
                });

                console.log(`Serviço ${service.name}: Valor original $${originalServiceAmount}, Valor ajustado $${adjustedAmount.toFixed(2)}`);
            }

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
                    // NÃO MAIS CRIADO NO STRIPE - apenas local
                    stripeInvoiceId: null,
                    externalInvoiceId: nextInvoiceNumber.toString(),
                    invoiceType: "stripe", // Tipo principal é stripe
                    invoiceTypeStripe: "payment_element", // Subtipo específico do Stripe
                    projectId: project.id,
                    companyId: project.company_id,
                    totalAmount: totalAmount,
                    status: "open", // Sempre começa como open
                    invoiceUrl: null, // Não tem URL do Stripe
                    dueDate: dueDateObj,
                    description: description,
                    percentageCoefficient: coefficientPerfentage,
                    type_value: type_value,
                    user_id: userId,
                    estimateId: estimate?.id || null,
                    type_invoicebase: type_invoicebase,
                    multi_emails: multi_emails
                },
            });

            console.log("Invoice salva no banco com ID:", newInvoice.id);

            // Adicionar os InvoiceItems
            if (lineItems && lineItems.length > 0) {
                await prisma.invoiceItem.createMany({
                    data: lineItems.map((item) => ({
                        invoiceId: newInvoice.id,
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        price: item.price,
                        totalAmount: item.totalAmount,
                    })),
                });
            }

            // Registrar evento na timeline
            await prisma.invoiceTimeline.create({
                data: {
                    description: `Created`,
                    invoice: {
                        connect: { id: newInvoice.id }
                    }
                }
            });

            // Tentar criar invoice no QuickBooks (não deve falhar o processo se der erro)
            let quickBooksResult = null;
            let quickBooksError = null;

            try {
                console.log("Tentando criar invoice no QuickBooks...");

                // Verificar se o usuário tem uma conta QuickBooks conectada
                const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
                    where: { user_id: userId },
                });

                if (quickBooksAccount) {
                    // Preparar serviços para o formato esperado pelo QuickBooks
                    const qbServices = services.map((service: any) => ({
                        name: service.name || "Service",
                        description: service.description || "",
                        quantity: service.quantity || 1,
                        price: service.price || 0,
                        total: service.total || (service.quantity * service.price)
                    }));

                    // Usar o controller instanciado no constructor
                    const qbController = this.quickBooksController;

                    if (!qbController) {
                        throw new Error("QuickBooksController is not initialized");
                    }

                    quickBooksResult = await qbController.createInvoiceInternal({
                        projectId: project.id,
                        description: description || `Invoice for Project ${project.id}`,
                        type_invoicebase: type_invoicebase,
                        dueDate: dueDate,
                        userId: userId,
                        coefficientPerfentage: coefficientPerfentage,
                        services: qbServices,
                        type_value: type_value,
                        totalAmountTarget: totalAmount, // Passar o valor total exato do banco local
                        calledFromStripe: true // Indicar que foi chamado pelo Stripe
                    });

                    console.log("Invoice criado no QuickBooks com sucesso:", quickBooksResult?.quickbooksId);

                    // Atualizar o invoice Stripe com os dados do QuickBooks
                    if (quickBooksResult?.quickbooksId) {
                        await prisma.invoice.update({
                            where: { id: newInvoice.id },
                            data: {
                                idQuickbookContabio: quickBooksResult.quickbooksId,
                                docNumberQuickBooksContabio: quickBooksResult.docNumber
                            }
                        });
                    }

                    // Adicionar evento na timeline sobre sucesso no QuickBooks
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `QuickBooks invoice created successfully (ID: ${quickBooksResult?.quickbooksId}, DocNumber: ${quickBooksResult?.docNumber})`,
                            invoice: {
                                connect: { id: newInvoice.id }
                            }
                        }
                    });
                } else {
                    console.log("Usuário não possui conta QuickBooks conectada. Pulando criação no QB.");
                }
            } catch (qbError: any) {
                console.error("Erro ao criar invoice no QuickBooks:", qbError.message);
                quickBooksError = qbError.message;

                // Adicionar evento na timeline sobre erro no QuickBooks
                try {
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `Failed to create QuickBooks invoice: ${qbError.message}`,
                            invoice: {
                                connect: { id: newInvoice.id }
                            }
                        }
                    });
                } catch (timelineError) {
                    console.error("Erro ao registrar falha do QuickBooks na timeline:", timelineError);
                }
            }

            return res.status(200).json({
                message: "Invoice created successfully",
                invoiceId: newInvoice.id,
                databaseInvoice: newInvoice,
                quickBooks: {
                    success: !!quickBooksResult,
                    result: quickBooksResult,
                    error: quickBooksError
                }
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
            // Buscar por ID do invoice local (não mais por stripeInvoiceId)
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
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

            // Para novos invoices (payment_element), não tem mais envio via Stripe
            if (invoice.invoiceType === "stripe" && invoice.invoiceTypeStripe === "payment_element") {
                return res.status(400).json({
                    error: "Payment Element invoices are not sent via Stripe. Use payment link instead."
                });
            }

            // Para invoices antigos do Stripe (tipo "invoice"), manter funcionalidade
            if (invoice.invoiceType === "stripe" && invoice.invoiceTypeStripe === "invoice" && invoice.stripeInvoiceId) {
                const stripeAccountId = invoice.project.company.stripeAccountId ?? undefined;

                console.log("Enviando Invoice por e-mail...");
                await stripe.invoices.sendInvoice(invoice.stripeInvoiceId, { stripeAccount: stripeAccountId });

                console.log("Invoice enviada por e-mail para:", invoice.project.client.email);

                const sendHistory = await prisma.invoiceSendHistory.create({
                    data: {
                        invoiceId: invoice.id,
                        recipient: invoice.project.client.email,
                        user_id: userId
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
            }

            return res.status(400).json({ error: "Invoice type not supported for email sending" });

        } catch (error) {
            console.error("Erro ao enviar Invoice:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    async cancelInvoice(req: Request, res: Response) {
        const { invoiceId } = req.params;

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true,
                    status: true,
                    invoiceType: true,
                    invoiceTypeStripe: true,
                    stripeInvoiceId: true,
                    user_id: true,
                    idQuickbookContabio: true,
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

            // Verificar se o invoice já está cancelado
            if (invoice.status === "void") {
                return res.status(400).json({ error: "Invoice already canceled" });
            }

            // Verificar se o invoice já foi pago
            if (invoice.status === "paid") {
                return res.status(400).json({ error: "Cannot cancel a paid invoice" });
            }

            // Se for um invoice antigo do Stripe (tipo "invoice"), tentar cancelar no Stripe também
            if (invoice.invoiceType === "stripe" && invoice.invoiceTypeStripe === "invoice" && invoice.stripeInvoiceId) {
                const stripeAccountId = invoice.project.company.stripeAccountId ?? undefined;

                try {
                    await stripe.invoices.voidInvoice(invoice.stripeInvoiceId, { stripeAccount: stripeAccountId });
                    console.log("Invoice cancelado no Stripe também");
                } catch (stripeError) {
                    console.warn("Erro ao cancelar no Stripe, continuando com cancelamento local:", stripeError);
                }
            }

            // Atualizar status no banco de dados
            const updatedInvoice = await prisma.invoice.update({
                where: {
                    id: invoiceId
                },
                data: {
                    status: "void"
                },
            });

            // Registrar na timeline
            await prisma.invoiceTimeline.create({
                data: {
                    description: `Canceled`,
                    invoice: {
                        connect: {
                            id: invoice.id
                        }
                    }
                }
            });

            // Tentar cancelar invoice no QuickBooks (não deve falhar o processo se der erro)
            let quickBooksCancelResult = null;
            let quickBooksCancelError = null;

            try {
                console.log("Tentando cancelar invoice no QuickBooks...");

                // Verificar se o usuário tem uma conta QuickBooks conectada
                const quickBooksAccount = invoice.user_id ? await prisma.quickBooksAccount.findFirst({
                    where: { user_id: invoice.user_id },
                }) : null;

                // Verificar se o invoice tinha referência do QuickBooks
                if (quickBooksAccount && invoice.idQuickbookContabio && invoice.user_id) {
                    // Usar o controller instanciado no constructor
                    const qbController = this.quickBooksController;

                    if (!qbController) {
                        throw new Error("QuickBooksController is not initialized");
                    }

                    quickBooksCancelResult = await qbController.cancelInvoiceInternal({
                        quickBooksInvoiceId: invoice.idQuickbookContabio,
                        userId: invoice.user_id,
                        companyId: invoice.project.company.id, // Passar o companyId
                        calledFromStripe: true // Indicar que foi chamado pelo Stripe
                    });

                    console.log("Invoice cancelado no QuickBooks com sucesso:", quickBooksCancelResult?.quickbooksId);

                    // Adicionar evento na timeline sobre sucesso no QuickBooks
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `QuickBooks invoice voided successfully (ID: ${quickBooksCancelResult?.quickbooksId})`,
                            invoice: {
                                connect: { id: invoice.id }
                            }
                        }
                    });
                } else {
                    if (!quickBooksAccount) {
                        console.log("Usuário não possui conta QuickBooks conectada. Pulando cancelamento no QB.");
                    } else {
                        console.log("Invoice não possui referência do QuickBooks. Pulando cancelamento no QB.");
                    }
                }
            } catch (qbError: any) {
                console.error("Erro ao cancelar invoice no QuickBooks:", qbError.message);
                quickBooksCancelError = qbError.message;

                // Adicionar evento na timeline sobre erro no QuickBooks
                try {
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `Failed to void QuickBooks invoice: ${qbError.message}`,
                            invoice: {
                                connect: { id: invoice.id }
                            }
                        }
                    });
                } catch (timelineError) {
                    console.error("Erro ao registrar falha do QuickBooks na timeline:", timelineError);
                }
            }

            return res.status(200).json({
                message: "Invoice canceled successfully",
                updatedInvoice,
                quickBooks: {
                    success: !!quickBooksCancelResult,
                    result: quickBooksCancelResult,
                    error: quickBooksCancelError
                }
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

                    // Não mais sincronizar com Stripe - usar dados locais apenas
                    const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
                    return { ...invoice, lastSentAt: lastSend };
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
                            totalAmount: true,
                            amountPaid: true,
                            balanceDue: true,
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
                    PaymentIntents: {
                        select: {
                            id: true,
                            stripePaymentIntentId: true,
                            status: true,
                            amount: true,
                            surchargeAmount: true,
                            currency: true,
                            paymentMethodType: true,
                        }

                    }
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

                    // Não mais sincronizar com Stripe - usar dados locais apenas
                    const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
                    return { ...invoice, lastSentAt: lastSend };
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
        const { invoiceId } = req.params;
        const {
            coefficientPerfentage,
            description,
            dueDate,
            userId,
            type_value,
            services,
            totalAmount,
            multi_emails
        } = req.body;

        try {
            const existingInvoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
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

            if (!existingInvoice || !existingInvoice.project || !existingInvoice.project.company || !existingInvoice.project.client) {
                return res.status(404).json({
                    error: "Invoice, project, company, or client not found"
                });
            }

            // Verificar se o invoice pode ser editado
            if (existingInvoice.status === "paid") {
                return res.status(400).json({
                    error: "Cannot edit a paid invoice"
                });
            }

            if (existingInvoice.status === "void") {
                return res.status(400).json({
                    error: "Cannot edit a canceled invoice"
                });
            }

            console.log("Processando serviços e calculando valores para update...");
            const servicesArray = Array.isArray(services) ? services : [];

            // Buscar invoices pagos do projeto (excluindo o invoice sendo atualizado)
            const paidInvoices = await prisma.invoice.findMany({
                where: {
                    projectId: existingInvoice.project.id,
                    status: "paid",
                    id: { not: invoiceId } // Excluir o invoice sendo atualizado
                },
                select: {
                    totalAmount: true
                }
            });

            const totalPaidAmount = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
            console.log(`Total já pago no projeto (update): $${totalPaidAmount}`);

            // Calcular valor total original do projeto (sem coeficiente)
            const originalProjectValue = servicesArray.reduce((sum, service) => {
                const quantity = Number(service.quantity) || 0;
                const price = Number(service.price) || 0;
                return sum + (service.total || (quantity * price));
            }, 0);

            // Calcular saldo restante após pagamentos
            const remainingBalance = Math.max(0, originalProjectValue - totalPaidAmount);

            // Aplicar coeficiente sobre o saldo restante
            const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 1;
            const invoiceAmountWithCoefficient = remainingBalance * validCoefficient;

            let calculatedTotalAmount = 0;
            const lineItems: any[] = [];

            const dueDateObj = dueDate ? new Date(dueDate) : new Date();

            // Processar serviços com nova lógica
            for (const service of servicesArray) {
                const quantity = Number(service.quantity) || 0;
                const price = Number(service.price) || 0;
                const originalServiceAmount = service.total || (quantity * price);

                // Calcular proporção deste serviço no valor total original
                const serviceProportion = originalProjectValue > 0 ? originalServiceAmount / originalProjectValue : 0;

                // Aplicar a proporção ao valor da fatura com coeficiente
                const adjustedAmount = invoiceAmountWithCoefficient * serviceProportion;

                if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
                    console.warn(`Valor inválido para o serviço: ${service.name}. O item será ignorado.`);
                    continue;
                }

                calculatedTotalAmount += adjustedAmount;

                lineItems.push({
                    name: service.name,
                    description: createSafeDescription(service.name, service.description || "No additional description"),
                    quantity,
                    price,
                    totalAmount: adjustedAmount
                });
            }

            let newInvoiceType
            if (existingInvoice.invoiceType === "custom") {
                newInvoiceType = "stripe";
            } else {
                newInvoiceType = existingInvoice.invoiceType;
            }

            // Atualizar invoice no banco de dados
            const updatedInvoice = await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    totalAmount: totalAmount || calculatedTotalAmount,
                    dueDate: dueDateObj,
                    description: description,
                    percentageCoefficient: coefficientPerfentage,
                    invoiceType: newInvoiceType,
                    invoiceTypeStripe: "payment_element",
                    type_value: type_value,
                    user_id: userId,
                    updatedAt: new Date(),
                    multi_emails: multi_emails
                }
            });

            // Deletar itens antigos e criar novos
            await prisma.invoiceItem.deleteMany({
                where: { invoiceId: invoiceId }
            });

            if (lineItems && lineItems.length > 0) {
                await prisma.invoiceItem.createMany({
                    data: lineItems.map((item) => ({
                        invoiceId: invoiceId,
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        price: item.price,
                        totalAmount: item.totalAmount,
                    }))
                });
            }

            // Registrar na timeline
            await prisma.invoiceTimeline.create({
                data: {
                    description: "Invoice updated",
                    invoiceId: invoiceId
                }
            });

            // Tentar atualizar invoice no QuickBooks (não deve falhar o processo se der erro)
            let quickBooksUpdateResult = null;
            let quickBooksUpdateError = null;

            try {
                console.log("Tentando atualizar invoice no QuickBooks...");

                // Verificar se o usuário tem uma conta QuickBooks conectada
                const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
                    where: { user_id: userId },
                });

                // Verificar se o invoice original tinha referência do QuickBooks
                if (quickBooksAccount && existingInvoice.idQuickbookContabio) {
                    // Preparar serviços para o formato esperado pelo QuickBooks
                    const qbServices = services.map((service: any) => ({
                        name: service.name || "Service",
                        description: service.description || "",
                        quantity: service.quantity || 1,
                        price: service.price || 0,
                        total: service.total || (service.quantity * service.price)
                    }));

                    // Usar o controller instanciado no constructor
                    const qbController = this.quickBooksController;

                    if (!qbController) {
                        throw new Error("QuickBooksController is not initialized");
                    }

                    quickBooksUpdateResult = await qbController.updateInvoiceInternal({
                        quickBooksInvoiceId: existingInvoice.idQuickbookContabio,
                        projectId: existingInvoice.project.id,
                        description: description || `Updated Invoice for Project ${existingInvoice.project.id}`,
                        dueDate: dueDate,
                        userId: userId,
                        coefficientPerfentage: coefficientPerfentage,
                        services: qbServices,
                        totalAmountTarget: totalAmount || calculatedTotalAmount, // Passar o valor total exato do banco local
                        calledFromStripe: true // Indicar que foi chamado pelo Stripe
                    });

                    console.log("Invoice atualizado no QuickBooks com sucesso:", quickBooksUpdateResult?.quickbooksId);

                    // Adicionar evento na timeline sobre sucesso no QuickBooks
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `QuickBooks invoice updated successfully (ID: ${quickBooksUpdateResult?.quickbooksId})`,
                            invoice: {
                                connect: { id: invoiceId }
                            }
                        }
                    });
                } else {
                    if (!quickBooksAccount) {
                        console.log("Usuário não possui conta QuickBooks conectada. Pulando atualização no QB.");
                    } else {
                        console.log("Invoice não possui referência do QuickBooks. Criando referencia.");

                        // TENTAR DE CRIAÇÃO DE INVOICE NO QBO
                        const qbServicesSource =
                            Array.isArray(services) && services.length > 0
                                ? services
                                : (existingInvoice.InvoiceItems || []).map((ii: any) => ({
                                    name: ii.name || "Service",
                                    description: ii.description || "",
                                    quantity: Number(ii.quantity || 1),
                                    price: Number(ii.price || 0),
                                    total: Number(ii.totalAmount || 0),
                                }));

                        const qbServicesForCreate = qbServicesSource.map((s: any) => ({
                            name: s.name || "Service",
                            description: s.description || "",
                            quantity: Number(s.quantity || 1),
                            price: Number(s.price || 0),
                            total: Number(
                                s.total != null ? s.total : (Number(s.quantity || 0) * Number(s.price || 0))
                            ),
                        }));

                        const qbController = this.quickBooksController;
                        if (!qbController) throw new Error("QuickBooksController is not initialized");

                        const createResult = await qbController.createInvoiceInternal({
                            projectId: existingInvoice.project.id,
                            description: description || `Invoice for Project ${existingInvoice.project.id}`,
                            type_invoicebase: (existingInvoice as any).type_invoicebase, // se existir no modelo
                            dueDate: dueDate,
                            userId: userId,
                            coefficientPerfentage: coefficientPerfentage,
                            services: qbServicesForCreate,
                            type_value: type_value,
                            totalAmountTarget: (totalAmount ?? calculatedTotalAmount),
                            calledFromStripe: true,
                        });

                        console.log("Invoice criado no QuickBooks com sucesso:", createResult?.quickbooksId);

                        // Atualizar a fatura local com os identificadores do QuickBooks
                        if (createResult?.quickbooksId) {
                            await prisma.invoice.update({
                                where: { id: invoiceId },
                                data: {
                                    idQuickbookContabio: createResult.quickbooksId,
                                    docNumberQuickBooksContabio: createResult.docNumber ?? null,
                                },
                            });
                        }

                        // Timeline de sucesso
                        await prisma.invoiceTimeline.create({
                            data: {
                                description: `QuickBooks invoice created successfully (ID: ${createResult?.quickbooksId}, DocNumber: ${createResult?.docNumber})`,
                                invoice: { connect: { id: invoiceId } },
                            },
                        });

                        // Para manter a estrutura do retorno
                        quickBooksUpdateResult = createResult;

                    }
                }
            } catch (qbError: any) {
                console.error("Erro ao atualizar invoice no QuickBooks:", qbError.message);
                quickBooksUpdateError = qbError.message;

                // Adicionar evento na timeline sobre erro no QuickBooks
                try {
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `Failed to update QuickBooks invoice: ${qbError.message}`,
                            invoice: {
                                connect: { id: invoiceId }
                            }
                        }
                    });
                } catch (timelineError) {
                    console.error("Erro ao registrar falha do QuickBooks na timeline:", timelineError);
                }
            }

            return res.status(200).json({
                message: "Invoice updated successfully",
                updatedInvoice: updatedInvoice,
                quickBooks: {
                    success: !!quickBooksUpdateResult,
                    result: quickBooksUpdateResult,
                    error: quickBooksUpdateError
                }
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
                referralId //  Receber o referral ID do front-end
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

            // SOLUÇÃO FINAL: Separação de responsabilidades
            // client_reference_id: APENAS para Rewardful (referral ID)
            // metadata: Para sistema interno (companyId, planId, etc.)

            const clientReferenceId = referralId || null; // Apenas referral ID (ou null)

            if (referralId) {
                console.log(' [Rewardful] Referral ID enviado para rastreamento:', referralId);
            } else {
                console.log(' [Info] Nenhum referral ID - checkout direto');
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
                // client_reference_id: clientReferenceId, //  APENAS referralId (para Rewardful)
                metadata: {
                    //  Sistema interno usa metadata (sem limites de tamanho)
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
                    //  Referral ID também no metadata para backup/debugging
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

            console.log(' [StripeController] Sessão de checkout criada com sucesso:', session.id);
            if (referralId) {
                console.log(' [Rewardful] Referral ID incluído no checkout para rastreamento');
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
