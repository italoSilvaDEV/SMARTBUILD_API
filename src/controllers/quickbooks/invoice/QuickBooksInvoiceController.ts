import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
// @ts-ignore
import QuickBooks from "node-quickbooks";

import { fireAndForgetUpsertToQBO } from "../customer/FireAndForgetUpsertToQBO";
import { getQbClientWithAccountOrThrow } from "../util/QuickBooksClientUtil";

// Função para determinar se deve marcar needsReauthorization
function shouldRequireReauthorization(err: any): boolean {
  const status = err?.status || err?.response?.status;
  const code = err?.code || err?.response?.data?.error;
  const desc = err?.response?.data?.error_description || "";
  
  return (
    status === 401 ||
    status === 403 ||
    code === "invalid_grant" ||
    /invalid_token|token expired|reauthoriz/i.test(String(desc))
  );
}

// Função para retry com backoff exponencial
async function callWithRetry<T>(operation: () => Promise<T>, attempts = 2, delayMs = 200): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (attempts <= 0) {
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return callWithRetry(operation, attempts - 1, delayMs * 2);
  }
}

// Defina a interface para os itens da fatura
interface InvoiceLineItem {
  Amount: number; // ou o tipo correto que você espera
  // Adicione outros campos que você espera que o item tenha
} 

export class QuickBooksInvoiceController { 


  // Método interno para criação de invoice sem req/res
  async createInvoiceInternal(params: {  
    projectId: string;
    description?: string;
    type_invoicebase?: string;
    dueDate?: string;
    userId: string;
    coefficientPerfentage?: number;
    services: any[];
    type_value?: string;
    totalAmountTarget?: number; // Valor total alvo (vindo do Stripe/banco local)
    calledFromStripe?: boolean; // Novo parâmetro para identificar origem
    multi_emails?: string; // Emails adicionais para envio
    date_creation?: string; // Data customizada de criação
  }) {
    const { projectId, description, type_invoicebase, dueDate, userId, coefficientPerfentage, services, type_value, totalAmountTarget, calledFromStripe = false, multi_emails, date_creation } = params;

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
        throw new Error("Project not found");
      }

      if (!project.client) {
        throw new Error("Client not found for this project");
      }

      if (!project.company || !project.company_id) {
        throw new Error("Company not found for this project");
      }

      // Obter cliente QuickBooks com método robusto
      const { qb, account } = await getQbClientWithAccountOrThrow(userId, project.company_id);

      // Testar conexão com uma operação simples
      try {
        await callWithRetry(
          () => new Promise((resolve, reject) => {
            qb.getCompanyInfo(account.realmId, (err: any, data: any) => {
              if (err) {
                console.error("Erro ao buscar informações da empresa:", err);
                reject(err);
              } else {
                console.log("Informações da empresa obtidas com sucesso");
                resolve(data);
              }
            });
          }),
          2, // 2 tentativas adicionais
          200 // 200ms de delay inicial
        );
      } catch (companyError: any) {
        console.error("Erro ao buscar informações da empresa:", companyError);
        
        // Só marcar needsReauthorization se for realmente um erro de autorização
        if (shouldRequireReauthorization(companyError)) {
          await prisma.quickBooksAccount.update({
            where: { company_id: project.company_id },
            data: { needsReauthorization: true }
          });
          throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
        }
        
        // Para outros erros (timeout, 500, etc.), não marcar como reauth
        throw new Error(`QuickBooks connection error: ${companyError.message || 'Unknown error'}`);
      }

      // Preparar os itens da fatura com logs detalhados
      console.log("Serviços do projeto:", services);
      console.log("Coeficiente recebido:", coefficientPerfentage);

      // Buscar invoices pagos do projeto para calcular valor já pago
      console.log("Buscando invoices pagos do projeto para QuickBooks...");
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
      console.log(`Total já pago no projeto (QB): $${totalPaidAmount}`);

      // Calcular valor total original do projeto (sem coeficiente)
      const originalProjectValue = services.reduce((sum: number, service: any) => {
        const quantity = Number(service.quantity) || 0;
        const price = Number(service.price) || 0;
        return sum + (service.total || (quantity * price));
      }, 0);

      console.log(`Valor original do projeto (QB): $${originalProjectValue}`);

      // Calcular saldo restante após pagamentos
      const remainingBalance = Math.max(0, originalProjectValue - totalPaidAmount);
      console.log(`Saldo restante (QB): $${remainingBalance}`);

      const processedLineItems = [];

      const incomeAccount = await this.getIncomeAccount(qb);

      const coef = await this.normalizeCoefficient(coefficientPerfentage);

      // Aplicar coeficiente sobre o saldo restante
      const invoiceAmountWithCoefficient = remainingBalance * coef;
      console.log(`Valor da fatura QB após coeficiente (${coef}): $${invoiceAmountWithCoefficient}`);

      // Validar se há serviços
      if (!services || !Array.isArray(services) || services.length === 0) {
        throw new Error("No services provided for invoice creation");
      }

      // Primeiro, calcular os valores com coeficiente ANTES de processar os itens
      const serviceCalculations = [];
      let totalWithCoefficientCalculated = 0;

      for (const service of services) {
        // Validações básicas do serviço
        if (!service || typeof service !== 'object') {
          console.warn("Serviço inválido encontrado, ignorando:", service);
          continue;
        }

        const rawItemName = service?.name?.trim() || "Service";
        const itemName = this.cleanServiceNameForQuickBooks(rawItemName);
        
        // Validar se o nome do item não está vazio após limpeza
        if (!itemName || itemName === "Service") {
          console.warn("Nome do serviço vazio ou inválido após limpeza, ignorando:", service);
          continue;
        }

        // Parse seguro (aceita "7.500,00", "7,500.00", "7500", number, etc.)
        const qtyParsed = await this.parseMoney(service?.quantity);
        const priceParsed = await this.parseMoney(service?.price);
        const totalParsed = service?.total != null ? await this.parseMoney(service.total) : null;

        // Quantidade efetiva (se vier 0/NaN e houver valor -> usa 1 como fallback)
        let qty = Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : 0;

        // Total original do serviço (antes do coeficiente e desconto de pagamentos)
        const originalServiceAmount = totalParsed != null && Number.isFinite(totalParsed) && totalParsed > 0
          ? totalParsed
          : await this.round2(priceParsed * (qty || 0));

        // Se não temos qty mas temos valor, assume 1 p/ fechar a conta
        if ((!qty || qty <= 0) && originalServiceAmount > 0) qty = 1;

        // Calcular proporção do serviço no valor total original do projeto
        const serviceProportion = originalProjectValue > 0 ? originalServiceAmount / originalProjectValue : 0;
        
        // Aplicar a proporção ao valor da fatura com coeficiente
        const serviceAmountWithCoefficient = invoiceAmountWithCoefficient * serviceProportion;

        serviceCalculations.push({
          service,
          itemName,
          qty,
          priceParsed,
          originalServiceAmount,
          serviceAmountWithCoefficient,
          serviceProportion
        });

        totalWithCoefficientCalculated += serviceAmountWithCoefficient;
      }

      // Definir o valor alvo do Stripe/banco local se fornecido, senão usar o calculado
      const totalTargetAmount = totalAmountTarget || invoiceAmountWithCoefficient;
      
      console.log(`Total com coeficiente calculado: ${totalWithCoefficientCalculated}, Total alvo: ${totalTargetAmount}`);

      // Agora processar os itens com ajuste para garantir o total exato
      let totalProcessed = 0;

