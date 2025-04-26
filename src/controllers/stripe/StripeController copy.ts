// import { Request, Response } from "express";
// import { stripeConfig } from "../../config/stripe";
// import { prisma } from "../../utils/prisma";
// import dotenv from "dotenv";

// dotenv.config(); 

// const stripe = stripeConfig.getClient();

// export class StripeController {

//     async connectCompany(req: Request, res: Response) {
//         const { companyId } = req.params;

//         try {
//             const company = await prisma.company.findUnique({
//                 where: { id: companyId },
//             });

//             if (!company) {
//                 return res.status(404).json({ error: "Company not found" });
//             }

//             let stripeAccountId = company.stripeAccountId;

//             if (!stripeAccountId) {
//                 const account = await stripe.accounts.create({ type: "standard" });
//                 stripeAccountId = account.id;

//                 await prisma.company.update({
//                     where: { id: companyId },
//                     data: { stripeAccountId },
//                 });
//             }

//             const account = await stripe.accounts.retrieve(stripeAccountId);

//             if (!account.requirements?.disabled_reason) {
//                 return res.status(400).json({ error: "Account already connected" });
//             }

//             // Redireciona para o onboarding existente
//             const accountLink = await stripe.accountLinks.create({
//                 account: stripeAccountId,
//                 refresh_url: `${process.env.URL_FRONT}/stripe-config`,
//                 return_url: `${process.env.URL_FRONT}/stripe-config`,
//                 type: "account_onboarding",
//             });

//             return res.status(200).json({ url: accountLink.url });
//         } catch (error) {
//             console.error("Erro ao criar conta Stripe:", error);
//             return res.status(500).json({ error: "Error creating Stripe account" });
//         }
//     }

//     async checkStripeStatus(req: Request, res: Response) {
//         const { companyId } = req.params;

//         try {
//             const company = await prisma.company.findUnique({
//                 where: { id: companyId },
//             });

//             if (!company) {
//                 return res.status(404).json({ error: "Company not found" });
//             }

//             // Verifica se a empresa já tem um stripeAccountId
//             const hasStripeAccount = !!company.stripeAccountId;

//             if (!hasStripeAccount) {
//                 return res.status(200).json({
//                     hasStripeAccount: false,
//                     connected: false,
//                     requiresOnboarding: true,
//                     pendingRequirements: []
//                 });
//             }

//             if (!company.stripeAccountId) {
//                 return res.status(400).json({ error: "Stripe account ID is missing" });
//             }

//             // Recupera os detalhes da conta Stripe
//             const account = await stripe.accounts.retrieve(company.stripeAccountId);

//             // account.details_submitted === false indica que o onboarding nao foi concluido
//             // account.charges_enabled → true (habilitado para receber pagamentos)
//             // account.payouts_enabled → true (habilitado para receber transferências)
//             // account.requirements.currently_due.length === 0 (nenhum requisito pendente)

//             const isConnected = account.details_submitted && account.charges_enabled && account.payouts_enabled;
//             const pendingRequirements = account.requirements?.currently_due || [];
//             const requiresOnboarding = !isConnected || pendingRequirements.length > 0;

//             console.log("StripeAccountId: ", company.stripeAccountId)
//             console.log("details_submitted: ", account.details_submitted)
//             console.log("charges_enabled: ", account.charges_enabled)
//             console.log("payouts_enabled: ", account.payouts_enabled)
//             console.log("Requirements: ", account.requirements?.currently_due)


//             return res.status(200).json({
//                 hasStripeAccount: true,
//                 connected: isConnected,
//                 requiresOnboarding,
//                 pendingRequirements
//             });
//         } catch (error) {
//             console.error("Erro ao verificar status do Stripe:", error);
//             return res.status(500).json({ error: "Internal Server Error" });
//         }
//     }

//     async createInvoice(req: Request, res: Response) {
//         const { projectId } = req.params;
//         const { coefficientPerfentage, description, dueDate, userId } = req.body;

