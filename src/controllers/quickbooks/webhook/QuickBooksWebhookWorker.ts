// src/controllers/quickbooks/webhook/QuickBooksWebhookWorker.ts
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { sendEmail } from "../../../utils/sendEmail";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { sanitizeEmail } from "../util/sanatizeEmail";
import { jsonSafe } from "../customer/quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";
import {
  logProjectDeleteEvent,
  PROJECT_SYNC_ENTITY,
  upsertProjectFromQBO,
} from "../project/quickbooksProjectHelpers";

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1100 });

// helper no topo do arquivo (ou antes do uso)
export function extractCustomer(data: any) {
  // 1) Resposta clÃ¡ssica do node-quickbooks para getCustomer
  if (data?.Customer) return data.Customer;
  // 2) Resposta de consulta (query)
  if (data?.QueryResponse?.Customer?.[0]) return data.QueryResponse.Customer[0];
  // 3) Alguns ambientes jÃ¡ retornam o prÃ³prio Customer "achatado"
  if (data && typeof data === "object" && data.Id && data.DisplayName) return data;
  return null;
}

/**
 * ETAPA 4: FunÃ§Ã£o de derivaÃ§Ã£o de status QBO
 * QuickBooks Ã© a fonte de verdade - sempre usar os dados vindos do QBO
 */