      for (let i = 0; i < serviceCalculations.length; i++) {
        const calc = serviceCalculations[i];
        const isLastItem = i === serviceCalculations.length - 1;

        let finalAmount;
        let unitPrice;
        let exactAmount;
        
        // SOLUÇÃO: Usar Qty=1 e Rate=valor total para evitar limitação de arredondamento do QB
        const qtyForQB = 1; // Sempre usar quantidade 1 no QuickBooks
        
        if (isLastItem) {
          // Para o último item, usar o valor restante para garantir total exato
          const remainingAmount = await this.round2(totalTargetAmount - totalProcessed);
          unitPrice = await this.round2(remainingAmount); // Rate = valor total (já que Qty=1)
          exactAmount = await this.round2(unitPrice * qtyForQB); // Amount = Rate × 1
          finalAmount = remainingAmount; // Para logs
        } else {
          // Para os outros itens, usar o valor com coeficiente já aplicado
          finalAmount = await this.round2(calc.serviceAmountWithCoefficient);
          unitPrice = await this.round2(finalAmount); // Rate = valor total (já que Qty=1)
          exactAmount = await this.round2(unitPrice * qtyForQB); // Amount = Rate × 1
        }
        
        totalProcessed += exactAmount;
        
        // Log detalhado para monitoramento
        console.log(`QB - ${calc.itemName}: Valor original $${calc.originalServiceAmount}, Valor c/ coeficiente $${calc.serviceAmountWithCoefficient}, Qty QB=1, Rate $${unitPrice}, Amount exato $${exactAmount}${isLastItem ? ' (último item - ajustado)' : ''}`);

        // Validação melhorada
        if (qtyForQB <= 0 || exactAmount <= 0 || !Number.isFinite(qtyForQB) || !Number.isFinite(exactAmount)) {
          console.warn(` Valor inválido para o serviço: ${calc.itemName}. qty=${qtyForQB}, amount=${exactAmount}. Ignorando item.`);
          continue;
        }

        try {
          console.log(`Verificando/criando Item "${calc.itemName}" no QuickBooks...`);

          // IMPORTANTe: use o id de conta de receita válido que você obteve antes do loop (incomeAccount.id)
          const { id: itemId, name: qboItemName } = await this.findOrCreateServiceItem(
            qb,
            calc.itemName,
            calc.priceParsed,     // preço base do Item; a linha pode usar UnitPrice diferente
            incomeAccount.id // << id de Account (Income) do QBO, NÃO é userId
          );

          if (!itemId) {
            throw new Error("ERR_ITEM_NOT_FOUND_AND_ERR_TO_CREATE");
          }

        // Monta a linha garantindo consistência Amount = UnitPrice * Qty (com Qty=1)
        processedLineItems.push({
          DetailType: "SalesItemLineDetail",
          Amount: exactAmount, // <- valor exato que fecha com UnitPrice * Qty
          Description: this.cleanDescriptionForQuickBooks(calc.service?.description || ""), // Limpar HTML e truncar
          SalesItemLineDetail: {
            ItemRef: { value: itemId, name: qboItemName },
            Qty: qtyForQB, // Sempre 1 para evitar limitação de arredondamento
            UnitPrice: unitPrice // Rate = valor total do serviço
          },
          // Armazenar valores reais para salvar no banco
          _realQuantity: calc.qty,
          _realPrice: calc.priceParsed
        });

          // Logs defensivos
          console.log(
            `[DBG] ${calc.itemName} -> qtyOriginal=${calc.qty} qtyQB=${qtyForQB} basePrice=${calc.priceParsed} originalAmount=${calc.originalServiceAmount} ` +
            `serviceAmountWithCoef=${calc.serviceAmountWithCoefficient} unitPrice=${unitPrice} exactAmount=${exactAmount}`
          );
        } catch (itemError: any) {
          console.error(`Erro ao processar item "${calc.itemName}":`, itemError);
          // Continua para o próximo serviço
        }
      }

      console.log(`Total calculado: ${totalProcessed}, Total target: ${totalTargetAmount}, Diferença: ${Math.abs(totalProcessed - totalTargetAmount)}`);
      

      // Calcular o total
      const totalAmount = processedLineItems.reduce((sum: number, item: InvoiceLineItem) => sum + item.Amount, 0);
      console.log("Total calculado:", totalAmount);

      // Preparar a data de vencimento
      const dueDateObj = dueDate ? new Date(`${dueDate}T00:00:00`) : new Date();
      // dueDateObj.setDate(dueDateObj.getDate() + 30);

        // Verificar cliente no QuickBooks - abordagem conservadora
        let clientId;
        
        try {
          console.log("🔍 Verificando cliente no QuickBooks...");
          console.log(`Cliente local: ${project.client!.name} (ID: ${project.client!.id})`);
          console.log(`Cliente tem idQuickbooks? ${project.client!.idQuickbooks || 'NÃO'}`);

          // 1) Primeiro verificar se o cliente local já tem idQuickbooks
          if (project.client!.idQuickbooks) {
            console.log(`📋 Cliente local já possui idQuickbooks: ${project.client!.idQuickbooks}`);
            
            // Verificar se o cliente ainda existe no QuickBooks
            try {
              const existingCustomer = await new Promise((resolve, reject) => {
                qb.getCustomer(project.client!.idQuickbooks, (err: any, data: any) => {
                  if (err) {
                    console.warn("⚠️ Cliente com idQuickbooks não encontrado no QBO, será criado novo");
                    resolve(null);
                  } else {
                    resolve(data);
                  }
                });
              });

              if (existingCustomer) {
                const customer = (existingCustomer as any)?.Customer || (existingCustomer as any);
                clientId = customer.Id;
                console.log(`✅ Cliente existente confirmado no QBO com ID: ${clientId}`);
              }
            } catch (getError: any) {
              console.warn("⚠️ Erro ao verificar cliente existente:", getError?.message || getError);
              console.log("Continuando para criação de novo cliente...");
            }
          }

          // 2) Se não tem idQuickbooks válido, criar novo cliente
          if (!clientId) {
            console.log(`📝 Criando novo cliente no QuickBooks para: ${project.client!.name}`);
            
            // Validar dados do cliente antes de criar
            const clientName = project.client!.name?.trim();
            if (!clientName || clientName.length === 0) {
              throw new Error("Client name is required to create QuickBooks customer");
            }

            const clientEmail = project.client!.email?.trim() || "noemail@example.com";
            console.log(`Email do cliente: ${clientEmail}`);
            
            const createCustomerData = {
              DisplayName: clientName,
              CompanyName: clientName,
              PrimaryEmailAddr: {
                Address: clientEmail
              }
            };

            console.log("Dados do cliente para criação:", JSON.stringify(createCustomerData, null, 2));

            try {
              const createCustomerResult = await new Promise((resolve, reject) => {
                qb.createCustomer(createCustomerData, (err: any, data: any) => {
                  if (err) {
                    console.error("❌ Erro ao criar cliente no QuickBooks:", err);
                    console.error("Detalhes do erro:", JSON.stringify(err, null, 2));
                    reject(err);
                  } else {
                    console.log("✅ Cliente criado com sucesso no QuickBooks");
                    resolve(data);
                  }
                });
              });

              const createdCustomer = (createCustomerResult as any)?.Customer || (createCustomerResult as any);
              
              console.log("Resposta da criação do cliente:", JSON.stringify(createdCustomer, null, 2));
              
              if (!createdCustomer || !createdCustomer.Id) {
                console.error("❌ Resposta inválida do QuickBooks ao criar cliente");
                throw new Error("QuickBooks returned invalid response when creating customer (no ID)");
              }

              clientId = createdCustomer.Id;
              console.log(`✅ Novo cliente criado no QBO com ID: ${clientId}`);

              // Atualizar cliente local com o novo idQuickbooks
              try {
                await prisma.client.update({
                  where: { id: project.client!.id },
                  data: { idQuickbooks: clientId }
                });
                console.log(`✅ Cliente local atualizado com idQuickbooks: ${clientId}`);
              } catch (updateError: any) {
                console.error("⚠️ Erro ao atualizar cliente local com idQuickbooks:", updateError?.message || updateError);
                // Não falhar a criação do invoice por causa disso
              }
            } catch (createError: any) {
              console.error("❌ Erro crítico ao criar cliente no QuickBooks:", createError);
              throw new Error(`Failed to create customer in QuickBooks: ${createError?.message || createError?.toString() || 'Unknown error'}`);
            }
          }

          // 3) Validação final: garantir que temos um clientId válido
          if (!clientId) {
            console.error("❌ ERRO CRÍTICO: clientId não foi definido após processamento");
            throw new Error("Failed to obtain valid QuickBooks customer ID");
          }

          console.log(`✅ Cliente QuickBooks confirmado - ID: ${clientId}`);

        } catch (clientError: any) {
          console.error("❌ ERRO ao processar cliente no QuickBooks:", clientError);
          console.error("Stack trace:", clientError?.stack);
          throw new Error(`Error processing client in QuickBooks: ${clientError?.message || clientError?.toString() || 'Unknown error occurred'}`);
        }