//         try {
//             console.log("Buscando o projeto no banco de dados...");
//             const project = await prisma.project.findUnique({
//                 where: { id: projectId },
//                 include: {
//                     client: true,
//                     serviceProject: true,
//                     company: true,
//                 },
//             });

//             if (!project) {
//                 console.error("Projeto não encontrado!");
//                 return res.status(404).json({ error: "Project not found" });
//             }

//             if (!project.client) {
//                 console.error("Cliente não encontrado para este projeto!");
//                 return res.status(400).json({ error: "Client not found" });
//             }

//             if (!project.company || !project.company.stripeAccountId) {
//                 console.error("Empresa não conectada ao Stripe!");
//                 return res.status(400).json({ error: "Company not connected to Stripe" });
//             }

//             console.log("Projeto, cliente e empresa encontrados com sucesso!");

//             const emailClient = project.client.email || "";
//             const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
//             if (!emailRegex.test(emailClient)) {
//                 console.error("Endereço de email inválido!");
//                 return res.status(400).json({ error: "Invalid client email address" });
//             }

//             const stripeAccountId = project.company.stripeAccountId;
//             console.log("StripeAccountId da empresa:", stripeAccountId);

//             let stripeCustomerId = project.client.stripeCustomerId;

//             if (stripeCustomerId) {
//                 try {
//                     await stripe.customers.retrieve(
//                         stripeCustomerId,
//                         { stripeAccount: stripeAccountId }
//                     );
//                     console.log(`Cliente já tem um StripeCustomerId: ${stripeCustomerId}`);
//                 } catch (error: any) {
//                     if (error.code === 'resource_missing') {
//                         console.warn("Cliente não encontrado no Stripe. Criando um novo...");
//                         stripeCustomerId = null;
//                     } else {
//                         throw error;
//                     }
//                 }
//             }
    
//             if (!stripeCustomerId) {
//                 console.log("Criando cliente no Stripe...");
//                 const customer = await stripe.customers.create(
//                     {
//                         name: project.client.name,
//                         email: project.client.email,
//                         phone: project.client.phone ?? undefined,
//                     },
//                     { stripeAccount: stripeAccountId }
//                 );
//                 stripeCustomerId = customer.id;
    
//                 await prisma.client.update({
//                     where: { id: project.client.id },
//                     data: { stripeCustomerId },
//                 });
    
//                 console.log(`Cliente criado no Stripe com ID: ${stripeCustomerId}`);
//             }
        
//             console.log("Criando Invoice Items...");
//             let totalAmount = 0;

//             const currentDate = new Date();
//             const dueDateObj = new Date(dueDate);
//             const daysUntilDue = Math.ceil((dueDateObj.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

//             // 1️⃣ Criar a fatura antes dos itens
//             const invoice = await stripe.invoices.create(
//                 {
//                     customer: stripeCustomerId,
//                     collection_method: "send_invoice",
//                     days_until_due: daysUntilDue > 0 ? daysUntilDue : 0,
//                     auto_advance: true,
//                     currency: "usd",
//                     metadata: {
//                         projectId: projectId,
//                     }
//                 },
//                 { stripeAccount: stripeAccountId }
//             );

//             for (const service of project.serviceProject) {
//                 const hours = Number(service.hours) || 0;
//                 const price = Number(service.price) || 0;
//                 const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 0;

//                 const serviceAmount = hours * price;
//                 const adjustedAmount = serviceAmount * validCoefficient;

//                 console.log("-------- Detalhes do Serviço --------");
//                 console.log(`Serviço: ${service.name}`);
//                 console.log(`Horas (hours): ${service.hours} -> Convertido: ${hours}`);
//                 console.log(`Preço (price): ${service.price} -> Convertido: ${price}`);
//                 console.log(`Coeficiente (coefficient): ${coefficientPerfentage} -> Válido: ${validCoefficient}`);
//                 console.log(`Valor Bruto (serviceAmount): ${serviceAmount}`);
//                 console.log(`Valor Ajustado (adjustedAmount): ${adjustedAmount}`);
//                 console.log("------------------------------------");

