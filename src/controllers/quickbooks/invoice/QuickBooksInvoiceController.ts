import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
// @ts-ignore
import QuickBooks from "node-quickbooks";

import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { fireAndForgetUpsertToQBO } from "../customer/FireAndForgetUpsertToQBO";

// Defina a interface para os itens da fatura
interface InvoiceLineItem {
  Amount: number; // ou o tipo correto que você espera
  // Adicione outros campos que você espera que o item tenha
}

export class QuickBooksInvoiceController {

  private async getQBClient(userId: string) {
    // Verificar se o usuário tem uma conta QuickBooks
    console.log("Verificando conta QuickBooks para o usuário:", userId);
    const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
      where: { user_id: userId },
    });

    if (!quickBooksAccount) {
      throw new Error("User not connected to QuickBooks");
    }

    console.log("Verificando validade do token. Expira em:", quickBooksAccount.expiresAt);
    console.log("Data atual:", new Date());

    // Verificar se o token está expirado e atualizar se necessário
    let account = quickBooksAccount;
    if (new Date() > quickBooksAccount.expiresAt) {
      console.log("Token expirado, tentando refresh...");
      const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, quickBooksAccount.id);
      console.log("Resultado do refresh:", refreshResult);
      if (!refreshResult.success) {
        throw new Error(`Failed to refresh QuickBooks token: ${refreshResult.error}`);
      }

      // Buscar a conta atualizada após o refresh
      const updatedAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId },
      });
      if (!updatedAccount) {
        throw new Error("QuickBooks account not found after token refresh");
      }
      account = updatedAccount;
      console.log("Token atualizado com sucesso");
    }

    // Instanciar QuickBooks SDK
    const qb = new QuickBooks(
      process.env.QUICKBOOKS_CLIENT_ID!,
      process.env.QUICKBOOKS_CLIENT_SECRET!,
      account.accessToken,
      false, // Não é tokenSecret (usar OAuth2)
      account.realmId,
      true, // Use sandbox? Troque para false em produção!
      true, // Use the new API
      null,
      "2.0",
      account.refreshToken
    );

    return { qb, account };
  }

  async createInvoice(req: Request, res: Response) {

    const { projectId } = req.params;
    const { description, type_invoicebase, dueDate, userId, coefficientPerfentage, services, type_value } = req.body;

    try {
      // Buscar o projeto
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          client: true,
          company: true,
        },
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (!project.client) {
        return res.status(400).json({ error: "Client not found for this project" });
      }

      if (!project.company) {
        return res.status(400).json({ error: "Company not found for this project" });
      }

      // Obter cliente QuickBooks
      const { qb, account } = await this.getQBClient(userId);

      // Testar conexão com uma operação simples
      try {
        await new Promise((resolve, reject) => {
          qb.getCompanyInfo(account.realmId, (err: any, data: any) => {
            if (err) {
              console.error("Erro ao buscar informações da empresa:", err);
              reject(err);
            } else {
              console.log("Informações da empresa obtidas com sucesso");
              resolve(data);
            }
          });
        });
      } catch (companyError: any) {
        console.error("Erro ao buscar informações da empresa:", companyError);
        // Marcar que precisa de reautorização
        await prisma.quickBooksAccount.update({
          where: { user_id: userId },
          data: { needsReauthorization: true }
        });

        return res.status(403).json({
          error: "Insufficient permissions",
          message: "You need to reconnect your QuickBooks account with additional permissions",
          action: "reauthorize"
        });
      }

      // Preparar os itens da fatura com logs detalhados
      console.log("Serviços do projeto:", services);
      console.log("Coeficiente recebido:", coefficientPerfentage);

      const processedLineItems = [];

      const incomeAccount = await this.getIncomeAccount(qb);

      const coef = await this.normalizeCoefficient(coefficientPerfentage);

      for (const service of services) {
        const itemName = service?.name ?? "Service";

        // Parse seguro (aceita "7.500,00", "7,500.00", "7500", number, etc.)
        const qtyParsed = await this.parseMoney(service?.quantity);
        const priceParsed = await this.parseMoney(service?.price);
        const totalParsed = service?.total != null ? await this.parseMoney(service.total) : null;

        // Quantidade efetiva (se vier 0/NaN e houver valor -> usa 1 como fallback)
        let qty = Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : 0;

        // Total base (antes do coeficiente). Se não vier, calcula por price*qty.
        const baseTotal = totalParsed != null && Number.isFinite(totalParsed) && totalParsed > 0
          ? totalParsed
          : await this.round2(priceParsed * (qty || 0));

        // Se não temos qty mas temos valor, assume 1 p/ fechar a conta
        if ((!qty || qty <= 0) && baseTotal > 0) qty = 1;

        // Valor desejado da linha após coeficiente
        const desiredAmount = await this.round2(baseTotal * coef);

        // UnitPrice calculado para que Amount == UnitPrice * Qty (após arredondar)
        const unitPrice = await this.round2(desiredAmount / (qty || 1));
        const amount = await this.round2(unitPrice * (qty || 1));

        // Validação
        if (!qty || amount <= 0) {
          console.warn(`⚠️ Valor inválido para o serviço: ${itemName}. Ignorando item.`);
          continue;
        }

        try {
          console.log(`Verificando/criando Item "${itemName}" no QuickBooks...`);

          // IMPORTANTe: use o id de conta de receita válido que você obteve antes do loop (incomeAccount.id)
          const { id: itemId, name: qboItemName } = await this.findOrCreateServiceItem(
            qb,
            itemName,
            priceParsed,     // preço base do Item; a linha pode usar UnitPrice diferente
            incomeAccount.id // << id de Account (Income) do QBO, NÃO é userId
          );

          if (!itemId) {
            throw new Error("ERR_ITEM_NOT_FOUND_AND_ERR_TO_CREATE");
          }

          // Monta a linha garantindo consistência Amount = UnitPrice * Qty
          processedLineItems.push({
            DetailType: "SalesItemLineDetail",
            Amount: amount, // <- fechado com UnitPrice*Qty
            Description: service?.description || "",
            SalesItemLineDetail: {
              ItemRef: { value: itemId, name: qboItemName },
              Qty: qty,
              UnitPrice: unitPrice
            }
          });

          // Logs defensivos
          console.log(
            `[DBG] ${itemName} -> qty=${qty} basePrice=${priceParsed} baseTotal=${baseTotal} ` +
            `coef=${coef} unit=${unitPrice} amount=${amount}`
          );
        } catch (itemError: any) {
          console.error(`Erro ao processar item "${itemName}":`, itemError);
          // Continua para o próximo serviço
        }
      }

      // Calcular o total
      const totalAmount = processedLineItems.reduce((sum: number, item: InvoiceLineItem) => sum + item.Amount, 0);
      console.log("Total calculado:", totalAmount);

      // Preparar a data de vencimento
      const dueDateObj = dueDate ? new Date(`${dueDate}T00:00:00`) : new Date();
      // dueDateObj.setDate(dueDateObj.getDate() + 30);

      // Antes de criar a fatura, verifique se o cliente existe no QuickBooks usando SDK
      try {
        console.log("Verificando se o cliente existe no QuickBooks...");

        let clientId;
        const findCustomerResult = await new Promise((resolve, reject) => {
          qb.findCustomers([{ field: 'DisplayName', value: project.client!.name }], (err: any, data: any) => {
            if (err) {
              console.error("Erro ao buscar cliente:", err);
              reject(err);
            } else {
              resolve(data);
            }
          });
        });

        const customers = (findCustomerResult as any)?.QueryResponse?.Customer || [];

        if (customers.length > 0) {
          // Cliente encontrado
          clientId = customers[0].Id;
          console.log(`Cliente "${project.client!.name}" encontrado com ID: ${clientId}`);
        } else {
          // Cliente não encontrado, criar um novo usando SDK
          console.log(`Cliente "${project.client!.name}" não encontrado. Criando cliente...`);
          const clientData = {
            DisplayName: project.client!.name,
            CompanyName: project.client!.name,
            PrimaryEmailAddr: {
              Address: project.client!.email || "cliente@exemplo.com"
            }
          };

          let createCustomerResultId;
          if (project?.company_id) {
            createCustomerResultId = await fireAndForgetUpsertToQBO(project.company_id, userId, project.client!.id);
          } else {
            throw new Error("ERR_CLIENT_NOT_FOUND");
          }

          clientId = createCustomerResultId;
          console.log(`Cliente "${project.client!.name}" criado com ID: ${clientId}`);
        }

        // Preparar dados da fatura usando os itens processados ou dados simplificados
        const invoiceData = processedLineItems.length > 0 ? {
          Line: processedLineItems,
          CustomerRef: {
            value: clientId
          },
          DueDate: dueDateObj.toISOString().split('T')[0],
          PrivateNote: description || `Invoice for Project ${project.id}`,
          AllowOnlineCreditCardPayment: true,
          AllowOnlineACHPayment: true
        } : {
          Line: [
            {
              DetailType: "SalesItemLineDetail",
              Amount: totalAmount,
              SalesItemLineDetail: {
                ItemRef: {
                  name: "Services",
                  value: "1"  // Usar o ID 1 que geralmente é o item de serviços padrão
                }
              }
            }
          ],
          CustomerRef: {
            value: clientId
          },
          DueDate: dueDateObj.toISOString().split('T')[0],
          PrivateNote: description || `Invoice for Project ${project.id}`,
          AllowOnlineCreditCardPayment: true,
          AllowOnlineACHPayment: true
        };

        // Criar a fatura usando SDK
        console.log("Criando fatura no QuickBooks usando SDK...");


        // 1) Criar a fatura
        const invoiceResult = await new Promise((resolve, reject) => {
          qb.createInvoice(invoiceData, (err: any, data: any) => {
            if (err) return reject(err);
            resolve(data);
          });
        });

        // 2) Normalize o objeto retornado (alguns SDKs retornam { Invoice: {...} })
        const created = (invoiceResult as any)?.Invoice ?? (invoiceResult as any);
        const createdId = created?.Id;

        // 3) Leia o invoice completo (garante Balance/TotalAmt/TxnStatus atualizados)
        const fetched = await new Promise((resolve, reject) => {
          qb.getInvoice(createdId, (err: any, data: any) => {
            if (err) return reject(err);
            resolve(data);
          });
        });
        const inv = (fetched as any)?.Invoice ?? (fetched as any);

        // 4) Derive o status de pagamento
        function deriveQboInvoicePaymentStatus(i: any): "voided" | "paid" | "partial" | "open" {
          if (i?.TxnStatus === "Voided") return "voided";
          const total = Number(i?.TotalAmt ?? 0);
          const bal = Number(i?.Balance ?? 0);
          if (total > 0 && bal === 0) return "paid";
          if (bal > 0 && bal < total) return "partial";
          return "open";
        }

        // (opcional) status de entrega
        const emailStatus = inv?.EmailStatus ?? null;   // "NotSet" | "NeedToSend" | "EmailSent"
        const printStatus = inv?.PrintStatus ?? null;   // "NotSet" | "NeedToPrint" | "PrintComplete"

        // 5) Persistir no banco
        const newInvoice = await prisma.invoice.create({
          data: {
            stripeInvoiceId: `qb-${Date.now()}`,
            externalInvoiceId: inv.Id,
            invoiceType: "quickbooks",
            externalDocNumber: inv.DocNumber,
            status: deriveQboInvoicePaymentStatus(inv), // << status real
            // use o valor vindo do QBO, se existir
            totalAmount: Number(inv?.TotalAmt ?? totalAmount),
            dueDate: inv?.DueDate ? new Date(inv.DueDate) : dueDateObj,
            description: description || `Invoice for Project ${project.id}`,
            projectId: project.id,
            companyId: project.company_id,
            user_id: userId,
            percentageCoefficient: coefficientPerfentage || 1,
            type_value: type_value,
            type_invoicebase: type_invoicebase,

            // (opcional) guarde os status de envio/impressão se quiser
            // emailStatusQbo: emailStatus,
            // printStatusQbo: printStatus,

            InvoiceItems: {
              create: processedLineItems.map((item: any) => ({
                name: item?.SalesItemLineDetail?.ItemRef?.name || "Service",
                description: item.Description,
                quantity: item?.SalesItemLineDetail?.Qty || 1,
                price: item?.SalesItemLineDetail?.UnitPrice || item.Amount,
                totalAmount: item.Amount
              }))
            }
          },
          include: { InvoiceItems: true }
        });

        return res.status(201).json({
          message: "QuickBooks invoice created successfully",
          invoice: newInvoice
        });

      } catch (clientError: any) {
        console.error("Erro ao processar cliente:", clientError);
        return res.status(400).json({
          error: "Error processing client in QuickBooks",
          details: clientError.message
        });
      }
    } catch (error: any) {
      console.error("Erro detalhado ao criar fatura no QuickBooks:", error);

      // Verificar se é um erro de autorização
      if (error.message && error.message.includes("401") || error.message.includes("403")) {
        // Atualizar o status da conta para indicar que precisa de reautorização
        try {
          await prisma.quickBooksAccount.update({
            where: { user_id: userId },
            data: {
              needsReauthorization: true
            }
          });
        } catch (updateError) {
          console.error("Erro ao atualizar status de reautorização:", updateError);
        }

        return res.status(403).json({
          error: "Insufficient permissions",
          message: "You need to reconnect your QuickBooks account with additional permissions",
          action: "reauthorize"
        });
      }

      return res.status(500).json({
        error: "QuickBooks API Error",
        message: error.message,
        details: error.toString()
      });
    }
  }

  async getInvoicesByProject(req: Request, res: Response) {
    const { projectId } = req.params;
    const { searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

    try {
      const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
      const itemsLimit = Number(itemsPerPage);
      const search = typeof searchTerm === 'string' ? searchTerm : "";

      const filtro = {
        projectId,
        invoiceType: "quickbooks",
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
            externalDocNumber: {
              contains: search,
            }
          }
        ]
      };

      const invoices = await prisma.invoice.findMany({
        where: filtro,
        orderBy: { createdAt: "desc" },
        include: {
          company: true,
          InvoiceSendHistory: {
            orderBy: { sentAt: "desc" }
          },
          project: {
            include: {
              client: {
                select: { id: true, name: true, email: true }
              }
            }
          },
        },
        skip: pageNumber * itemsLimit,
        take: itemsLimit
      });

      const total = await prisma.invoice.count({ where: filtro });

      // Atualizar status das faturas do QuickBooks
      const updatedInvoices = await Promise.all(
        invoices.map(async (invoice) => {
          try {
            if (!invoice.externalInvoiceId) {
              return invoice;
            }

            // Buscar o usuário com conta QuickBooks
            const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
              where: { user_id: invoice.user_id }
            });

            if (!quickBooksAccount) {
              return { ...invoice, error: "QuickBooks account not found" };
            }

            // Obter cliente QuickBooks configurado
            if (!invoice.user_id) {
              return { ...invoice, error: "User ID is missing" };
            }
            const { qb } = await this.getQBClient(invoice.user_id);

            // Buscar status atualizado da fatura no QuickBooks usando SDK
            const invoiceResult = await new Promise((resolve, reject) => {
              qb.getInvoice(invoice.externalInvoiceId, (err: any, data: any) => {
                if (err) {
                  console.error(`Erro ao buscar fatura ${invoice.externalInvoiceId}:`, err);
                  reject(err);
                } else {
                  resolve(data);
                }
              });
            });

            const status = (invoiceResult as any).Invoice.status || invoice.status;

            // Atualizar o status no banco de dados, se necessário
            if (invoice.status !== status) {
              await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status },
              });
            }

            // Pegar a data do último envio
            const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;

            return { ...invoice, status, lastSentAt: lastSend };
          } catch (error: any) {
            console.error(`Error fetching QuickBooks invoice ${invoice.externalInvoiceId}:`, error);
            return { ...invoice, error: error.message };
          }
        })
      );

      return res.status(200).json({ total, invoices: updatedInvoices });
    } catch (error: any) {
      console.error("Error fetching QuickBooks invoices:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async sendInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId } = req.body;

    try {
      const invoice = await prisma.invoice.findFirst({
        where: { externalInvoiceId: invoiceId },
        include: {
          project: {
            include: {
              client: true
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "quickbooks") {
        return res.status(400).json({ error: "Not a QuickBooks invoice" });
      }

      if (!invoice.externalInvoiceId) {
        return res.status(400).json({ error: "QuickBooks invoice ID missing" });
      }

      if (!invoice.project.client) {
        return res.status(400).json({ error: "Client not found for this invoice" });
      }

      if (!invoice.project.client.email) {
        return res.status(400).json({ error: "Client email is required" });
      }

      // Obter cliente QuickBooks configurado
      const { qb } = await this.getQBClient(userId);

      // Enviar a fatura pelo QuickBooks usando SDK
      const sendInvoiceData = {
        sendTo: invoice.project.client.email,
        email: {
          subject: `Invoice ${invoice.externalDocNumber} from ${invoice.project.client.name}`,
          message: `Please find attached invoice ${invoice.externalDocNumber} for your recent services.`
        }
      };

      if (invoice?.project?.client?.id) {
        await new Promise((resolve, reject) => {
          qb.sendInvoicePdf(invoiceId, invoice?.project?.client?.email, (err: any, data: any) => {
            if (err) return reject(err);
            resolve(data);
          });
        });

      } else {
        console.log("Erro ao enviar fatura para o cliente:", invoice?.project?.client?.email);

        return res.status(400).json({
          error: "ERR_SEND_INVOICE",
          details: ""
        });
      }

      // Registrar o envio no histórico
      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoice.id,
          recipient: invoice.project.client.email,
          user_id: userId
        }
      });

      // Atualizar o status da fatura
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "sent" }
      });

      return res.status(200).json({
        message: "Invoice sent successfully",
        recipient: invoice.project.client.email
      });
    } catch (error: any) {
      console.error("Error sending QuickBooks invoice:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message
      });
    }
  }

  async cancelInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId } = req.body;

    try {
      const invoice = await prisma.invoice.findFirst({
        where: { externalInvoiceId: invoiceId },
        select: {
          id: true,
          externalInvoiceId: true,
          invoiceType: true,
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "quickbooks") {
        return res.status(400).json({ error: "Not a QuickBooks invoice" });
      }

      if (!invoice.externalInvoiceId) {
        return res.status(400).json({ error: "QuickBooks invoice ID missing" });
      }

      // Obter cliente QuickBooks configurado
      const { qb } = await this.getQBClient(userId);

      // Primeiro, buscar a fatura atual para obter o SyncToken
      const currentInvoice = await new Promise((resolve, reject) => {
        qb.getInvoice(invoice.externalInvoiceId, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao buscar fatura para cancelamento:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      // Cancelar a fatura no QuickBooks (marcar como void) usando SDK
      const voidInvoiceData = {
        SyncToken: (currentInvoice as any).SyncToken,
        Id: invoice.externalInvoiceId,
        sparse: true,
        PrivateNote: "Voided by system"
      };

      await new Promise((resolve, reject) => {
        qb.voidInvoice(voidInvoiceData, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao cancelar fatura:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      // Atualizar o status da fatura
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "void" }
      });

      return res.status(200).json({
        message: "Invoice voided successfully"
      });
    } catch (error: any) {
      console.error("Error voiding QuickBooks invoice:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message
      });
    }
  }

  async escapeForQBO(str: string) {
    return String(str ?? '').replace(/'/g, "''");
  }

  // Busca uma conta de receita válida. Preferência: ServiceFeeIncome -> senão qualquer Income ativa.
  async getIncomeAccount(qb: any): Promise<{ id: string; name: string }> {
    // 1) tenta ServiceFeeIncome
    const pref = await new Promise<any>((resolve, reject) => {
      qb.findAccounts(
        { AccountType: 'Income', AccountSubType: 'ServiceFeeIncome', Active: true, limit: 1 },
        (err: any, data: any) => (err ? reject(err) : resolve(data))
      );
    });
    let acc = pref?.QueryResponse?.Account?.[0];

    // 2) se não tiver, pega qualquer Income ativa
    if (!acc) {
      const anyIncome = await new Promise<any>((resolve, reject) => {
        qb.findAccounts({ AccountType: 'Income', Active: true, limit: 50 }, (err: any, data: any) =>
          err ? reject(err) : resolve(data)
        );
      });
      const list = anyIncome?.QueryResponse?.Account || [];
      // tenta algo comum, senão primeira
      acc =
        list.find((a: any) => a.AccountSubType === 'SalesOfProductIncome') ||
        list.find((a: any) => a.AccountSubType === 'ServiceFeeIncome') ||
        list[0];
    }

    if (!acc) throw new Error('Nenhuma conta de receita (Income) ativa encontrada no QuickBooks.');
    return { id: acc.Id, name: acc.Name };
  }

  // Busca Item por nome; se não existir, cria (Type=Service) com IncomeAccountRef informado
  async findOrCreateServiceItem(
    qb: any,
    name: string,
    unitPrice: number,
    incomeAccountId: string
  ): Promise<{ id: string; name: string }> {
    const search = await new Promise<any>((resolve, reject) => {
      // Mantém o mesmo padrão que você já usa (array de filtros)
      qb.findItems([{ field: 'Name', value: name }], (err: any, data: any) =>
        err ? reject(err) : resolve(data)
      );
    });
    const items = search?.QueryResponse?.Item || [];
    if (items.length > 0) return { id: items[0].Id, name: items[0].Name };

    const payload = {
      Name: name,
      Type: 'Service',
      IncomeAccountRef: { value: incomeAccountId },
      UnitPrice: Number(unitPrice) || 0
    };

    const created = await new Promise<any>((resolve, reject) => {
      qb.createItem(payload, (err: any, data: any) => (err ? reject(err) : resolve(data)));
    });

    return { id: created.Item.Id, name: created.Item.Name };
  }

  async round2(n: number) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  async parseMoney(input: any): Promise<number> {
    if (typeof input === 'number' && Number.isFinite(input)) return input;

    let s = String(input ?? '').trim();
    if (!s) return 0;

    // remove símbolos de moeda e espaços
    s = s.replace(/[^\d.,-]/g, '');

    const hasComma = s.includes(',');
    const hasDot = s.includes('.');

    if (hasComma && hasDot) {
      // Decide decimal pelo último separador
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        // pt-BR: 7.500,00 -> remove pontos, troca vírgula por ponto
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // en-US: 7,500.00 -> remove vírgulas
        s = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      // 7500,00 -> vírgula é decimal
      s = s.replace(',', '.');
    } else {
      // só ponto ou só dígitos: já ok
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  async parseQty(input: any): Promise<number> {
    const n = typeof input === 'number' ? input : await this.parseMoney(input);
    return Number.isFinite(n) ? n : 0;
  }

  // Se vier 75 (percentual), vira 0.75; se vier 0.75, mantém.
  // Ajuste os limiares conforme sua regra de negócio.
  async normalizeCoefficient(input: any): Promise<number> {
    const n = typeof input === 'number' ? input : await this.parseMoney(input);
    if (!Number.isFinite(n) || n <= 0) return 1;
    if (n > 1.5 && n <= 100) return n / 100; // 75 -> 0.75
    return n; // já é fator
  }

} 