// src/controllers/quickbooks/webhook/QuickBooksWebhookWorker.ts
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { sanitizeEmail } from "../util/sanatizeEmail";
import { jsonSafe } from "../customer/quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1100 });

// helper no topo do arquivo (ou antes do uso)
export function extractCustomer(data: any) {
  // 1) Resposta clássica do node-quickbooks para getCustomer
  if (data?.Customer) return data.Customer;
  // 2) Resposta de consulta (query)
  if (data?.QueryResponse?.Customer?.[0]) return data.QueryResponse.Customer[0];
  // 3) Alguns ambientes já retornam o próprio Customer "achatado"
  if (data && typeof data === "object" && data.Id && data.DisplayName) return data;
  return null;
}

export class QuickBooksWebhookWorker {
  static async process(payload: any) {
    const notifs = payload?.eventNotifications ?? [];
    for (const notif of notifs) {
      const realmId: string | undefined = notif?.realmId;
      const entities = notif?.dataChangeEvent?.entities ?? [];
      if (!realmId) continue;

      // Encontre a conta QBO pelo realmId
      const account = await prisma.quickBooksAccount.findFirst({ where: { realmId } });
      if (!account) {
        console.warn("[QBO Webhook] nenhuma conta local para realmId:", realmId);
        continue;
      }

      // Verificar se a conta está desabilitada
      if (account.isDisabled) {
        console.log(`[QBO Webhook] Conta QuickBooks desabilitada para realmId=${realmId}, ignorando webhook`);
        continue;
      }

      // Garanta token válido
      const qb = await this.getQBForAccount(account);

      // Descubra a company_id para salvar no Client
      const companyId = account.company_id;

      if (!companyId) {
        console.warn("[QBO Webhook] Conta sem company_id, ignorando evento");
        continue;
      }

      if (!account.user_id) {
        console.warn("[QBO Webhook] Conta sem user_id, ignorando evento");
        continue;
      }

      // Filtre somente Customer events 
      const customerEvents = entities.filter((e: any) => e.name?.toLowerCase() === "customer");
      
      // ⚠️ Validação de sincronização APENAS para Customer events
      if (customerEvents.length > 0) {
        const syncEnabled = await this.isSyncEnabledForCompany(companyId, account.user_id);
        if (!syncEnabled) {
          console.log(`[QBO Webhook] Sincronização de customers desabilitada para company=${companyId} user=${account.user_id}`);
          // Continue para processar outros eventos (Invoice, Payment)
        } else {
          // Processar customer events apenas se sincronização estiver habilitada
          for (const evt of customerEvents) {
            const id = evt.id;
            const op = (evt.operation || "").toLowerCase(); // create | update | delete | merge ...

            try {
              if (op === "delete") {
                // QBO marca como inativo; se quiser, sincronize um flag local
                await this.handleDeleteCustomer(companyId, id);
                continue;
              }

          // Para create/update/merge: busque o Customer completo
          const current: any = await limiter.schedule(
            () =>
              new Promise((resolve, reject) => {
                qb.getCustomer(id, (err: any, data: any) => (err ? reject(err) : resolve(data)));
              })
          );
          
          // O SDK às vezes retorna em formatos diferentes
          const qbCustomer = extractCustomer(current);
          
          if (!qbCustomer) {
            console.warn(
              "[QBO Webhook] Customer não encontrado ao buscar detalhes:",
              id,
              "shape:", JSON.stringify(Object.keys(current || {}))
            );
            continue;
          }
 
              await this.upsertCustomerFromQBO(companyId, qbCustomer);
            } catch (e: any) {
              console.error("[QBO Webhook] erro entity:", id, e?.message || e);
              await createSyncLog({
                entity: "customers",
                action: "WebhookError",
                entityId: id,
                companyId,
                details: jsonSafe({ message: e?.message || String(e), op }),
              });
            }
          }
        }
      }

      // Processar Invoice events (SEM validação de sincronização)
      const invoiceEvents = entities.filter((e: any) => e.name?.toLowerCase() === "invoice");
      for (const evt of invoiceEvents) {
        const id = evt.id;
        const op = (evt.operation || "").toLowerCase();

        try {
          console.log(`[QBO Webhook] Processando Invoice event: ${op} - ID: ${id}`);

          // Buscar o Invoice completo do QuickBooks
          const invoiceData: any = await limiter.schedule(
            () =>
              new Promise((resolve, reject) => {
                qb.getInvoice(id, (err: any, data: any) => (err ? reject(err) : resolve(data)));
              })
          );

          const qbInvoice = invoiceData?.Invoice || invoiceData;

          if (!qbInvoice || !qbInvoice.Id) {
            console.warn("[QBO Webhook] Invoice não encontrado:", id);
            continue;
          }

          // Processar o invoice
          await this.handleInvoiceEvent(companyId, account.user_id, qbInvoice, op, qb);

        } catch (e: any) {
          console.error("[QBO Webhook] erro ao processar Invoice:", id, e?.message || e);
          await createSyncLog({
            entity: "invoices",
            action: "WebhookError",
            entityId: id,
            companyId,
            details: jsonSafe({ message: e?.message || String(e), op }),
          });
        }
      }

      // Processar Payment events (SEM validação de sincronização - sempre processa pagamentos)
      const paymentEvents = entities.filter((e: any) => e.name?.toLowerCase() === "payment");
      for (const evt of paymentEvents) {
        const id = evt.id;
        const op = (evt.operation || "").toLowerCase();

        try {
          console.log(`[QBO Webhook] Processando Payment event: ${op} - ID: ${id}`);

          // Buscar o Payment completo do QuickBooks
          const paymentData: any = await limiter.schedule(
            () =>
              new Promise((resolve, reject) => {
                qb.getPayment(id, (err: any, data: any) => (err ? reject(err) : resolve(data)));
              })
          );

          const qbPayment = paymentData?.Payment || paymentData;

          if (!qbPayment || !qbPayment.Id) {
            console.warn("[QBO Webhook] Payment não encontrado:", id);
            continue;
          }

          // Processar o pagamento
          await this.handlePaymentEvent(companyId, account.user_id, qbPayment, op, qb);

        } catch (e: any) {
          console.error("[QBO Webhook] erro ao processar Payment:", id, e?.message || e);
          await createSyncLog({
            entity: "payments",
            action: "WebhookError",
            entityId: id,
            companyId,
            details: jsonSafe({ message: e?.message || String(e), op }),
          });
        }
      }
    }
  }