//                 if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
//                     console.warn(`⚠️ Valor inválido para o serviço: ${service.name}. O item será ignorado.`);
//                     continue;
//                 }

//                 totalAmount += adjustedAmount;

//                 console.log(` Adicionando serviço ajustado: ${service.name} - Valor final: $${adjustedAmount.toFixed(2)}`);

//                 await stripe.invoiceItems.create(
//                     {
//                         customer: stripeCustomerId,
//                         amount: Math.round(adjustedAmount * 100), // Convertendo para centavos
//                         currency: "usd",
//                         description: `${service.name} - ${service.description || "No additional description"}`,
//                         invoice: invoice.id // 3️⃣ Associar o item à fatura criada
//                     },
//                     { stripeAccount: stripeAccountId }
//                 );
//             }

//             // 4️⃣ Finalizar a fatura após adicionar os itens
//             const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, { stripeAccount: stripeAccountId });

//             console.log("Salvando Invoice no banco de dados...");
//             const newInvoice = await prisma.invoice.create({
//                 data: {
//                     stripeInvoiceId: finalizedInvoice.id,
//                     projectId: project.id,
//                     companyId: project.company_id,
//                     totalAmount: totalAmount,
//                     status: finalizedInvoice.status ?? "draft",
//                     invoiceUrl: finalizedInvoice.hosted_invoice_url,
//                     dueDate: dueDateObj,
//                     description: description,
//                     percentageCoefficient: coefficientPerfentage,
//                     user_id: userId,
//                 },
//             });

//             console.log("Invoice salva no banco com ID:", newInvoice.id);

//             return res.status(200).json({
//                 message: "Invoice created and recorded successfully",
//                 invoiceUrl: finalizedInvoice.hosted_invoice_url,
//                 invoiceId: finalizedInvoice.id,
//                 databaseInvoice: newInvoice,
//             });

//         } catch (error) {
//             console.error("Erro ao criar Invoice:", error);
//             return res.status(500).json({ error: "Internal Server Error" });
//         }
//     }

//     async sendInvoice(req: Request, res: Response) {
//         const { invoiceId } = req.params;
//         const { userId } = req.body;

//         try {
//             const invoice = await prisma.invoice.findUnique({
//                 where: { stripeInvoiceId: invoiceId },
//                 include: {
//                     project: {
//                         include: {
//                             client: true,
//                             company: true,
//                         },
//                     },
//                 },
//             });

//             if (!invoice || !invoice.project || !invoice.project.company || !invoice.project.client) {
//                 return res.status(404).json({ error: "Invoice, project, company, or client not found" });
//             }

//             const stripeAccountId = invoice.project.company.stripeAccountId ?? undefined;

//             console.log("Enviando Invoice por e-mail...");
//             await stripe.invoices.sendInvoice(invoiceId, { stripeAccount: stripeAccountId });

//             console.log("Invoice enviada por e-mail para:", invoice.project.client.email);

//             console.log("userId: ", userId)

//             const sendHistory = await prisma.invoiceSendHistory.create({
//                 data: {
//                     invoiceId: invoice.id,               // ID da invoice enviada
//                     recipient: invoice.project.client.email, // E-mail do destinatário
//                     user_id: userId                      // ID do usuário que enviou a invoice
//                 },
//             });

//             return res.status(200).json({ message: "Invoice sent successfully", sendHistory });

//         } catch (error) {
//             console.error("Erro ao enviar Invoice:", error);
//             return res.status(500).json({ error: "Internal Server Error" });
//         }
//     }

//     async cancelInvoice(req: Request, res: Response) {
//         const { invoiceId } = req.params;

//         try {
//             const invoice = await prisma.invoice.findUnique({
//                 where: { stripeInvoiceId: invoiceId },
//                 include: {
//                     project: {
//                         include: {
//                             company: true,
//                         },
//                     },
//                 },
//             });