        // Verificar se há itens processados
        if (processedLineItems.length === 0) {
          throw new Error("No valid items to include in the invoice. Please check the services data.");
        }

        // Limpar campos internos antes de enviar para QuickBooks
        const cleanLineItems = processedLineItems.map((item: any) => {
          const { _realQuantity, _realPrice, ...cleanItem } = item;
          return cleanItem;
        });

        // Preparar dados da fatura
        const invoiceData = {
          Line: cleanLineItems, // Usar itens limpos sem campos internos
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
        let inv = (fetched as any)?.Invoice ?? (fetched as any);
        
        // 4) Tentar obter DocNumber com retry robusto
        inv = await this.fetchInvoiceWithRetryForDocNumber(qb, createdId, inv);

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

        // 5) Persistir no banco - comportamento baseado na origem da chamada
        if (calledFromStripe) {
          // Quando chamado pelo StripeController, retornar apenas IDs do QuickBooks
          return {
            success: true,
            message: "QuickBooks invoice created successfully",
            quickbooksId: inv.Id,
            docNumber: inv.DocNumber,
            totalAmount: Number(inv?.TotalAmt ?? totalAmount),
            status: deriveQboInvoicePaymentStatus(inv)
          };
        } else {
          // Quando chamado diretamente (rota QuickBooks), persistir no banco local
          // Primeiro, gerar número sequencial para o invoice
          const allInvoices = await prisma.invoice.findMany({
            where: {
              companyId: project.company_id
            },
            select: {
              externalInvoiceId: true
            }
          });

          const numericIds = allInvoices
            .map(invoice => parseInt(invoice.externalInvoiceId || ""))
            .filter(num => !isNaN(num) && num > 0);

          let nextInvoiceNumber = 1000;
          if (numericIds.length > 0) {
            const maxNumber = Math.max(...numericIds);
            nextInvoiceNumber = maxNumber + 1;
          }

          console.log(` Número sequencial do invoice: ${nextInvoiceNumber}`);

          const newInvoice = await prisma.invoice.create({
            data: {
              externalInvoiceId: nextInvoiceNumber.toString(), // Número sequencial
              invoiceType: "quickbooks",
              externalDocNumber: inv.DocNumber,
              idQuickbookContabio: inv.Id, // ID real do QuickBooks
              idQuickBooksRef: inv.Id, // Referência duplicada
              docNumberQuickBooksContabio: inv.DocNumber, // DocNumber do QB
              status: deriveQboInvoicePaymentStatus(inv), // Status real do QB
              totalAmount: Number(inv?.TotalAmt ?? totalAmount),
              dueDate: inv?.DueDate ? new Date(inv.DueDate) : dueDateObj,
              description: description || `Invoice for Project ${project.id}`,
              projectId: project.id,
              companyId: project.company_id,
              user_id: userId,
              percentageCoefficient: coefficientPerfentage || 1,
              type_value: type_value,
              type_invoicebase: type_invoicebase as "project" | "estimate" | null,
              multi_emails: multi_emails || project.client?.email,
              createdAt: date_creation ? new Date(date_creation) : new Date(),

              InvoiceItems: {
                create: processedLineItems.map((item: any) => ({
                  name: item?.SalesItemLineDetail?.ItemRef?.name || "Service",
                  description: item.Description, // Já foi limpo pela função cleanDescriptionForQuickBooks
                  // Valores reais para exibição/cálculo local
                  quantity: item._realQuantity || item?.SalesItemLineDetail?.Qty || 1,
                  price: item._realPrice || item?.SalesItemLineDetail?.UnitPrice || item.Amount,
                  totalAmount: item.Amount,
                  // Valores ajustados enviados ao QuickBooks
                  qboQuantity: item?.SalesItemLineDetail?.Qty || 1,
                  qboPrice: item?.SalesItemLineDetail?.UnitPrice || item.Amount
                }))
              }
            },
            include: { InvoiceItems: true }
          });

          // Registrar na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `QuickBooks invoice created successfully (Invoice #${nextInvoiceNumber}, QB ID: ${inv.Id}, DocNumber: ${inv.DocNumber || 'N/A'})`,
              invoiceId: newInvoice.id
            }
          });

          console.log(` Invoice criado com sucesso: ${newInvoice.id}`);

          return {
            success: true,
            message: "QuickBooks invoice created successfully",
            invoice: newInvoice
          };
        }

    } catch (error: any) {
      console.error("Erro detalhado ao criar fatura no QuickBooks:", error);

      // Extrair mensagem de erro do QuickBooks
      let errorMessage = error.message || error.toString();
      
      // Se for um erro do QuickBooks com estrutura Fault
      if (error.Fault && error.Fault.Error && Array.isArray(error.Fault.Error) && error.Fault.Error.length > 0) {
        const qbError = error.Fault.Error[0];
        errorMessage = `${qbError.Message}${qbError.Detail ? ` - ${qbError.Detail}` : ''} (Code: ${qbError.code || 'Unknown'})`;
        console.error("❌ Erro do QuickBooks:", errorMessage);
      }

      // Verificar se é um erro de autorização usando nossa função mais robusta
      if (shouldRequireReauthorization(error)) {
        // Atualizar o status da conta para indicar que precisa de reautorização
        try {
          // Buscar company_id pelo projectId
          const projectForError = await prisma.project.findUnique({
            where: { id: projectId },
            select: { company_id: true }
          });
          
          if (projectForError?.company_id) {
            await prisma.quickBooksAccount.update({
              where: { company_id: projectForError.company_id },
              data: {
                needsReauthorization: true
              }
            });
          }
        } catch (updateError) {
          console.error("Erro ao atualizar status de reautorização:", updateError);
        }

        throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
      }

      throw new Error(`QuickBooks API Error: ${errorMessage}`);
    }
  }

  // Método interno para atualização de invoice sem req/res
  async updateInvoiceInternal(params: {
    quickBooksInvoiceId: string;
    projectId: string;
    description?: string;
    dueDate?: string;
    userId: string;
    coefficientPerfentage?: number;
    services: any[];
    totalAmountTarget?: number; // Valor total alvo (vindo do Stripe/banco local)
    calledFromStripe?: boolean; // Parâmetro para identificar origem
  }) {
    const { 
      quickBooksInvoiceId, 
      projectId, 
      description, 
      dueDate, 
      userId, 
      coefficientPerfentage, 
      services, 
      totalAmountTarget,
      calledFromStripe = false 
    } = params;

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
        throw new Error("Project not found");
      }

      if (!project.client) {
        throw new Error("Client not found for this project");
      }

      if (!project.company || !project.company_id) {
        throw new Error("Company not found for this project");
      }

      // Obter cliente QuickBooks com método robusto
      const { qb, account } = await getQbClientWithAccountOrThrow(userId, project.company_id);

      // Testar conexão com uma operação simples
      try {
        await callWithRetry(
          () => new Promise((resolve, reject) => {
            qb.getCompanyInfo(account.realmId, (err: any, data: any) => {
              if (err) {
                console.error("Erro ao buscar informações da empresa:", err);
                reject(err);
              } else {
                console.log("Informações da empresa obtidas com sucesso");
                resolve(data);
              }
            });
          }),
          2, // 2 tentativas adicionais
          200 // 200ms de delay inicial
        );
      } catch (companyError: any) {
        console.error("Erro ao buscar informações da empresa:", companyError);
        
        // Só marcar needsReauthorization se for realmente um erro de autorização
        if (shouldRequireReauthorization(companyError)) {
          await prisma.quickBooksAccount.update({
            where: { company_id: project.company_id },
            data: { needsReauthorization: true }
          });
          throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
        }
        
        // Para outros erros (timeout, 500, etc.), não marcar como reauth
        throw new Error(`QuickBooks connection error: ${companyError.message || 'Unknown error'}`);
      }

      // Primeiro, buscar a fatura atual para obter o SyncToken e outras informações
      console.log(`Buscando invoice ${quickBooksInvoiceId} no QuickBooks para atualização...`);
      const currentInvoiceData = await new Promise((resolve, reject) => {
        qb.getInvoice(quickBooksInvoiceId, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao buscar fatura para atualização:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      const currentInvoice = (currentInvoiceData as any)?.Invoice || (currentInvoiceData as any);
      
      if (!currentInvoice || !currentInvoice.Id) {
        throw new Error(`Invoice ${quickBooksInvoiceId} not found in QuickBooks`);
      }

      console.log(`Invoice encontrado. SyncToken: ${currentInvoice.SyncToken}`);

      // Verificar se a fatura pode ser editada (não pode estar paga ou cancelada)
      if (currentInvoice.TxnStatus === "Voided") {
        throw new Error("Cannot update a voided invoice");
      }

      // Verificar se está paga (Balance = 0 e TotalAmt > 0)
      const totalAmt = Number(currentInvoice.TotalAmt || 0);
      const balance = Number(currentInvoice.Balance || 0);
      if (totalAmt > 0 && balance === 0) {
        throw new Error("Cannot update a paid invoice");
      }

      // Preparar os itens da fatura com logs detalhados
      console.log("Preparando serviços para atualização:", services);
      console.log("Coeficiente recebido:", coefficientPerfentage);

      // Buscar invoices pagos do projeto para calcular valor já pago
      console.log("Buscando invoices pagos do projeto para atualização QB...");
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          projectId: project.id,
          status: "paid",
          idQuickbookContabio: { not: quickBooksInvoiceId } // Excluir o invoice sendo atualizado
        },
        select: {
          totalAmount: true
        }
      });

      const totalPaidAmount = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      console.log(`Total já pago no projeto (QB Update): $${totalPaidAmount}`);

      // Calcular valor total original do projeto (sem coeficiente)
      const originalProjectValue = services.reduce((sum: number, service: any) => {
        const quantity = Number(service.quantity) || 0;
        const price = Number(service.price) || 0;
        return sum + (service.total || (quantity * price));
      }, 0);

      console.log(`Valor original do projeto (QB Update): $${originalProjectValue}`);

      // Calcular saldo restante após pagamentos
      const remainingBalance = Math.max(0, originalProjectValue - totalPaidAmount);
      console.log(`Saldo restante (QB Update): $${remainingBalance}`);

      const processedLineItems = [];

      const incomeAccount = await this.getIncomeAccount(qb);
      const coef = await this.normalizeCoefficient(coefficientPerfentage);

      // Aplicar coeficiente sobre o saldo restante
      const invoiceAmountWithCoefficient = remainingBalance * coef;
      console.log(`Valor da fatura QB após coeficiente para update (${coef}): $${invoiceAmountWithCoefficient}`);

      // Validar se há serviços
      if (!services || !Array.isArray(services) || services.length === 0) {
        throw new Error("No services provided for invoice update");
      }

      // Primeiro, calcular os valores com coeficiente ANTES de processar os itens (UPDATE)
      const serviceCalculationsUpdate = [];
      let totalWithCoefficientCalculatedUpdate = 0;

      for (const service of services) {
        // Validações básicas do serviço
        if (!service || typeof service !== 'object') {
          console.warn("Serviço inválido encontrado, ignorando:", service);
          continue;
        }

        const rawItemName = service?.name?.trim() || "Service";
        const itemName = this.cleanServiceNameForQuickBooks(rawItemName);
        
        // Validar se o nome do item não está vazio após limpeza
        if (!itemName || itemName === "Service") {
          console.warn("Nome do serviço vazio ou inválido após limpeza, ignorando:", service);
          continue;
        }

        // Parse seguro (aceita "7.500,00", "7,500.00", "7500", number, etc.)
        const qtyParsed = await this.parseMoney(service?.quantity);
        const priceParsed = await this.parseMoney(service?.price);
        const totalParsed = service?.total != null ? await this.parseMoney(service.total) : null;

        // Quantidade efetiva (se vier 0/NaN e houver valor -> usa 1 como fallback)
        let qty = Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : 0;

        // Total original do serviço (antes do coeficiente e desconto de pagamentos)
        const originalServiceAmount = totalParsed != null && Number.isFinite(totalParsed) && totalParsed > 0
          ? totalParsed
          : await this.round2(priceParsed * (qty || 0));

        // Se não temos qty mas temos valor, assume 1 p/ fechar a conta
        if ((!qty || qty <= 0) && originalServiceAmount > 0) qty = 1;

        // Calcular proporção do serviço no valor total original do projeto
        const serviceProportion = originalProjectValue > 0 ? originalServiceAmount / originalProjectValue : 0;
        
        // Aplicar a proporção ao valor da fatura com coeficiente
        const serviceAmountWithCoefficient = invoiceAmountWithCoefficient * serviceProportion;

        serviceCalculationsUpdate.push({
          service,
          itemName,
          qty,
          priceParsed,
          originalServiceAmount,
          serviceAmountWithCoefficient,
          serviceProportion
        });

        totalWithCoefficientCalculatedUpdate += serviceAmountWithCoefficient;
      }

      // Definir o valor alvo do Stripe/banco local se fornecido, senão usar o calculado
      const totalTargetAmountUpdate = totalAmountTarget || invoiceAmountWithCoefficient;
      
      console.log(`Total com coeficiente calculado (Update): ${totalWithCoefficientCalculatedUpdate}, Total alvo: ${totalTargetAmountUpdate}`);

      // Agora processar os itens com ajuste para garantir o total exato (UPDATE)
      let totalProcessedUpdate = 0;

      for (let i = 0; i < serviceCalculationsUpdate.length; i++) {
        const calc = serviceCalculationsUpdate[i];
        const isLastItem = i === serviceCalculationsUpdate.length - 1;

        let finalAmount;
        let unitPrice;
        let exactAmount;
        
        // SOLUÇÃO: Usar Qty=1 e Rate=valor total para evitar limitação de arredondamento do QB (UPDATE)
        const qtyForQBUpdate = 1; // Sempre usar quantidade 1 no QuickBooks
        
        if (isLastItem) {
          // Para o último item, usar o valor restante para garantir total exato
          const remainingAmount = await this.round2(totalTargetAmountUpdate - totalProcessedUpdate);
          unitPrice = await this.round2(remainingAmount); // Rate = valor total (já que Qty=1)
          exactAmount = await this.round2(unitPrice * qtyForQBUpdate); // Amount = Rate × 1
          finalAmount = remainingAmount; // Para logs
        } else {
          // Para os outros itens, usar o valor com coeficiente já aplicado
          finalAmount = await this.round2(calc.serviceAmountWithCoefficient);
          unitPrice = await this.round2(finalAmount); // Rate = valor total (já que Qty=1)
          exactAmount = await this.round2(unitPrice * qtyForQBUpdate); // Amount = Rate × 1
        }
        
        totalProcessedUpdate += exactAmount;
        
        // Log detalhado para monitoramento
        console.log(`QB Update - ${calc.itemName}: Valor original $${calc.originalServiceAmount}, Valor c/ coeficiente $${calc.serviceAmountWithCoefficient}, Qty QB=1, Rate $${unitPrice}, Amount exato $${exactAmount}${isLastItem ? ' (último item - ajustado)' : ''}`);

        // Validação melhorada
        if (qtyForQBUpdate <= 0 || exactAmount <= 0 || !Number.isFinite(qtyForQBUpdate) || !Number.isFinite(exactAmount)) {
          console.warn(`⚠️ Valor inválido para o serviço: ${calc.itemName}. qty=${qtyForQBUpdate}, amount=${exactAmount}. Ignorando item.`);
          continue;
        }

        try {
          console.log(`Verificando/criando Item "${calc.itemName}" no QuickBooks para update...`);

          // Usar o id de conta de receita válido
          const { id: itemId, name: qboItemName } = await this.findOrCreateServiceItem(
            qb,
            calc.itemName,
            calc.priceParsed,     // preço base do Item
            incomeAccount.id // id de Account (Income) do QBO
          );

          if (!itemId) {
            throw new Error("ERR_ITEM_NOT_FOUND_AND_ERR_TO_CREATE");
          }

          // Monta a linha garantindo consistência Amount = UnitPrice * Qty (com Qty=1)
          processedLineItems.push({
            DetailType: "SalesItemLineDetail",
            Amount: exactAmount, // <- valor exato que fecha com UnitPrice * Qty
            Description: this.cleanDescriptionForQuickBooks(calc.service?.description || ""), // Limpar HTML e truncar
            SalesItemLineDetail: {
              ItemRef: { value: itemId, name: qboItemName },
              Qty: qtyForQBUpdate, // Sempre 1 para evitar limitação de arredondamento
              UnitPrice: unitPrice // Rate = valor total do serviço
            },
            // Armazenar valores reais para salvar no banco
            _realQuantity: calc.qty,
            _realPrice: calc.priceParsed
          });

          // Logs defensivos
          console.log(
            `[DBG Update] ${calc.itemName} -> qtyOriginal=${calc.qty} qtyQB=${qtyForQBUpdate} basePrice=${calc.priceParsed} originalAmount=${calc.originalServiceAmount} ` +
            `serviceAmountWithCoef=${calc.serviceAmountWithCoefficient} unitPrice=${unitPrice} exactAmount=${exactAmount}`
          );
        } catch (itemError: any) {
          console.error(`Erro ao processar item "${calc.itemName}" para update:`, itemError);
          // Continua para o próximo serviço
        }
      }

      console.log(`Total calculado (Update): ${totalProcessedUpdate}, Total target: ${totalTargetAmountUpdate}, Diferença: ${Math.abs(totalProcessedUpdate - totalTargetAmountUpdate)}`);
      

      // Verificar se há itens processados
      if (processedLineItems.length === 0) {
        throw new Error("No valid items to include in the invoice update. Please check the services data.");
      }

      // Calcular o total
      const calculatedTotal = processedLineItems.reduce((sum: number, item: InvoiceLineItem) => sum + item.Amount, 0);
      console.log("Total calculado para update:", calculatedTotal);

      // Preparar a data de vencimento
      const dueDateObj = dueDate ? new Date(`${dueDate}T00:00:00`) : new Date(currentInvoice.DueDate);

      // Limpar campos internos antes de enviar para QuickBooks
      const cleanLineItemsUpdate = processedLineItems.map((item: any) => {
        const { _realQuantity, _realPrice, ...cleanItem } = item;
        return cleanItem;
      });

      // Preparar dados da fatura para atualização
      const updateInvoiceData = {
        Id: quickBooksInvoiceId,
        SyncToken: currentInvoice.SyncToken,
        Line: cleanLineItemsUpdate, // Usar itens limpos sem campos internos
        CustomerRef: currentInvoice.CustomerRef, // Manter o cliente atual
        DueDate: dueDateObj.toISOString().split('T')[0],
        PrivateNote: description || currentInvoice.PrivateNote || `Updated Invoice for Project ${project.id}`,
        AllowOnlineCreditCardPayment: currentInvoice.AllowOnlineCreditCardPayment || true,
        AllowOnlineACHPayment: currentInvoice.AllowOnlineACHPayment || true,
        sparse: false // Atualização completa
      };

      // Atualizar a fatura usando SDK
      console.log("Atualizando fatura no QuickBooks usando SDK...");

      const updateResult = await new Promise((resolve, reject) => {
        qb.updateInvoice(updateInvoiceData, (err: any, data: any) => {
          if (err) {
            console.error("Erro na atualização do QuickBooks:", err);
            return reject(err);
          }
          resolve(data);
        });
      });

      // Normalize o objeto retornado
      const updated = (updateResult as any)?.Invoice ?? (updateResult as any);
      const updatedId = updated?.Id;

      // Buscar o invoice atualizado completo
      const fetchedUpdated = await new Promise((resolve, reject) => {
        qb.getInvoice(updatedId, (err: any, data: any) => {
          if (err) return reject(err);
          resolve(data);
        });
      });
      const updatedInv = (fetchedUpdated as any)?.Invoice ?? (fetchedUpdated as any);

      // Derive o status de pagamento
      function deriveQboInvoicePaymentStatus(i: any): "voided" | "paid" | "partial" | "open" {
        if (i?.TxnStatus === "Voided") return "voided";
        const total = Number(i?.TotalAmt ?? 0);
        const bal = Number(i?.Balance ?? 0);
        if (total > 0 && bal === 0) return "paid";
        if (bal > 0 && bal < total) return "partial";
        return "open";
      }

      console.log(`Invoice ${quickBooksInvoiceId} atualizado com sucesso no QuickBooks`);

      if (calledFromStripe) {
        // Quando chamado pelo StripeController, retornar apenas informações do QuickBooks
        return {
          success: true,
          message: "QuickBooks invoice updated successfully",
          quickbooksId: updatedInv.Id,
          docNumber: updatedInv.DocNumber,
          totalAmount: Number(updatedInv?.TotalAmt ?? calculatedTotal),
          status: deriveQboInvoicePaymentStatus(updatedInv)
        };
      } else {
        // Quando chamado diretamente (rota QuickBooks), atualizar no banco local
        const localInvoice = await prisma.invoice.findFirst({
          where: { idQuickbookContabio: quickBooksInvoiceId }
        });

        if (localInvoice) {
          await prisma.invoice.update({
            where: { id: localInvoice.id },
            data: {
              totalAmount: Number(updatedInv?.TotalAmt ?? calculatedTotal),
              status: deriveQboInvoicePaymentStatus(updatedInv),
              dueDate: updatedInv?.DueDate ? new Date(updatedInv.DueDate) : dueDateObj,
              description: description || localInvoice.description,
              updatedAt: new Date()
            }
          });

          // Atualizar itens da invoice
          await prisma.invoiceItem.deleteMany({
            where: { invoiceId: localInvoice.id }
          });

          await prisma.invoiceItem.createMany({
            data: processedLineItems.map((item: any) => ({
              invoiceId: localInvoice.id,
              name: item?.SalesItemLineDetail?.ItemRef?.name || "Service",
              description: item.Description, // Já foi limpo pela função cleanDescriptionForQuickBooks
              // Valores reais para exibição/cálculo local
              quantity: item._realQuantity || item?.SalesItemLineDetail?.Qty || 1,
              price: item._realPrice || item?.SalesItemLineDetail?.UnitPrice || item.Amount,
              totalAmount: item.Amount,
              // Valores ajustados enviados ao QuickBooks
              qboQuantity: item?.SalesItemLineDetail?.Qty || 1,
              qboPrice: item?.SalesItemLineDetail?.UnitPrice || item.Amount
            }))
          });
        }

        return {
          success: true,
          message: "QuickBooks invoice updated successfully",
          quickbooksId: updatedInv.Id,
          docNumber: updatedInv.DocNumber,
          totalAmount: Number(updatedInv?.TotalAmt ?? calculatedTotal),
          status: deriveQboInvoicePaymentStatus(updatedInv)
        };
      }

    } catch (error: any) {
      console.error("Erro detalhado ao atualizar fatura no QuickBooks:", error);

      // Extrair mensagem de erro do QuickBooks
      let errorMessage = error.message || error.toString();
      
      // Se for um erro do QuickBooks com estrutura Fault
      if (error.Fault && error.Fault.Error && Array.isArray(error.Fault.Error) && error.Fault.Error.length > 0) {
        const qbError = error.Fault.Error[0];
        errorMessage = `${qbError.Message}${qbError.Detail ? ` - ${qbError.Detail}` : ''} (Code: ${qbError.code || 'Unknown'})`;
        console.error("❌ Erro do QuickBooks (Update):", errorMessage);
      }

      // Verificar se é um erro de autorização usando nossa função mais robusta
      if (shouldRequireReauthorization(error)) {
        // Atualizar o status da conta para indicar que precisa de reautorização
        try {
          // Buscar company_id pelo projectId
          const projectForError = await prisma.project.findUnique({
            where: { id: projectId },
            select: { company_id: true }
          });
          
          if (projectForError?.company_id) {
            await prisma.quickBooksAccount.update({
              where: { company_id: projectForError.company_id },
              data: {
                needsReauthorization: true
              }
            });
          }
        } catch (updateError) {
          console.error("Erro ao atualizar status de reautorização:", updateError);
        }

        throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
      }

      throw new Error(`QuickBooks API Error: ${errorMessage}`);
    }
  }

  async createInvoice(req: Request, res: Response) {
    const { projectId } = req.params;
    const { description, type_invoicebase, dueDate, userId, coefficientPerfentage, services, type_value, totalAmount, multi_emails, date_creation } = req.body;

    try {
      console.log(" Iniciando criação de invoice QuickBooks via rota pública...");
      console.log("ProjectId:", projectId);
      console.log("UserId:", userId);
      console.log("TotalAmount:", totalAmount);

      // Validações básicas
      if (!projectId || !userId) {
        return res.status(400).json({
          error: "Missing required fields",
          message: "projectId and userId are required"
        });
      }

      // Buscar o projeto para obter company_id e fazer validações
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          client: true,
          company: true,
        },
      });

      if (!project) {
        return res.status(404).json({
          error: "Project not found",
          message: "The specified project does not exist"
        });
      }

      if (!project.company_id) {
        return res.status(400).json({
          error: "Company not found",
          message: "Project does not have an associated company"
        });
      }

      // Verificar se o QuickBooks está conectado
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { company_id: project.company_id },
      });

      if (!quickBooksAccount) {
        return res.status(400).json({
          error: "QuickBooks not connected",
          message: "Please connect your QuickBooks account first",
          action: "connect_quickbooks"
        });
      }

      // Calcular o total amount se não fornecido
      let calculatedTotalAmount = totalAmount;
      if (!calculatedTotalAmount && services && Array.isArray(services)) {
        calculatedTotalAmount = services.reduce((sum: number, service: any) => {
          const total = service.total || (service.quantity * service.price);
          return sum + total;
        }, 0);
      }

      console.log(" Delegando criação para createInvoiceInternal...");

      // Chamar createInvoiceInternal que vai criar o invoice e sincronizar com QuickBooks
      const result = await this.createInvoiceInternal({
        projectId,
        description,
        type_invoicebase,
        dueDate,
        userId,
        coefficientPerfentage,
        services,
        type_value,
        totalAmountTarget: calculatedTotalAmount,
        calledFromStripe: false, // Criar como invoice completo (banco + QB)
        multi_emails,
        date_creation
      });

      if (result?.invoice) {
        console.log(" Invoice criado com sucesso:", result.invoice.id);

        return res.status(201).json({
          success: true,
          message: "QuickBooks invoice created successfully",
          invoice: result.invoice,
          databaseInvoice: result.invoice, // Para compatibilidade com frontend
          quickBooks: {
            success: true,
            result: result
          }
        });
      } else {
        // Caso não retorne invoice (não deveria acontecer)
        throw new Error("createInvoiceInternal did not return an invoice");
      }

    } catch (error: any) {
      console.error(" Erro detalhado ao criar fatura:", error);

      // Verificar se é erro de autorização
      if (error.message && (
        error.message.includes("401") || 
        error.message.includes("403") || 
        error.message.includes("Insufficient permissions") ||
        error.message.includes("invalid_grant") ||
        error.message.includes("token")
      )) {
        return res.status(403).json({
          error: "Insufficient permissions",
          message: "You need to reconnect your QuickBooks account with additional permissions",
          action: "reauthorize"
        });
      }

      return res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to create invoice",
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

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          client: true,
          company: true,
        },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      if (!project.client) {
        throw new Error("Client not found for this project");
      }

      if (!project.company || !project.company_id) {
        throw new Error("Company not found for this project");
      }

      // Atualizar status das faturas do QuickBooks
      const updatedInvoices = await Promise.all(
        invoices.map(async (invoice) => {
          try {
            if (!invoice.externalInvoiceId) {
              return invoice;
            }

            // Buscar o usuário com conta QuickBooks
            const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
              where: { company_id: project.company_id }
            });

            if (!quickBooksAccount || !project.company_id) {
              return { ...invoice, error: "QuickBooks account not found or missing company ID" };
            }

            // Obter cliente QuickBooks configurado
            if (!invoice.user_id) {
              return { ...invoice, error: "User ID is missing" };
            }
            const { qb } = await getQbClientWithAccountOrThrow(invoice.user_id, project.company_id);

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
      console.log(` Iniciando envio de invoice QuickBooks. invoiceId: ${invoiceId}, userId: ${userId}`);

      // Buscar o invoice pelo ID local (pode ser UUID ou número sequencial)
      const invoice = await prisma.invoice.findFirst({
        where: { 
          OR: [
            { id: invoiceId },
            { externalInvoiceId: invoiceId }
          ]
        },
        include: {
          project: {
            include: {
              client: true,
              company: true,
              workContext: true // Incluir work context do projeto
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      console.log(` Invoice encontrado: ${invoice.id}, QB ID: ${invoice.idQuickbookContabio}`);

      if (invoice.invoiceType !== "quickbooks") {
        return res.status(400).json({ error: "Not a QuickBooks invoice" });
      }

      if (!invoice.idQuickbookContabio) {
        return res.status(400).json({ 
          error: "QuickBooks invoice ID missing",
          message: "This invoice has not been synced with QuickBooks yet" 
        });
      }

      if (!invoice.project) {
        return res.status(400).json({ error: "Project not found for this invoice" });
      }

      if (!invoice.project?.company_id) {
        return res.status(400).json({ error: "Company not found for this project" });
      }

      // Obter email do destinatário: prioridade para work context, fallback para cliente
      const workContext = invoice.project?.workContext;
      const client = invoice.project?.client;
      
      const recipientEmail = workContext?.Email || client?.email;
      const recipientName = workContext?.Name || client?.name || 'Client';
      
      if (!recipientEmail) {
        return res.status(400).json({ 
          error: "Recipient email not found",
          message: "Neither work context nor client has a valid email address" 
        });
      }

      const emailSource = workContext?.Email ? "work context" : "client";
      console.log(` Email do destinatário obtido do ${emailSource}: ${recipientEmail} (${recipientName})`);

      // Buscar conta QuickBooks
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { company_id: invoice.project.company_id }
      });

      if (!quickBooksAccount) {
        return res.status(404).json({ 
          error: "QuickBooks account not found",
          message: "Please connect your QuickBooks account first" 
        });
      }

      // Verificar se precisa de reautorização
      if (quickBooksAccount.needsReauthorization) {
        return res.status(403).json({
          error: "Reauthorization required",
          message: "You need to reconnect your QuickBooks account",
          action: "reauthorize"
        });
      }

      // Obter cliente QuickBooks configurado
      const { qb } = await getQbClientWithAccountOrThrow(userId, invoice.project.company_id);

      console.log(` Enviando invoice QB ID ${invoice.idQuickbookContabio} para ${recipientEmail}`);

      // Enviar a fatura pelo QuickBooks usando o ID real do QuickBooks
      await new Promise((resolve, reject) => {
        qb.sendInvoicePdf(
          invoice.idQuickbookContabio, 
          recipientEmail, 
          (err: any, data: any) => {
            if (err) {
              console.error("Erro ao enviar invoice pelo QuickBooks SDK:", err);
              return reject(err);
            }
            console.log("✅ Invoice enviado com sucesso pelo QuickBooks");
            resolve(data);
          }
        );
      });

      // Registrar o envio no histórico
      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoice.id,
          recipient: recipientEmail,
          user_id: userId
        }
      });

      // Registrar na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `Invoice sent to ${recipientName} (${recipientEmail}) via ${emailSource}`,
          invoiceId: invoice.id
        }
      });

      console.log(` Invoice enviado com sucesso para ${recipientName} (${recipientEmail})`);

      return res.status(200).json({
        success: true,
        message: "Invoice sent successfully",
        recipient: recipientEmail,
        recipientName: recipientName,
        emailSource: emailSource
      });
    } catch (error: any) {
      console.error(" Erro ao enviar QuickBooks invoice:", error);

      // Verificar se é erro de autorização
      if (error.message && (
        error.message.includes("401") || 
        error.message.includes("403") || 
        error.message.includes("Insufficient permissions") ||
        error.message.includes("invalid_grant") ||
        error.message.includes("token")
      )) {
        return res.status(403).json({
          error: "Insufficient permissions",
          message: "You need to reconnect your QuickBooks account",
          action: "reauthorize"
        });
      }

      return res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to send invoice",
        details: error.toString()
      });
    }
  }

  // Método interno para cancelamento de invoice sem req/res
  async cancelInvoiceInternal(params: {
    quickBooksInvoiceId: string;
    userId: string;
    companyId?: string; // Adicionar companyId como parâmetro opcional
    calledFromStripe?: boolean; // Parâmetro para identificar origem
  }) {
    const { quickBooksInvoiceId, userId, companyId, calledFromStripe = false } = params;

    try {
      // Se não foi fornecido companyId, busca pela userId (fallback)
         
      if (!companyId) {
        throw new Error("Company ID is required for QuickBooks operations");
      }

      // Obter cliente QuickBooks configurado com método robusto
      const { qb, account } = await getQbClientWithAccountOrThrow(userId, companyId);

      // Testar conexão com uma operação simples
      try {
        await callWithRetry(
          () => new Promise((resolve, reject) => {
            qb.getCompanyInfo(account.realmId, (err: any, data: any) => {
              if (err) {
                console.error("Erro ao buscar informações da empresa:", err);
                reject(err);
              } else {
                console.log("Informações da empresa obtidas com sucesso");
                resolve(data);
              }
            });
          }),
          2, // 2 tentativas adicionais
          200 // 200ms de delay inicial
        );
      } catch (companyError: any) {
        console.error("Erro ao buscar informações da empresa:", companyError);
        
        // Só marcar needsReauthorization se for realmente um erro de autorização
        if (shouldRequireReauthorization(companyError)) {
          await prisma.quickBooksAccount.update({
            where: { company_id: companyId },
            data: { needsReauthorization: true }
          });
          throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
        }
        
        // Para outros erros (timeout, 500, etc.), não marcar como reauth
        throw new Error(`QuickBooks connection error: ${companyError.message || 'Unknown error'}`);
      }

      // Primeiro, buscar a fatura atual para obter o SyncToken e verificar status
      console.log(`Buscando invoice ${quickBooksInvoiceId} no QuickBooks para cancelamento...`);
      const currentInvoiceData = await new Promise((resolve, reject) => {
        qb.getInvoice(quickBooksInvoiceId, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao buscar fatura para cancelamento:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      const currentInvoice = (currentInvoiceData as any)?.Invoice || (currentInvoiceData as any);
      
      if (!currentInvoice || !currentInvoice.Id) {
        throw new Error(`Invoice ${quickBooksInvoiceId} not found in QuickBooks`);
      }

      console.log(`Invoice encontrado para cancelamento. SyncToken: ${currentInvoice.SyncToken}, Status: ${currentInvoice.TxnStatus}`);

      // Verificar se a fatura já está cancelada
      if (currentInvoice.TxnStatus === "Voided") {
        console.log("Invoice já está cancelado no QuickBooks");
        return {
          success: true,
          message: "Invoice was already voided in QuickBooks",
          quickbooksId: currentInvoice.Id,
          status: "voided",
          alreadyVoided: true
        };
      }

      // Verificar se está paga (Balance = 0 e TotalAmt > 0)
      const totalAmt = Number(currentInvoice.TotalAmt || 0);
      const balance = Number(currentInvoice.Balance || 0);
      if (totalAmt > 0 && balance === 0) {
        throw new Error("Cannot void a paid invoice. You may need to create a credit memo instead.");
      }

      // Cancelar a fatura no QuickBooks (marcar como void) usando SDK
      const voidInvoiceData = {
        SyncToken: currentInvoice.SyncToken,
        Id: quickBooksInvoiceId,
        sparse: true,
        PrivateNote: calledFromStripe ? "Voided by Stripe integration" : "Voided by system"
      };

      console.log("Cancelando fatura no QuickBooks usando SDK...");
      const voidResult = await new Promise((resolve, reject) => {
        qb.voidInvoice(voidInvoiceData, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao cancelar fatura:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      // Normalize o objeto retornado
      const voided = (voidResult as any)?.Invoice ?? (voidResult as any);
      
      console.log(`Invoice ${quickBooksInvoiceId} cancelado com sucesso no QuickBooks`);

      if (calledFromStripe) {
        // Quando chamado pelo StripeController, retornar apenas informações do QuickBooks
        return {
          success: true,
          message: "QuickBooks invoice voided successfully",
          quickbooksId: voided.Id,
          status: "voided"
        };
      } else {
        // Quando chamado diretamente (rota QuickBooks), atualizar no banco local
        const localInvoice = await prisma.invoice.findFirst({
          where: { 
            OR: [
              { externalInvoiceId: quickBooksInvoiceId },
              { idQuickbookContabio: quickBooksInvoiceId }
            ]
          }
        });

        if (localInvoice) {
          await prisma.invoice.update({
            where: { id: localInvoice.id },
            data: { 
              status: "void",
              updatedAt: new Date()
            }
          });
        }

        return {
          success: true,
          message: "QuickBooks invoice voided successfully",
          quickbooksId: voided.Id,
          status: "voided"
        };
      }

    } catch (error: any) {
      console.error("Erro detalhado ao cancelar fatura no QuickBooks:", error);

      // Verificar se é um erro de autorização usando nossa função mais robusta
      if (shouldRequireReauthorization(error)) {
        // Atualizar o status da conta para indicar que precisa de reautorização
        try {
          await prisma.quickBooksAccount.update({
            where: { company_id: companyId },
            data: {
              needsReauthorization: true
            }
          });
        } catch (updateError) {
          console.error("Erro ao atualizar status de reautorização:", updateError);
        }

        throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
      }

      // Verificar erros específicos do QuickBooks
      if (error.message && error.message.includes("paid invoice")) {
        throw new Error("Cannot void a paid invoice. You may need to create a credit memo instead.");
      }

      if (error.message && error.message.includes("already voided")) {
        throw new Error("Invoice is already voided in QuickBooks");
      }

      throw new Error(`QuickBooks API Error: ${error.message}`);
    }
  }

  /**
   * Deleta um invoice no QuickBooks (remoção permanente)
   * @param quickBooksInvoiceId - ID do invoice no QuickBooks
   * @param userId - ID do usuário
   * @param companyId - ID da empresa
   * @param calledFromStripe - Se foi chamado pelo StripeController
   */
  async deleteInvoiceInternal({
    quickBooksInvoiceId,
    userId,
    companyId,
    calledFromStripe = false
  }: {
    quickBooksInvoiceId: string;
    userId: string;
    companyId: string;
    calledFromStripe?: boolean;
  }) {
    try {
      console.log(`Iniciando deleção do invoice ${quickBooksInvoiceId} no QuickBooks...`);

      // Obter cliente QuickBooks
      const { qb } = await getQbClientWithAccountOrThrow(userId, companyId );

      // Buscar a fatura atual para obter o SyncToken
      console.log(`Buscando fatura ${quickBooksInvoiceId} no QuickBooks...`);
      const currentInvoiceData = await new Promise((resolve, reject) => {
        qb.getInvoice(quickBooksInvoiceId, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao buscar fatura:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      const currentInvoice = (currentInvoiceData as any)?.Invoice || (currentInvoiceData as any);
      
      if (!currentInvoice || !currentInvoice.Id) {
        throw new Error(`Invoice ${quickBooksInvoiceId} not found in QuickBooks`);
      }

      console.log(`Invoice encontrado para deleção. SyncToken: ${currentInvoice.SyncToken}`);

      // Verificar se está paga (Balance = 0 e TotalAmt > 0)
      const totalAmt = Number(currentInvoice.TotalAmt || 0);
      const balance = Number(currentInvoice.Balance || 0);
      if (totalAmt > 0 && balance === 0) {
        throw new Error("Cannot delete a paid invoice. You may need to create a credit memo instead.");
      }

      // Deletar a fatura no QuickBooks usando deleteInvoice do SDK
      console.log("Deletando fatura no QuickBooks usando SDK...");
      const deleteResult = await new Promise((resolve, reject) => {
        qb.deleteInvoice(quickBooksInvoiceId, currentInvoice.SyncToken, (err: any, data: any) => {
          if (err) {
            console.error("Erro ao deletar fatura:", err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      // Normalize o objeto retornado
      const deleted = (deleteResult as any)?.Invoice ?? (deleteResult as any);
      
      console.log(`Invoice ${quickBooksInvoiceId} deletado com sucesso no QuickBooks`);

      if (calledFromStripe) {
        // Quando chamado pelo StripeController, retornar apenas informações do QuickBooks
        return {
          success: true,
          message: "QuickBooks invoice deleted successfully",
          quickbooksId: deleted?.Id || quickBooksInvoiceId,
          status: "deleted"
        };
      } else {
        // Quando chamado diretamente (rota QuickBooks), atualizar no banco local
        const localInvoice = await prisma.invoice.findFirst({
          where: { 
            OR: [
              { externalInvoiceId: quickBooksInvoiceId },
              { idQuickbookContabio: quickBooksInvoiceId }
            ]
          }
        });

        if (localInvoice) {
          await prisma.invoice.update({
            where: { id: localInvoice.id },
            data: { 
              idQuickbookContabio: null,
              docNumberQuickBooksContabio: null,
              updatedAt: new Date()
            }
          });
        }

        return {
          success: true,
          message: "QuickBooks invoice deleted successfully",
          quickbooksId: deleted?.Id || quickBooksInvoiceId,
          status: "deleted"
        };
      }

    } catch (error: any) {
      console.error("Erro detalhado ao deletar fatura no QuickBooks:", error);

      // Verificar se é um erro de autorização usando nossa função mais robusta
      if (shouldRequireReauthorization(error)) {
        // Atualizar o status da conta para indicar que precisa de reautorização
        try {
          await prisma.quickBooksAccount.update({
            where: { company_id: companyId },
            data: {
              needsReauthorization: true
            }
          });
        } catch (updateError) {
          console.error("Erro ao atualizar status de reautorização:", updateError);
        }

        throw new Error("Insufficient permissions - You need to reconnect your QuickBooks account with additional permissions");
      }

      // Verificar erros específicos do QuickBooks
      if (error.message && error.message.includes("paid invoice")) {
        throw new Error("Cannot delete a paid invoice. You may need to create a credit memo instead.");
      }

      if (error.message && error.message.includes("not found")) {
        throw new Error("Invoice not found in QuickBooks (may have been already deleted)");
      }

      throw new Error(`QuickBooks API Error: ${error.message}`);
    }
  }

  async cancelInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId } = req.body;

    try {
      console.log(` Iniciando cancelamento de invoice QuickBooks. invoiceId: ${invoiceId}, userId: ${userId}`);

      // Buscar o invoice pelo ID local (pode ser UUID ou número sequencial)
      const invoice = await prisma.invoice.findFirst({
        where: { 
          OR: [
            { id: invoiceId },
            { externalInvoiceId: invoiceId }
          ]
        },
        include: {
          project: {
            include: {
              company: true
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      console.log(` Invoice encontrado: ${invoice.id}, QB ID: ${invoice.idQuickbookContabio}`);

      if (invoice.invoiceType !== "quickbooks") {
        return res.status(400).json({ error: "Not a QuickBooks invoice" });
      }

      if (!invoice.idQuickbookContabio) {
        return res.status(400).json({ 
          error: "QuickBooks invoice ID missing",
          message: "This invoice has not been synced with QuickBooks yet" 
        });
      }

      if (!invoice.project?.company_id) {
        return res.status(400).json({ error: "Company not found for this invoice" });
      }

      // Verificar se o invoice já está cancelado
      if (invoice.status === "void") {
        return res.status(200).json({
          success: true,
          message: "Invoice was already voided",
          alreadyVoided: true
        });
      }

      // Verificar se o invoice está pago
      if (invoice.status === "paid") {
        return res.status(400).json({
          error: "Cannot void paid invoice",
          message: "Cannot void a paid invoice. You may need to create a credit memo instead."
        });
      }

      console.log(` Cancelando invoice QB ID ${invoice.idQuickbookContabio}...`);

      const result = await this.cancelInvoiceInternal({
        quickBooksInvoiceId: invoice.idQuickbookContabio,
        userId: userId,
        companyId: invoice.project.company_id,
        calledFromStripe: false
      });

      console.log(` Invoice cancelado com sucesso: ${invoice.id}`);

      return res.status(200).json(result);
    } catch (error: any) {
      console.error(" Erro ao cancelar QuickBooks invoice:", error);

      // Verificar se é um erro de autorização
      if (error.message && (
        error.message.includes("401") || 
        error.message.includes("403") || 
        error.message.includes("Insufficient permissions") ||
        error.message.includes("invalid_grant") ||
        error.message.includes("token")
      )) {
        return res.status(403).json({
          error: "Insufficient permissions",
          message: "You need to reconnect your QuickBooks account with additional permissions",
          action: "reauthorize"
        });
      }

      // Verificar erros específicos do QuickBooks
      if (error.message && error.message.includes("paid invoice")) {
        return res.status(400).json({
          error: "Cannot void paid invoice",
          message: "Cannot void a paid invoice. You may need to create a credit memo instead."
        });
      }

      if (error.message && error.message.includes("already voided")) {
        return res.status(200).json({
          success: true,
          message: "Invoice was already voided in QuickBooks",
          alreadyVoided: true
        });
      }

      return res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to void invoice",
        details: error.toString()
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

    // Extrair o item da resposta (pode estar em created.Item ou diretamente em created)
    const item = created?.Item || created;
    
    if (!item || !item.Id) {
      console.error('Item criado mas sem ID válido:', created);
      throw new Error(`Failed to create or retrieve item ID for: ${name}`);
    }

    return { id: item.Id, name: item.Name || name };
  }

  async round2(n: number) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  async parseMoney(input: any): Promise<number> {
    // Se já é um número válido, retornar
    if (typeof input === 'number' && Number.isFinite(input) && input >= 0) return input;

    // Se é null, undefined ou string vazia, retornar 0
    if (input == null) return 0;

    let s = String(input).trim();
    if (!s || s === 'undefined' || s === 'null') return 0;

    // remove símbolos de moeda e espaços, mantém apenas números, pontos e vírgulas
    s = s.replace(/[^\d.,-]/g, '');
    
    // Se ficou vazio após limpeza, retornar 0
    if (!s) return 0;

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
    return Number.isFinite(n) && n >= 0 ? n : 0;
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

  // Função para limpar HTML e truncar texto para QuickBooks (limite: 4.000 caracteres)
  cleanDescriptionForQuickBooks(htmlText: string): string {
    if (!htmlText || typeof htmlText !== 'string') {
      return "";
    }

    // Remover tags HTML mantendo o conteúdo
    let cleanText = htmlText
      // Converter quebras de linha HTML em quebras de linha normais
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      // Remover todas as outras tags HTML
      .replace(/<[^>]*>/g, '')
      // Decodificar entidades HTML comuns
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Limpar espaços extras e quebras de linha múltiplas
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Truncar para o limite do QuickBooks com margem de segurança (3.800 caracteres)
    const maxLength = 3800;
    if (cleanText.length > maxLength) {
      cleanText = cleanText.substring(0, maxLength - 3) + "...";
    }

    return cleanText;
  }

  // Função para truncar nomes de serviços para QuickBooks (limite comum: 100 caracteres)
  cleanServiceNameForQuickBooks(serviceName: string): string {
    if (!serviceName || typeof serviceName !== 'string') {
      return "Service";
    }

    // Limpar o nome removendo caracteres especiais problemáticos
    let cleanName = serviceName
      .trim()
      // Remover caracteres que podem causar problemas na API
      .replace(/[<>]/g, '')
      .replace(/&/g, 'and')
      .replace(/"/g, "'")
      // Limpar espaços extras
      .replace(/\s+/g, ' ')
      .trim();

    // Truncar para o limite do QuickBooks com margem de segurança (95 caracteres)
    const maxLength = 95;
    if (cleanName.length > maxLength) {
      cleanName = cleanName.substring(0, maxLength - 3) + "...";
    }

    // Se ficou vazio após limpeza, usar fallback
    if (!cleanName || cleanName.length === 0) {
      cleanName = "Service";
    }

    return cleanName;
  }

  

  /**
   * Função para obter DocNumber
   * 
   * @param qb - Cliente QuickBooks
   * @param invoiceId - ID do invoice
   * @param fallbackInvoice - Invoice de fallback
   * @returns Invoice com DocNumber ou null se não disponível
   */
  async fetchInvoiceWithRetryForDocNumber(qb: any, invoiceId: string, fallbackInvoice: any): Promise<any> {
    // Verificar se já temos DocNumber no fallback
    if (fallbackInvoice?.DocNumber) {
      console.log(`DocNumber disponível: ${fallbackInvoice.DocNumber}`);
      return fallbackInvoice;
    }
    
    console.log(`DocNumber não disponível para invoice ${invoiceId}.`);
    console.log(`Isso é esperado quando a empresa tem "Custom transaction numbers" habilitado no QuickBooks.`);
    
    // Retornar o invoice sem DocNumber (será null)
    return fallbackInvoice;
  }

} 