  private static async getQBForAccount(account: any) {
    // refresh se preciso
    let acc = account;
    if (acc.expiresAt && new Date() > acc.expiresAt) {
      const r = await refreshAccessToken(acc.refreshToken, acc.user_id);
      if (!r.success) throw new Error("Falha ao renovar token: " + r.error);
      // re-carrega
      acc = await prisma.quickBooksAccount.findUnique({ where: { id: acc.id } });
      if (!acc) throw new Error("Conta QuickBooks não encontrada após refresh");
    }

    const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
    const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;

    return new QuickBooks(
      QB_CLIENT_ID!,
      QB_CLIENT_SECRET!,
      acc.accessToken,
      false,
      acc.realmId,
      process.env.QUICKBOOKS_ENVIRONMENT !== 'production',   // Use sandbox apenas se não for produção
      true,   // new api
      null,
      "2.0",
      acc.refreshToken
    );
  }

  private static async upsertCustomerFromQBO(companyId: string, qbCustomer: any) {
    const qbId: string | undefined = qbCustomer.Id;
    const emailFromQb = sanitizeEmail(qbCustomer.PrimaryEmailAddr?.Address || undefined) || undefined;
    const qbUpdatedAt = qbCustomer.MetaData?.LastUpdatedTime ? new Date(qbCustomer.MetaData.LastUpdatedTime) : null;

    if (!qbId) return;

    // 1) Tente por idQuickbooks
    const byId = await prisma.client.findFirst({
      where: { company_id: companyId, idQuickbooks: qbId },
    });

    const mapFromQb = (local?: any) => ({
      name: qbCustomer.DisplayName,
      email: emailFromQb ?? local?.email ?? null,
      document: qbCustomer.TaxIdentifier || null,
      phone: qbCustomer.PrimaryPhone?.FreeFormNumber || null,
      city_and_state: qbCustomer.BillAddr
        ? `${qbCustomer.BillAddr.City || ""}, ${qbCustomer.BillAddr.CountrySubDivisionCode || ""}`.trim()
        : null,
      birth_date: qbCustomer.BirthDate || null,
      location: qbCustomer.BillAddr?.Line1 || null,
      idQuickbooks: qbId,
      quickbooksUpdatedAt: qbUpdatedAt ?? new Date(),
      sync_version: local ? (local.sync_version || 0) + 1 : 0,
      company_id: companyId,
      avatar: local?.avatar || null,
      lat: local?.lat || null,
      log: local?.log || null,
      radius: local?.radius || null,
      autorId: local?.autorId || null,
      stripeCustomerId: local?.stripeCustomerId || null,
    });

    if (byId) {
      // só atualiza se o remoto for mais novo que nosso espelho
      const lastSeenRemote = byId.quickbooksUpdatedAt ?? new Date(0);
      if (qbUpdatedAt && qbUpdatedAt > lastSeenRemote) {
        const data = mapFromQb(byId);
        await prisma.client.update({ where: { id: byId.id }, data });
        await createSyncLog({
          entity: "customers",
          action: "UpdatedFromWebhook",
          entityId: byId.id,
          companyId,
          details: jsonSafe({ reason: "QBO newer via webhook", qbId, qbUpdatedAt }),
        });
      }
      return;
    }

    // 2) Não temos idQuickbooks local — tente achar por e-mail
    if (!emailFromQb) {
      await createSyncLog({
        entity: "customers",
        action: "WebhookSkipped",
        entityId: qbId,
        companyId,
        details: jsonSafe({ reason: "Missing email from QBO" }),
      });
      return;
    }

    const existingByEmail = await prisma.client.findFirst({
      where: { company_id: companyId, email: emailFromQb },
    });

    if (existingByEmail) {
      // linka o idQuickbooks e atualiza campos vindos do QBO
      const data = mapFromQb(existingByEmail);
      await prisma.client.update({ where: { id: existingByEmail.id }, data });
      await createSyncLog({
        entity: "customers",
        action: "LinkedAndUpdatedFromWebhook",
        entityId: existingByEmail.id,
        companyId,
        details: jsonSafe({ reason: "Matched by email", qbId, email: emailFromQb }),
      });
      return;
    }

    // 3) Criar novo local
    const created = await prisma.client.create({ data: mapFromQb() });
    await createSyncLog({
      entity: "customers",
      action: "InsertedFromWebhook",
      entityId: created.id,
      companyId,
      details: jsonSafe({ qbId, email: emailFromQb }),
    });
  }