//             if (!invoice || !invoice.project || !invoice.project.company) {
//                 return res.status(404).json({ error: "Invoice, project, or company not found" });
//             }

//             const stripeAccountId = invoice.project.company.stripeAccountId ?? undefined;

//             console.log("Cancelando a Invoice no Stripe...");
//             const canceledInvoice = await stripe.invoices.voidInvoice(invoiceId, { stripeAccount: stripeAccountId });

//             console.log("Atualizando status da Invoice no banco de dados...");
//             const updatedInvoice = await prisma.invoice.update({
//                 where: { stripeInvoiceId: invoiceId },
//                 data: { status: "void" },
//             });

//             console.log("Invoice cancelada com sucesso!");

//             return res.status(200).json({
//                 message: "Invoice canceled successfully",
//                 updatedInvoice,
//             });

//         } catch (error) {
//             console.error("Erro ao cancelar Invoice:", error);
//             return res.status(500).json({ error: "Internal Server Error" });
//         }
//     }


//     async getInvoicesByProject(req: Request, res: Response) {
//         const { projectId } = req.params;
//         const { searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

//         try {
//             console.log(" Buscando invoices do projeto:", projectId);

//             const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
//             const itemsLimit = Number(itemsPerPage);
//             const search = typeof searchTerm === 'string' ? searchTerm : "";

//             const filtro = {
//                 projectId,
//                 OR: [
//                     {
//                         project: {
//                             is: {
//                                 client: {
//                                     is: {
//                                         name: {
//                                             contains: search,
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     },
//                     {
//                         stripeInvoiceId: {
//                             contains: search,
//                         }
//                     }
//                 ]
//             };

//             // Buscar invoices relacionadas ao ProjectId com a empresa associada
//             const invoices = await prisma.invoice.findMany({
//                 where: filtro,
//                 orderBy: { createdAt: "desc" },
//                 include: {
//                     company: true, // Inclui a empresa para obter o stripeAccountId
//                     InvoiceSendHistory: {
//                         orderBy: { sentAt: "desc" }
//                     },
//                     project: {
//                         include: {
//                             client: {
//                                 select: { id: true, name: true, email: true }
//                             }
//                         }
//                     },
//                 },
//                 skip: pageNumber * itemsLimit,
//                 take: itemsLimit
//             });

//             const total = await prisma.invoice.count({ where: filtro });

//             if (invoices.length === 0) {
//                 console.log(" Nenhuma invoice encontrada para este projeto.");
//                 return res.status(404).json({ message: "No invoices found for this project." });
//             }

//             console.log(` ${invoices.length} invoices encontradas.`);

//             const updatedInvoices = await Promise.all(
//                 invoices.map(async (invoice) => {
//                     try {
//                         // Verificar se a empresa possui um stripeAccountId
//                         if (!invoice.company || !invoice.company.stripeAccountId) {
//                             console.warn(` Empresa associada à invoice ${invoice.id} não está conectada ao Stripe.`);
//                             return invoice;
//                         }

//                         const stripeAccountId = invoice.company.stripeAccountId;

//                         // Buscar o status da fatura na conta conectada do Stripe
//                         const stripeInvoice = await stripe.invoices.retrieve(
//                             invoice.stripeInvoiceId,
//                             { stripeAccount: stripeAccountId }
//                         );

//                         const status = stripeInvoice.status ?? "draft";

//                         // Atualizar o status no banco de dados, se necessário
//                         if (invoice.status !== status) {
//                             await prisma.invoice.update({
//                                 where: { id: invoice.id },
//                                 data: { status },
//                             });

//                             console.log(` Status da fatura ${invoice.stripeInvoiceId} atualizado para ${status}`);
//                             return { ...invoice, status };
//                         }

//                         // ✅ Pegando a data do último envio
//                         const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;

//                         return { ...invoice, lastSentAt: lastSend };