export function deriveQboInvoiceStatus(qbInvoice: any): "void" | "paid" | "partial" | "open" {
  // 1. Verificar se estÃ¡ cancelado
  if (qbInvoice.TxnStatus === "Voided") {
    return "void";
  }

  const totalAmt = Number(qbInvoice.TotalAmt ?? 0);
  const balance = Number(qbInvoice.Balance ?? 0);

  // 2. Pago completamente
  if (totalAmt > 0 && balance === 0) {
    return "paid";
  }

  // 3. Pagamento parcial
  if (balance > 0 && balance < totalAmt) {
    return "partial";
  }

  // 4. Aberto (nenhum pagamento)
  return "open";
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

      // Verificar se a conta estÃ¡ desabilitada
      if (account.isDisabled) {
        console.log(`[QBO Webhook] Conta QuickBooks desabilitada para realmId=${realmId}, ignorando webhook`);
        continue;
      }

      // Garanta token vÃ¡lido
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

      const customerEvents = entities.filter((e: any) => e.name?.toLowerCase() === "customer");

      if (customerEvents.length > 0) {
        const customerSyncEnabled = await this.isSyncEnabledForEntity(
          companyId,
          account.user_id,
          "customers"
        );
        const projectSyncEnabled = await this.isSyncEnabledForEntity(
          companyId,
          account.user_id,
          PROJECT_SYNC_ENTITY
        );

        if (!customerSyncEnabled && !projectSyncEnabled) {
          console.log(
            `[QBO Webhook] Sincronização de customers/projects desabilitada para company=${companyId} user=${account.user_id}`
          );
        } else {
          for (const evt of customerEvents) {
            const id = evt.id;
            const op = (evt.operation || "").toLowerCase();

            try {
              if (op === "delete") {
                const localProject = projectSyncEnabled
                  ? await prisma.project.findFirst({
                      where: {
                        company_id: companyId,
                        quickbooksCustomerId: id,
                      },
                      select: { id: true },
                    })
                  : null;

                if (localProject) {
                  await logProjectDeleteEvent({
                    companyId,
                    qboProjectCustomerId: id,
                    projectId: localProject.id,
                    source: "webhook",
                  });
                } else if (customerSyncEnabled) {
                  await this.handleDeleteCustomer(companyId, id);
                }
                continue;
              }

              const current: any = await limiter.schedule(
                () =>
                  new Promise((resolve, reject) => {
                    qb.getCustomer(id, (err: any, data: any) => (err ? reject(err) : resolve(data)));
                  })
              );

              const qbCustomer = extractCustomer(current);

              if (!qbCustomer) {
                console.warn(
                  "[QBO Webhook] Customer não encontrado ao buscar detalhes:",
                  id,
                  "shape:",
                  JSON.stringify(Object.keys(current || {}))
                );
                continue;
              }

              const isProjectJob = qbCustomer.Job === true || !!qbCustomer.ParentRef;

              if (isProjectJob) {
                if (!projectSyncEnabled) {
                  continue;
                }

                await upsertProjectFromQBO({
                  companyId,
                  qbCustomer,
                  source: "webhook",
                });
                continue;
              }

              if (!customerSyncEnabled) {
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

      // Processar Invoice events (SEM validação de sincronização) isso apenas quando quiser a sincronização cruzada entre qbo e banco local 
      // const invoiceEvents = entities.filter((e: any) => e.name?.toLowerCase() === "invoice");
      // for (const evt of invoiceEvents) {
      //   const id = evt.id;
      //   const op = (evt.operation || "").toLowerCase();

      //   try {
      //     console.log(`[QBO Webhook] Processando Invoice event: ${op} - ID: ${id}`);

      //     // Buscar o Invoice completo do QuickBooks
      //     const invoiceData: any = await limiter.schedule(
      //       () =>
      //         new Promise((resolve, reject) => {
      //           qb.getInvoice(id, (err: any, data: any) => (err ? reject(err) : resolve(data)));
      //         })
      //     );

      //     const qbInvoice = invoiceData?.Invoice || invoiceData;

      //     if (!qbInvoice || !qbInvoice.Id) {
      //       console.warn("[QBO Webhook] Invoice não encontrado:", id);
      //       continue;
      //     }

      //     // Processar o invoice
      //     await this.handleInvoiceEvent(companyId, account.user_id, qbInvoice, op, qb);

      //   } catch (e: any) {
      //     console.error("[QBO Webhook] erro ao processar Invoice:", id, e?.message || e);
      //     await createSyncLog({
      //       entity: "invoices",
      //       action: "WebhookError",
      //       entityId: id,
      //       companyId,
      //       details: jsonSafe({ message: e?.message || String(e), op }),
      //     });
      //   }
      // }

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
      const r = await refreshAccessToken(acc.refreshToken, acc.id);
      if (!r.success) throw new Error("Falha ao renovar token: " + r.error);
      // re-carrega
      acc = await prisma.quickBooksAccount.findUnique({ where: { id: acc.id } });
      if (!acc) throw new Error("Conta QuickBooks nÃ£o encontrada apÃ³s refresh");
    }

    const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
    const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;

    return new QuickBooks(
      QB_CLIENT_ID!,
      QB_CLIENT_SECRET!,
      acc.accessToken,
      false,
      acc.realmId,
      process.env.QUICKBOOKS_ENVIRONMENT !== 'production',   // Use sandbox apenas se nÃ£o for produÃ§Ã£o
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
      // sÃ³ atualiza se o remoto for mais novo que nosso espelho
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

    // 2) NÃ£o temos idQuickbooks local â€” tente achar por e-mail
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
    // QBO nÃ£o hard-deleta; a operaÃ§Ã£o vem como Delete. VocÃª pode marcar localmente (ex.: flag â€œinactiveâ€).
    // Aqui, sÃ³ logamos.
    await createSyncLog({
      entity: "customers",
      action: "WebhookDelete",
      entityId: qbId,
      companyId,
      details: jsonSafe({ qbId }), // <- antes estava objeto puro
    });
  }

  // Função helper para verificar se a sincronização está habilitada para uma entidade
  private static async isSyncEnabledForEntity(
    companyId: string,
    userId: string,
    entity: string
  ): Promise<boolean> {
    try {
      const syncPreference = await prisma.syncPreferences.findFirst({
        where: {
          companyId,
          userId,
          typesEntity: entity as any,
          isDisable: false
        }
      });
      
      return !!syncPreference;
    } catch (error) {
      console.error("[isSyncEnabledForEntity] Erro ao verificar preferências:", error);
      return false;
    }
  }

  /**
   * Processar evento de Invoice (criaÃ§Ã£o, atualizaÃ§Ã£o, deleÃ§Ã£o)
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
        console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} nÃ£o encontrado localmente, ignorando evento`);
        await createSyncLog({
          entity: "invoices",
          action: "WebhookSkipped",
          entityId: qbInvoice.Id,
          companyId,
          details: jsonSafe({ reason: "Invoice not found locally", qbId: qbInvoice.Id }),
        });
        return;
      }

      // Calcular valores do QBO
      const totalAmt = Number(qbInvoice.TotalAmt || 0);
      const balance = Number(qbInvoice.Balance || 0);
      const totalPaid = totalAmt - balance;
      const oldStatus = localInvoice.status;

      //  Verificar se Ã© um cancelamento ANTES de derivar o status
      // O QuickBooks pode nÃ£o retornar TxnStatus="Voided" em algumas respostas, mas o operation serÃ¡ "void"
      const isVoidOperation = operation === "void" || 
                             qbInvoice.TxnStatus === "Voided" || 
                             (qbInvoice.PrivateNote && qbInvoice.PrivateNote.includes("Voided"));

      //  Usar funÃ§Ã£o de derivaÃ§Ã£o de status 
      // Mas se for operaÃ§Ã£o de void, forÃ§ar o status para "void"
      let newStatus: "void" | "paid" | "partial" | "open";
      if (isVoidOperation) {
        newStatus = "void";
        console.log(`[QBO Webhook]  Invoice ${qbInvoice.Id} detectado como VOID (operation: ${operation})`);
      } else {
        newStatus = deriveQboInvoiceStatus(qbInvoice);
      }

      console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} - Status: ${oldStatus} â†’ ${newStatus}, Total: ${totalAmt}, Balance: ${balance}, Paid: ${totalPaid}`);

      //  Se o invoice estÃ¡ void, SEMPRE preservar o valor original no banco local
      const localAmount = Number(localInvoice.totalAmount);
      const shouldPreserveAmount = newStatus === "void" && localAmount > 0 && totalAmt === 0;

      // Determinar qual valor usar para totalAmount
      let finalTotalAmount = totalAmt;
      if (shouldPreserveAmount) {
        // Manter o valor original quando estÃ¡ cancelado
        finalTotalAmount = localAmount;
        console.log(`[QBO Webhook]  Invoice ${qbInvoice.Id} estÃ¡ void - preservando valor original: $${finalTotalAmount} (QBO retornou: $${totalAmt})`);
      } else if (newStatus === "void" && localAmount > 0) {
        // Se jÃ¡ estava void e temos valor local, manter o valor local
        finalTotalAmount = localAmount;
        console.log(`[QBO Webhook]  Invoice ${qbInvoice.Id} mantendo valor void existente: $${finalTotalAmount}`);
      }

      // ETAPA 7: Detectar alteraÃ§Ã£o de valor apÃ³s pagamento
      let amountChanged = localInvoice.amountChangedAfterPayment;
      let timelineMessage = `QuickBooks webhook: Invoice ${operation} - Status changed from ${oldStatus} to ${newStatus}`;

      if ((oldStatus === "paid" || oldStatus === "partial") && totalAmt !== Number(localInvoice.totalAmount)) {
        amountChanged = true;
        timelineMessage = `QuickBooks updated invoice amount after payment (${localInvoice.totalAmount} â†’ ${totalAmt})`;
        console.log(`[QBO Webhook]  Invoice ${qbInvoice.Id} amount changed after payment!`);
      }

      // Se foi cancelado, adicionar mensagem especÃ­fica na timeline
      if (isVoidOperation && oldStatus !== "void") {
        timelineMessage = `Invoice voided in QuickBooks (original amount preserved: $${finalTotalAmount})`;
      }

      // Atualizar invoice local com todos os novos campos
      await prisma.invoice.update({
        where: { id: localInvoice.id },
        data: {
          status: newStatus,
          checked: true,
          totalAmount: finalTotalAmount, // Usar valor preservado se foi cancelado
          balanceRemaining: isVoidOperation ? 0 : balance, // Se void, balance deve ser 0
          totalAmountPaidQbo: isVoidOperation ? 0 : totalPaid, // Se void, nÃ£o hÃ¡ pagamento
          amountChangedAfterPayment: amountChanged,
          docNumberQuickBooksContabio: qbInvoice.DocNumber || localInvoice.docNumberQuickBooksContabio,
          updatedAt: new Date()
        }
      });

      // Registrar na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: timelineMessage,
          invoiceId: localInvoice.id
        }
      });

      // Log de sincronizaÃ§Ã£o
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

      // Se operation = "payment_applied", sempre enviar emails (cada pagamento deve gerar notificaÃ§Ã£o)
      if (operation === "payment_applied") {
        // Recarregar invoice com relacionamentos completos para envio de email
        const invoiceWithRelations = await prisma.invoice.findUnique({
          where: { id: localInvoice.id },
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

        if (!invoiceWithRelations) {
          console.warn(`[QBO Webhook] NÃ£o foi possÃ­vel recarregar invoice ${localInvoice.id} para envio de email`);
          return;
        }

        if (newStatus === "paid") {
          console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} foi pago completamente, enviando emails com PDF...`);
          
          // Enviar emails de confirmaÃ§Ã£o COM PDF (similar ao Stripe)
          await this.sendQuickBooksFullPaymentEmailWithPdf(invoiceWithRelations, qbInvoice);
        } else if (newStatus === "partial") {
          console.log(`[QBO Webhook] Invoice ${qbInvoice.Id} recebeu pagamento parcial, enviando emails...`);
          
          // Enviar emails de pagamento parcial (SEMPRE que houver pagamento parcial)
          await this.sendQuickBooksPartialPaymentEmails(invoiceWithRelations, qbInvoice);
        }
      }

    } catch (error: any) {
      console.error("[QBO Webhook] Erro ao processar evento de Invoice:", error.message);
      throw error;
    }
  }

  /**
   * ETAPA 5: Processar evento de Payment (pagamento aplicado a um invoice)
   * Persiste pagamentos de forma idempotente usando PaymentTransaction e PaymentApplication
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

      // ETAPA 5.1: Verificar se jÃ¡ existe PaymentTransaction (idempotÃªncia)
      const existingPayment = await prisma.paymentTransaction.findFirst({
        where: {
          provider: "qbo",
          externalPaymentId: qbPayment.Id,
          companyId: companyId 
        },
        include: {
          applications: true
        }
      });

      if (existingPayment) {
        console.log(`[QBO Webhook] Payment ${qbPayment.Id} jÃ¡ processado anteriormente para company ${companyId}, pulando`);
        return;
      }

      // ETAPA 5.2: Criar PaymentTransaction
      const paymentTransaction = await prisma.paymentTransaction.create({
        data: {
          provider: "qbo",
          externalPaymentId: qbPayment.Id,
          currency: qbPayment.CurrencyRef?.value || "USD",
          totalAmount: Number(qbPayment.TotalAmt || 0),
          paymentMethodType: qbPayment.PaymentMethodRef?.name || qbPayment.PaymentType || null,
          txnDate: qbPayment.TxnDate ? new Date(qbPayment.TxnDate) : null,
          companyId
        }
      });

      console.log(`[QBO Webhook] PaymentTransaction criado: ${paymentTransaction.id}`);

      // ETAPA 5.3: Processar LinkedTxn e criar PaymentApplication
      const lines = qbPayment.Line || [];
      let processedInvoices = 0;

      for (const line of lines) {
        if (line.LinkedTxn && Array.isArray(line.LinkedTxn)) {
          for (const linkedTxn of line.LinkedTxn) {
            if (linkedTxn.TxnType === "Invoice" && linkedTxn.TxnId) {
              const qboInvoiceId = linkedTxn.TxnId;
              const amountApplied = Number(line.Amount || 0);

              console.log(`[QBO Webhook] Payment vinculado ao Invoice ${qboInvoiceId}, valor aplicado: ${amountApplied}`);

              // Buscar invoice local
              const localInvoice = await prisma.invoice.findFirst({
                where: {
                  companyId,
                  idQuickbookContabio: qboInvoiceId
                }
              });

              if (!localInvoice) {
                console.warn(`[QBO Webhook] Invoice ${qboInvoiceId} nÃ£o encontrado localmente`);
                continue;
              }

              // Criar PaymentApplication
              await prisma.paymentApplication.create({
                data: {
                  paymentTransactionId: paymentTransaction.id,
                  invoiceId: localInvoice.id,
                  amountApplied
                }
              });

              // Atualizar lastPaymentAt do invoice
              const updatedInvoice = await prisma.invoice.update({
                where: { id: localInvoice.id },
                data: {
                  lastPaymentAt: paymentTransaction.txnDate || new Date()
                },
                include: {
                  project: true
                }
              });

              // Criar entrada no InvoicePaymentTimeLine para o histÃ³rico de pagamentos
              if (updatedInvoice.type_invoicebase === "project" && updatedInvoice.projectId) {
                const paymentDateUTC = paymentTransaction.txnDate || new Date();
                const paymentDate = paymentDateUTC.toLocaleDateString('en-US', {
                  timeZone: 'America/New_York'
                });

                // Verificar se Ã© pagamento parcial ou total
                const invoiceTotalAmount = Number(updatedInvoice.totalAmount || 0);
                const isPartialPayment = amountApplied < invoiceTotalAmount;

                let description: string;
                if (isPartialPayment) {
                  // Pagamento parcial
                  description = `Partial payment of ${new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(amountApplied)} applied to invoice #${updatedInvoice.externalInvoiceId} on ${paymentDate}`;
                } else {
                  // Pagamento total
                  description = `Payment invoice #${updatedInvoice.externalInvoiceId} of ${new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(amountApplied)} on ${paymentDate}`;
                }

                await prisma.invoicePaymentTimeLine.create({
                  data: {
                    description,
                    projectId: updatedInvoice.projectId
                  }
                });

                console.log(`[QBO Webhook] InvoicePaymentTimeLine criado para invoice ${localInvoice.id} - ${isPartialPayment ? 'Parcial' : 'Total'}`);
              }

              processedInvoices++;

              // Buscar invoice atualizado no QBO e processar
              try {
                const invoiceData: any = await limiter.schedule(
                  () =>
                    new Promise((resolve, reject) => {
                      qb.getInvoice(qboInvoiceId, (err: any, data: any) => (err ? reject(err) : resolve(data)));
                    })
                );

                const qbInvoice = invoiceData?.Invoice || invoiceData;

                if (qbInvoice && qbInvoice.Id) {
                  // Processar o invoice como se fosse um evento de atualizaÃ§Ã£o
                  await this.handleInvoiceEvent(companyId, userId, qbInvoice, "payment_applied", qb);
                }

              } catch (invoiceError: any) {
                console.error(`[QBO Webhook] Erro ao buscar invoice ${qboInvoiceId}:`, invoiceError.message);
              }
            }
          }
        }
      }

      // Log de sincronizaÃ§Ã£o do payment
      await createSyncLog({
        entity: "payments",
        action: "ProcessedFromWebhook",
        entityId: qbPayment.Id,
        companyId,
        details: jsonSafe({
          qbPaymentId: qbPayment.Id,
          operation,
          totalAmount: qbPayment.TotalAmt,
          linkedInvoices: processedInvoices,
          paymentTransactionId: paymentTransaction.id
        }),
      });

      console.log(`[QBO Webhook] Payment ${qbPayment.Id} processado com sucesso. Invoices afetados: ${processedInvoices}`);

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

      if (!invoice.company?.name) {
        console.error("[QBO Webhook] Nome da empresa nÃ£o encontrado, cancelando envio de emails");
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

      // Obter email do destinatÃ¡rio
      const workContext = invoice.project?.workContext;
      const client = invoice.project?.client;
      
      const clientEmail = workContext?.Email || client?.email;
      const clientName = workContext?.Name || client?.name;

      // Email do cliente
      if (clientEmail && clientName) {
        const companyLogo = invoice.company?.avatar
          ? await getPresignedUrl(invoice.company.avatar)
          : '';

        const { quickBooksPaymentPartial } = require("../../../templateEmail/quickBooksPaymentPartial");
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

      // Email da empresa (usando template melhorado com histÃ³rico)
      if (invoice.company?.email) {
        const { quickBooksPaymentNotificationCompany } = require("../../../templateEmail/quickBooksPaymentNotificationCompany");
        
        // Buscar histÃ³rico de pagamentos do QBO
        const paymentHistory = await prisma.paymentTransaction.findMany({
          where: {
            applications: {
              some: {
                invoiceId: invoice.id
              }
            }
          },
          include: {
            applications: {
              where: {
                invoiceId: invoice.id
              }
            }
          },
          orderBy: {
            txnDate: 'asc'
          }
        });

        // Formatar histÃ³rico para o template
        const formattedHistory = paymentHistory.map(payment => ({
          date: payment.txnDate 
            ? new Date(payment.txnDate).toLocaleDateString('en-US', { 
                timeZone: 'America/New_York',
                year: 'numeric', 
                month: 'short', 
                day: 'numeric'
              })
            : new Date(payment.createdAt).toLocaleDateString('en-US', { 
                timeZone: 'America/New_York',
                year: 'numeric', 
                month: 'short', 
                day: 'numeric'
              }),
          amount: `$${Number(payment.totalAmount).toFixed(2)}`,
          method: payment.paymentMethodType || 'QuickBooks'
        }));

        const companyTemplate = quickBooksPaymentNotificationCompany(
          invoice.company.name,
          invoiceCode,
          formattedPartial,
          clientName || 'Client',
          invoice.project?.contract_number || undefined,
          formattedHistory.length > 1 ? formattedHistory : undefined, // SÃ³ mostrar histÃ³rico se houver mÃºltiplos pagamentos
          formattedBalance,
          formattedTotal
        );

        recipients.push({
          email: invoice.company.email,
          name: invoice.company.name,
          template: companyTemplate,
          type: 'company'
        });
      }

      console.log(`[QBO Webhook] Enviando para ${recipients.length} destinatÃ¡rios (pagamento parcial)`);

      // Enviar emails
      for (const recipient of recipients) {
        try {
          await sendEmail({
            to: recipient.email,
            from: recipient.type === 'client' ? invoice.company?.email : undefined,
            subject: recipient.type === 'company'
              ? `Partial Payment Received (QuickBooks) - Invoice #${invoiceCode}`
              : `Partial Payment Received - Invoice #${invoiceCode}`,
            html: recipient.template,
          });
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
   * Enviar emails de confirmaÃ§Ã£o de pagamento QuickBooks (cliente + empresa)
   */
  private static async sendQuickBooksPaymentConfirmationEmails(invoice: any, qbInvoice: any) {
    try {
      console.log("[QBO Webhook] Iniciando envio de emails de confirmaÃ§Ã£o de pagamento QuickBooks");

      // Verificar dados obrigatÃ³rios
      if (!invoice.company?.name) {
        console.error("[QBO Webhook] Nome da empresa nÃ£o encontrado, cancelando envio de emails");
        return;
      }

      // Formatar valor
      const formattedAmount = `$${Number(qbInvoice.TotalAmt || invoice.totalAmount).toFixed(2)}`;
      const invoiceCode = invoice.externalInvoiceId || invoice.id;

      const recipients = [];

      // Obter email do destinatÃ¡rio: prioridade work context, fallback client
      const workContext = invoice.project?.workContext;
      const client = invoice.project?.client;
      
      const clientEmail = workContext?.Email || client?.email;
      const clientName = workContext?.Name || client?.name;

      // Email do cliente
      if (clientEmail && clientName) {
        const companyLogo = invoice.company?.avatar
          ? await getPresignedUrl(invoice.company.avatar)
          : '';

        const { quickBooksPaymentConfirmation } = require("../../../templateEmail/quickBooksPaymentConfirmation");
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
        const { quickBooksPaymentNotificationCompany } = require("../../../templateEmail/quickBooksPaymentNotificationCompany");
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

      console.log(`[QBO Webhook] Enviando para ${recipients.length} destinatÃ¡rios:`, recipients.map(r => `${r.email} (${r.type})`));

      // Enviar emails
      for (const recipient of recipients) {
        try {
          await sendEmail({
            to: recipient.email,
            from: recipient.type === 'client' ? invoice.company?.email : undefined,
            subject: recipient.type === 'company'
              ? `Payment Received (QuickBooks) - Invoice #${invoiceCode}`
              : `Payment Confirmation (QuickBooks) - Invoice #${invoiceCode}`,
            html: recipient.template,
          });
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
      // NÃ£o fazer throw para nÃ£o interromper o processamento do webhook
    }
  }

  private static async sendQuickBooksFullPaymentEmailWithPdf(invoice: any, qbInvoice: any) {
    try {
      console.log("[QBO Webhook] Iniciando envio de email com PDF de pagamento QuickBooks");

      // Obter projeto com workContext
      const project = invoice.project;
      const client = invoice.project?.client;
      const company = invoice.company;
      const workContext = project?.workContext;

      // Usar email do work context se disponÃ­vel, senÃ£o usar email do cliente
      const recipientEmail = workContext?.Email || client?.email;
      const recipientName = workContext?.Name || client?.name || 'Client';

      if (!recipientEmail) {
        console.log("[QBO Webhook] Recipient email not found (neither work context nor client email), skipping email send");
        return;
      }

      // Buscar o PDF de invoice pago (opcional - pode nÃ£o existir)
      const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
        where: {
          invoiceId: invoice.id
        }
      });

      const companyAvatar = company?.avatar
        ? await getPresignedUrl(company.avatar)
        : "";

      // Buscar o PDF do S3 (apenas se existir)
      const attachments = [];
      if (pdfInvoicePaid?.uri) {
        try {
          const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);
          const pdfResponse = await fetch(pdfUrl);
          if (pdfResponse.ok) {
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            const fileName = pdfInvoicePaid.original_file_name || `invoice_paid_qbo_${invoice.externalInvoiceId || invoice.id}.pdf`;
            attachments.push({
              filename: fileName,
              content: pdfBuffer.toString('base64'),
              type: 'application/pdf',
              disposition: 'attachment'
            });
            console.log(`[QBO Webhook] PDF paid anexado ao email: ${fileName}`);
          }
        } catch (error) {
          console.warn("[QBO Webhook] Erro ao buscar PDF invoice paid, enviando email sem anexo:", error);
          // Continua sem o PDF anexado
        }
      } else {
        console.log("[QBO Webhook] PDF invoice paid nÃ£o encontrado, enviando email sem anexo");
      }

      const paymentDate = new Date();
      const totalAmount = Number(qbInvoice.TotalAmt || invoice.totalAmount);
      const formattedAmount = `$${totalAmount.toFixed(2)}`;
      const invoiceCode = invoice.externalInvoiceId || invoice.id;
      const emailSubject = `Invoice #${invoiceCode} - Payment Confirmation (QuickBooks)`;

      const { invoicePaidPaymentEmail } = require("../../../templateEmail/invoicePaidPayment");
      const emailHtml = invoicePaidPaymentEmail(
        recipientName,
        companyAvatar || "",
        company?.name || '',
        invoiceCode,
        totalAmount,
        paymentDate.toISOString(),
        'QuickBooks Payment',
        undefined,
        company?.phone || '',
        company?.email || ''
      );

      await sendEmail({
        to: recipientEmail,
        replyTo: company?.email || undefined, // Resposta vai para o email da empresa
        subject: emailSubject,
        html: emailHtml,
        attachments: attachments.length > 0 ? attachments : undefined,
        text: `
Dear ${recipientName},

We are pleased to confirm that Invoice #${invoiceCode} has been paid successfully via QuickBooks.

Payment Details:
- Invoice Number: #${invoiceCode}
- Payment Amount: ${formattedAmount}
- Payment Date: ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Payment Method: QuickBooks Payment

Thank you for your prompt payment. If you have any questions, please feel free to contact us.

Have a great day!
${company?.name || ''}
        `.trim()
      });

      console.log(`[QBO Webhook] Email com PDF enviado para ${recipientEmail}`);

      // Log do envio de email
      await prisma.invoiceEmailLog.create({
        data: {
          invoiceId: invoice.id,
          recipient: recipientEmail,
          status: 'success'
        }
      });

      // TambÃ©m enviar email para a empresa (notificaÃ§Ã£o de pagamento completo com histÃ³rico)
      if (company?.email) {
        try {
          const { quickBooksPaymentNotificationCompany } = require("../../../templateEmail/quickBooksPaymentNotificationCompany");
          
          // Buscar histÃ³rico de pagamentos do QBO
          const paymentHistory = await prisma.paymentTransaction.findMany({
            where: {
              applications: {
                some: {
                  invoiceId: invoice.id
                }
              }
            },
            include: {
              applications: {
                where: {
                  invoiceId: invoice.id
                }
              }
            },
            orderBy: {
              txnDate: 'asc'
            }
          });

          // Formatar histÃ³rico para o template
          const formattedHistory = paymentHistory.map(payment => ({
            date: payment.txnDate 
              ? new Date(payment.txnDate).toLocaleDateString('en-US', { 
                  timeZone: 'America/New_York',
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric'
                })
              : new Date(payment.createdAt).toLocaleDateString('en-US', { 
                  timeZone: 'America/New_York',
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric'
                }),
            amount: `$${Number(payment.totalAmount).toFixed(2)}`,
            method: payment.paymentMethodType || 'QuickBooks'
          }));
          
          const companyTemplate = quickBooksPaymentNotificationCompany(
            company.name,
            invoiceCode,
            formattedAmount,
            recipientName || 'Client',
            project?.contract_number || undefined,
            formattedHistory.length > 1 ? formattedHistory : undefined // SÃ³ mostrar histÃ³rico se houver mÃºltiplos pagamentos
          );

          await sendEmail({
            to: company.email,
            subject: `Payment Received (QuickBooks) - Invoice #${invoiceCode}`,
            html: companyTemplate,
          });

          console.log(`[QBO Webhook] Email de notificaÃ§Ã£o enviado para empresa ${company.email}`);

          await prisma.invoiceEmailLog.create({
            data: {
              invoiceId: invoice.id,
              recipient: company.email,
              status: 'success'
            }
          });

        } catch (companyEmailError: any) {
          console.error(`[QBO Webhook] Erro ao enviar email para empresa:`, companyEmailError.message);
        }
      }

    } catch (error: any) {
      console.error("[QBO Webhook] Erro ao enviar email com PDF:", error.message);
      // NÃ£o fazer throw para nÃ£o interromper o fluxo principal
    }
  }
}