  private static async handleDeleteCustomer(companyId: string, qbId: string) {
    // QBO não hard-deleta; a operação vem como Delete. Você pode marcar localmente (ex.: flag “inactive”).
    // Aqui, só logamos.
    await createSyncLog({
      entity: "customers",
      action: "WebhookDelete",
      entityId: qbId,
      companyId,
      details: jsonSafe({ qbId }), // <- antes estava objeto puro
    });
  }

  // Função helper para verificar se a sincronização está habilitada para uma empresa
  private static async isSyncEnabledForCompany(companyId: string, userId: string): Promise<boolean> {
    try {
      const syncPreference = await prisma.syncPreferences.findFirst({
        where: {
          companyId,
          userId,
          typesEntity: 'customers',
          isDisable: false
        }
      });
      
      return !!syncPreference;
    } catch (error) {
      console.error("[isSyncEnabledForCompany] Erro ao verificar preferências:", error);
      return false;
    }
  }

  /**
   * Processar evento de Invoice (criação, atualização, deleção)
   */
  private static async handleInvoiceEvent(
    companyId: string,
    userId: string,
    qbInvoice: any,
    operation: string,
    qb: any
  ) {
    try {
      console.log(`[QBO Webhook] Processando invoice ${qbInvoice.Id} - Operation: ${operation}`);

      // Buscar invoice local pelo ID do QuickBooks
      const localInvoice = await prisma.invoice.findFirst({
        where: {
          companyId,
          idQuickbookContabio: qbInvoice.Id
        },
        include: {
          project: {
            include: {
              client: true,
              workContext: true
            }
          },
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatar: true
            }
          }
        }
      });