//                     } catch (stripeError: any) {
//                         if (stripeError.code === 'resource_missing') {
//                             console.warn(` Invoice não encontrada no Stripe: ${invoice.stripeInvoiceId}.`);
//                             return {
//                                 ...invoice,
//                                 status: "not_found_in_stripe",
//                                 error: stripeError.message,
//                             };
//                         }

//                         console.error(` Erro ao buscar invoice ${invoice.stripeInvoiceId} no Stripe:`, stripeError);
//                         return invoice;
//                     }
//                 })
//             );

//             return res.status(200).json({total, invoices: updatedInvoices});

//         } catch (error) {
//             console.error(" Erro ao buscar invoices:", error);
//             return res.status(500).json({ error: "Internal Server Error" });
//         }
//     }

//     async getInvoicesByCompany(req: Request, res: Response) {
//         const { companyId } = req.params;
//         const { searchTerm = "", page = 1, itemsPerPage = 10 } = req.query; // Parâmetros para paginação e pesquisa

//         try {
//             console.log("Buscando invoices da empresa:", companyId);

//             const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
//             const itemsLimit = Number(itemsPerPage);
//             const search = typeof searchTerm === 'string' ? searchTerm : "";

//             // Filtro para busca com base no nome do cliente
//             const filtro = {
//                 companyId,
//                 OR: [
//                     {
//                         project: {
//                             is: {
//                                 client: {
//                                     is: {
//                                         name: {
//                                             contains: search,
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     },
//                     {
//                         stripeInvoiceId: {
//                             contains: search,
//                         }
//                     }
//                 ]

//             };

//             // Buscar invoices relacionadas ao companyId com paginação
//             const invoices = await prisma.invoice.findMany({
//                 where: filtro,
//                 orderBy: { createdAt: "desc" },
//                 include: {
//                     company: true,
//                     InvoiceSendHistory: { orderBy: { sentAt: "desc" } },
//                     project: {
//                         include: {
//                             client: {
//                                 select: { id: true, name: true, email: true }
//                             }
//                         }
//                     }
//                 },
//                 skip: pageNumber * itemsLimit,
//                 take: itemsLimit
//             });

//             const total = await prisma.invoice.count({ where: filtro });

//             const updatedInvoices = await Promise.all(
//                 invoices.map(async (invoice) => {
//                     try {
//                         if (!invoice.company || !invoice.company.stripeAccountId) {
//                             console.warn(`Empresa associada à invoice ${invoice.id} não está conectada ao Stripe.`);
//                             return invoice;
//                         }

//                         const stripeAccountId = invoice.company.stripeAccountId;

//                         const stripeInvoice = await stripe.invoices.retrieve(
//                             invoice.stripeInvoiceId,
//                             { stripeAccount: stripeAccountId }
//                         );

//                         const status = stripeInvoice.status ?? "draft";

//                         if (invoice.status !== status) {
//                             await prisma.invoice.update({
//                                 where: { id: invoice.id },
//                                 data: { status }
//                             });
//                             console.log(`Status da fatura ${invoice.stripeInvoiceId} atualizado para ${status}`);
//                             return { ...invoice, status };
//                         }

//                         const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;

//                         return { ...invoice, lastSentAt: lastSend };
//                     } catch (stripeError: any) {
//                         if (stripeError.code === 'resource_missing') {
//                             console.warn(`Invoice não encontrada no Stripe: ${invoice.stripeInvoiceId}.`);
//                             return { ...invoice, status: "not_found_in_stripe", error: stripeError.message };
//                         }

//                         console.error(`Erro ao buscar invoice ${invoice.stripeInvoiceId} no Stripe:`, stripeError);
//                         return invoice;
//                     }
//                 })
//             );

//             return res.status(200).json({ total, invoices: updatedInvoices });

//         } catch (error) {
//             console.error("Erro ao buscar invoices:", error);
//             return res.status(500).json({ error: "Internal Server Error" });
//         }
//     }


// }