      if (!localInvoice) {
        console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} não encontrado localmente, ignorando evento`);
        await createSyncLog({
          entity: "invoices",
          action: "WebhookSkipped",
          entityId: qbInvoice.Id,
          companyId,
          details: jsonSafe({ reason: "Invoice not found locally", qbId: qbInvoice.Id }),
        });
        return;
      }

      // Determinar status do invoice baseado no QuickBooks
      const deriveStatus = (inv: any): string => {
        if (inv.TxnStatus === "Voided") return "void";
        const total = Number(inv.TotalAmt || 0);
        const balance = Number(inv.Balance || 0);
        if (total > 0 && balance === 0) return "paid";
        if (balance > 0 && balance < total) return "partial";
        return "open";
      };

      const newStatus = deriveStatus(qbInvoice);
      const oldStatus = localInvoice.status;

      console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} - Status: ${oldStatus} → ${newStatus}`);

      // Atualizar invoice local
      await prisma.invoice.update({
        where: { id: localInvoice.id },
        data: {
          status: newStatus,
          totalAmount: Number(qbInvoice.TotalAmt || localInvoice.totalAmount),
          docNumberQuickBooksContabio: qbInvoice.DocNumber || localInvoice.docNumberQuickBooksContabio,
          updatedAt: new Date()
        }
      });

      // Registrar na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `QuickBooks webhook: Invoice ${operation} - Status changed from ${oldStatus} to ${newStatus}`,
          invoiceId: localInvoice.id
        }
      });

      // Log de sincronização
      await createSyncLog({
        entity: "invoices",
        action: "UpdatedFromWebhook",
        entityId: localInvoice.id,
        companyId,
        details: jsonSafe({
          qbId: qbInvoice.Id,
          operation,
          oldStatus,
          newStatus,
          totalAmount: qbInvoice.TotalAmt
        }),
      });

      // Se o invoice foi pago ou recebeu pagamento parcial, enviar emails de confirmação
      if (newStatus === "paid" && oldStatus !== "paid") {
        console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} foi pago completamente, enviando emails...`);
        
        // Enviar emails de confirmação (similar ao Stripe)
        await this.sendQuickBooksPaymentConfirmationEmails(localInvoice, qbInvoice);
      } else if (newStatus === "partial" && oldStatus !== "partial") {
        console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} recebeu pagamento parcial, enviando emails...`);
        
        // Enviar emails de pagamento parcial
        await this.sendQuickBooksPartialPaymentEmails(localInvoice, qbInvoice);
      }

    } catch (error: any) {
      console.error("[QBO Webhook] Erro ao processar evento de Invoice:", error.message);
      throw error;
    }
  }

  /**
   * Processar evento de Payment (pagamento aplicado a um invoice)
   */
  private static async handlePaymentEvent(
    companyId: string,
    userId: string,
    qbPayment: any,
    operation: string,
    qb: any
  ) {
    try {
      console.log(`[QBO Webhook] Processando payment ${qbPayment.Id} - Operation: ${operation}`);

      // Payment pode estar vinculado a um ou mais invoices via Line items
      const lines = qbPayment.Line || [];
      
      for (const line of lines) {
        if (line.LinkedTxn && Array.isArray(line.LinkedTxn)) {
          for (const linkedTxn of line.LinkedTxn) {
            if (linkedTxn.TxnType === "Invoice" && linkedTxn.TxnId) {
              const invoiceId = linkedTxn.TxnId;
              
              console.log(`[QBO Webhook] Payment vinculado ao Invoice ${invoiceId}`);

              // Buscar o invoice atualizado no QuickBooks
              try {
                const invoiceData: any = await limiter.schedule(
                  () =>
                    new Promise((resolve, reject) => {
                      qb.getInvoice(invoiceId, (err: any, data: any) => (err ? reject(err) : resolve(data)));
                    })
                );

                const qbInvoice = invoiceData?.Invoice || invoiceData;

                if (qbInvoice && qbInvoice.Id) {
                  // Processar o invoice como se fosse um evento de atualização
                  await this.handleInvoiceEvent(companyId, userId, qbInvoice, "payment_applied", qb);
                }

              } catch (invoiceError: any) {
                console.error(`[QBO Webhook] Erro ao buscar invoice ${invoiceId}:`, invoiceError.message);
              }
            }
          }
        }
      }

      // Log de sincronização do payment
      await createSyncLog({
        entity: "payments",
        action: "ProcessedFromWebhook",
        entityId: qbPayment.Id,
        companyId,
        details: jsonSafe({
          qbPaymentId: qbPayment.Id,
          operation,
          totalAmount: qbPayment.TotalAmt,
          linkedInvoices: lines.length
        }),
      });

    } catch (error: any) {
      console.error("[QBO Webhook] Erro ao processar evento de Payment:", error.message);
      throw error;
    }
  }

  /**
   * Enviar emails de pagamento parcial QuickBooks (cliente + empresa)
   */
  private static async sendQuickBooksPartialPaymentEmails(invoice: any, qbInvoice: any) {
    try {
      console.log("[QBO Webhook] Iniciando envio de emails de pagamento parcial QuickBooks");

      // Importações (mesmo padrão do Stripe)
      const nodemailer = require("nodemailer");
      const SMTP_CONFIG = require("../../../config/smtp");
      const { getPresignedUrl } = require("../../../utils/S3/getPresignedUrl");
      const { quickBooksPaymentPartial } = require("../../../templateEmail/quickBooksPaymentPartial");

      // Debug SMTP config
      console.log("[QBO Webhook] SMTP Config (Partial):", {
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        user: SMTP_CONFIG.user,
        hasPass: !!SMTP_CONFIG.pass
      });

      // Configurar SMTP (mesmo padrão do Stripe)
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
        tls: { rejectUnauthorized: false },
      });

      if (!invoice.company?.name) {
        console.error("[QBO Webhook] Nome da empresa não encontrado, cancelando envio de emails");
        return;
      }

      const totalAmount = Number(qbInvoice.TotalAmt || invoice.totalAmount);
      const remainingBalance = Number(qbInvoice.Balance || 0);
      const partialAmount = totalAmount - remainingBalance;

      const formattedTotal = `$${totalAmount.toFixed(2)}`;
      const formattedPartial = `$${partialAmount.toFixed(2)}`;
      const formattedBalance = `$${remainingBalance.toFixed(2)}`;
      const invoiceCode = invoice.externalInvoiceId || invoice.id;

      const recipients = [];

      // Obter email do destinatário
      const workContext = invoice.project?.workContext;
      const client = invoice.project?.client;
      
      const clientEmail = workContext?.Email || client?.email;
      const clientName = workContext?.Name || client?.name;

      // Email do cliente
      if (clientEmail && clientName) {
        const companyLogo = invoice.company?.avatar
          ? await getPresignedUrl(invoice.company.avatar)
          : '';

        const clientTemplate = quickBooksPaymentPartial(
          clientName,
          companyLogo,
          invoiceCode,
          formattedPartial,
          formattedTotal,
          formattedBalance,
          invoice.company.name,
          invoice.company?.phone || undefined,
          invoice.company?.email || undefined
        );

        recipients.push({
          email: clientEmail,
          name: clientName,
          template: clientTemplate,
          type: 'client'
        });
      }

      // Email da empresa (notificação simples)
      if (invoice.company?.email) {
        const companyTemplate = `
          <h2>Partial Payment Received</h2>
          <p>A partial payment has been received for Invoice #${invoiceCode}</p>
          <p><strong>Client:</strong> ${clientName || 'Client'}</p>
          <p><strong>Amount Received:</strong> ${formattedPartial}</p>
          <p><strong>Remaining Balance:</strong> ${formattedBalance}</p>
          <p><strong>Total Invoice:</strong> ${formattedTotal}</p>
        `;

        recipients.push({
          email: invoice.company.email,
          name: invoice.company.name,
          template: companyTemplate,
          type: 'company'
        });
      }

      console.log(`[QBO Webhook] Enviando para ${recipients.length} destinatários (pagamento parcial)`);

      // Enviar emails
      for (const recipient of recipients) {
        try {
          const mailOptions = {
            from: SMTP_CONFIG.user,
            to: recipient.email,
            subject: recipient.type === 'company'
              ? `Partial Payment Received (QuickBooks) - Invoice #${invoiceCode}`
              : `Partial Payment Received - Invoice #${invoiceCode}`,
            html: recipient.template,
          };

          await transporter.sendMail(mailOptions);
          console.log(`[QBO Webhook] Email de pagamento parcial (${recipient.type}) enviado para ${recipient.email}`);

          await prisma.invoiceEmailLog.create({
            data: {
              invoiceId: invoice.id,
              recipient: recipient.email,
              status: 'success'
            }
          });

        } catch (emailError: any) {
          console.error(`[QBO Webhook] Erro ao enviar email para ${recipient.email}:`, emailError.message);

          await prisma.invoiceEmailLog.create({
            data: {
              invoiceId: invoice.id,
              recipient: recipient.email,
              status: 'error',
              errorMessage: emailError.message
            }
          });
        }
      }

    } catch (error: any) {
      console.error("[QBO Webhook] Erro geral ao enviar emails de pagamento parcial:", error.message);
    }
  }

  /**
   * Enviar emails de confirmação de pagamento QuickBooks (cliente + empresa)
   */
  private static async sendQuickBooksPaymentConfirmationEmails(invoice: any, qbInvoice: any) {
    try {
      console.log("[QBO Webhook] Iniciando envio de emails de confirmação de pagamento QuickBooks");

      // Importações (mesmo padrão do Stripe)
      const nodemailer = require("nodemailer");
      const SMTP_CONFIG = require("../../../config/smtp");
      const { getPresignedUrl } = require("../../../utils/S3/getPresignedUrl");
      const { quickBooksPaymentConfirmation } = require("../../../templateEmail/quickBooksPaymentConfirmation");
      const { quickBooksPaymentNotificationCompany } = require("../../../templateEmail/quickBooksPaymentNotificationCompany");

      // Debug SMTP config
      console.log("[QBO Webhook] SMTP Config:", {
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        user: SMTP_CONFIG.user,
        hasPass: !!SMTP_CONFIG.pass
      });

      // Configurar SMTP (mesmo padrão do Stripe)
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
        tls: { rejectUnauthorized: false },
      });

      // Verificar dados obrigatórios
      if (!invoice.company?.name) {
        console.error("[QBO Webhook] Nome da empresa não encontrado, cancelando envio de emails");
        return;
      }

      // Formatar valor
      const formattedAmount = `$${Number(qbInvoice.TotalAmt || invoice.totalAmount).toFixed(2)}`;
      const invoiceCode = invoice.externalInvoiceId || invoice.id;

      const recipients = [];

      // Obter email do destinatário: prioridade work context, fallback client
      const workContext = invoice.project?.workContext;
      const client = invoice.project?.client;
      
      const clientEmail = workContext?.Email || client?.email;
      const clientName = workContext?.Name || client?.name;

      // Email do cliente
      if (clientEmail && clientName) {
        const companyLogo = invoice.company?.avatar
          ? await getPresignedUrl(invoice.company.avatar)
          : '';

        const clientTemplate = quickBooksPaymentConfirmation(
          clientName,
          companyLogo,
          invoiceCode,
          formattedAmount,
          invoice.company.name,
          invoice.company?.phone || undefined,
          invoice.company?.email || undefined
        );

        recipients.push({
          email: clientEmail,
          name: clientName,
          template: clientTemplate,
          type: 'client'
        });
      }

      // Email da empresa
      if (invoice.company?.email) {
        const companyTemplate = quickBooksPaymentNotificationCompany(
          invoice.company.name,
          invoiceCode,
          formattedAmount,
          clientName || 'Client',
          invoice.project?.contract_number || undefined
        );

        recipients.push({
          email: invoice.company.email,
          name: invoice.company.name,
          template: companyTemplate,
          type: 'company'
        });
      }

      console.log(`[QBO Webhook] Enviando para ${recipients.length} destinatários:`, recipients.map(r => `${r.email} (${r.type})`));

      // Enviar emails
      for (const recipient of recipients) {
        try {
          const mailOptions = {
            from: SMTP_CONFIG.user,
            to: recipient.email,
            subject: recipient.type === 'company'
              ? `Payment Received (QuickBooks) - Invoice #${invoiceCode}`
              : `Payment Confirmation (QuickBooks) - Invoice #${invoiceCode}`,
            html: recipient.template,
          };

          await transporter.sendMail(mailOptions);
          console.log(`[QBO Webhook] Email de ${recipient.type} enviado para ${recipient.email}`);

          // Log do envio
          await prisma.invoiceEmailLog.create({
            data: {
              invoiceId: invoice.id,
              recipient: recipient.email,
              status: 'success'
            }
          });

        } catch (emailError: any) {
          console.error(`[QBO Webhook] Erro ao enviar email para ${recipient.email}:`, emailError.message);

          await prisma.invoiceEmailLog.create({
            data: {
              invoiceId: invoice.id,
              recipient: recipient.email,
              status: 'error',
              errorMessage: emailError.message
            }
          });
        }
      }

    } catch (error: any) {
      console.error("[QBO Webhook] Erro geral ao enviar emails:", error.message);
      // Não fazer throw para não interromper o processamento do webhook
    }
  }
}
