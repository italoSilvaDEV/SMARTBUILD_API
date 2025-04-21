import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import axios from "axios";
import { refreshAccessToken } from "./QuickBooksTokenService";
import { oauthClient } from "./QuickBooksOAuthClient";

// Defina a interface para os itens da fatura
interface InvoiceLineItem {
  Amount: number; // ou o tipo correto que você espera
  // Adicione outros campos que você espera que o item tenha
}

export class QuickBooksInvoiceController {
  async createInvoice(req: Request, res: Response) {
    const { projectId } = req.params;
    const { description, dueDate, userId, coefficientPerfentage, services, type_value } = req.body;

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

      // Verificar se o usuário tem uma conta QuickBooks
      console.log("Verificando conta QuickBooks para o usuário:", userId);
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId },
      });

      if (!quickBooksAccount) {
        console.log("Usuário não conectado ao QuickBooks");
        return res.status(400).json({ error: "User not connected to QuickBooks" });
      }

      console.log("Verificando validade do token. Expira em:", quickBooksAccount.expiresAt);
      console.log("Data atual:", new Date());

      // Verificar se o token está expirado e atualizar se necessário
      let accessToken = quickBooksAccount.accessToken;
      if (new Date() > quickBooksAccount.expiresAt) {
        console.log("Token expirado, tentando refresh...");
        const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, userId);
        console.log("Resultado do refresh:", refreshResult);
        if (!refreshResult.success) {
          return res.status(401).json({ error: "Failed to refresh QuickBooks token", details: refreshResult.error });
        }
        accessToken = refreshResult.accessToken;
        console.log("Token atualizado com sucesso");
      }

      // Alternativa: não tente inicializar o cliente OAuth, apenas use o token diretamente
      // nas requisições HTTP com axios
      console.log("Usando token diretamente nas requisições HTTP");

      // Testar primeiro com uma operação simples
      try {
        const companyInfoResponse = await axios.get(
          `https://sandbox-quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/companyinfo/${quickBooksAccount.realmId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          }
        );
        console.log("Informações da empresa obtidas com sucesso");
      } catch (companyError: any) {
        console.error("Erro ao buscar informações da empresa:", companyError.response?.data || companyError.message);
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

      for (const service of services) {
        const itemName = service.name;
        const quantity = Number(service.quantity) || 0;
        const price = Number(service.price) || 0;
        const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 1;
        
        // Usar o total fornecido ou calcular se não estiver disponível
        const serviceAmount = service.total || (quantity * price);
        const adjustedAmount = serviceAmount * validCoefficient;
        
        if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
          console.warn(`⚠️ Valor inválido para o serviço: ${service.name}. O item será ignorado.`);
          continue;
        }
        
        try {
          // Verificar se o item existe no QuickBooks
          console.log(`Verificando se o item "${itemName}" existe no QuickBooks...`);
          const itemQuery = encodeURIComponent(`SELECT * FROM Item WHERE Name = '${itemName}'`);
          const itemResponse = await axios.get(
            `https://quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/query?query=${itemQuery}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
              }
            }
          );
          
          let itemId;
          if (itemResponse.data.QueryResponse.Item && itemResponse.data.QueryResponse.Item.length > 0) {
            // Item encontrado
            itemId = itemResponse.data.QueryResponse.Item[0].Id;
            console.log(`Item "${itemName}" encontrado com ID: ${itemId}`);
          } else {
            // Item não encontrado, criar um novo
            console.log(`Item "${itemName}" não encontrado. Criando item...`);
            const itemData = {
              Name: itemName,
              IncomeAccountRef: {
                value: "1"  // Usar o ID 1 que geralmente é o item de serviços padrão
              },
              Type: "Service",
              UnitPrice: price
            };
            
            const createItemResponse = await axios.post(
              `https://quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/item`,
              itemData,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                }
              }
            );
            
            itemId = createItemResponse.data.Item.Id;
            console.log(`Item "${itemName}" criado com ID: ${itemId}`);
          }
          
          // Adicionar o item à lista de itens da fatura
          processedLineItems.push({
            DetailType: "SalesItemLineDetail",
            Amount: adjustedAmount,
            Description: service.description || "",
            SalesItemLineDetail: {
              ItemRef: {
                value: itemId
              },
              Qty: quantity,
              UnitPrice: price
            }
          });
          
        } catch (itemError: any) {
          console.error(`Erro ao processar item "${itemName}":`, itemError.response?.data || itemError.message);
          // Continue para o próximo item em vez de falhar completamente
        }
      }

      // Calcular o total
      const totalAmount = processedLineItems.reduce((sum: number, item: InvoiceLineItem) => sum + item.Amount, 0);
      console.log("Total calculado:", totalAmount);

      // Preparar a data de vencimento
      const dueDateObj = dueDate ? new Date(dueDate) : new Date();
      dueDateObj.setDate(dueDateObj.getDate() + 30); // 30 dias por padrão se não especificado

      // Antes de criar a fatura, verifique se o cliente existe no QuickBooks
      try {
        console.log("Verificando se o cliente existe no QuickBooks...");
        const clientQuery = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${project.client.name}'`);
        const clientResponse = await axios.get(
          `https://sandbox-quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/query?query=${clientQuery}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          }
        );
        
        let clientId;
        if (clientResponse.data.QueryResponse.Customer && clientResponse.data.QueryResponse.Customer.length > 0) {
          // Cliente encontrado
          clientId = clientResponse.data.QueryResponse.Customer[0].Id;
          console.log(`Cliente "${project.client.name}" encontrado com ID: ${clientId}`);
        } else {
          // Cliente não encontrado, criar um novo
          console.log(`Cliente "${project.client.name}" não encontrado. Criando cliente...`);
          const clientData = {
            DisplayName: project.client.name,
            CompanyName: project.client.name,
            PrimaryEmailAddr: {
              Address: project.client.email || "cliente@exemplo.com"
            }
          };
          
          const createClientResponse = await axios.post(
            `https://sandbox-quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/customer`,
            clientData,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );
          
          clientId = createClientResponse.data.Customer.Id;
          console.log(`Cliente "${project.client.name}" criado com ID: ${clientId}`);
        }
        
        // Usar o clientId do QuickBooks
        const simpleInvoiceData = {
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
            value: clientId  // Usar o ID do cliente do QuickBooks
          }
        };
        
        // Criar a fatura com dados mínimos
        console.log("Enviando requisição simplificada para o QuickBooks...");
        const response = await axios.post(
          `https://sandbox-quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/invoice?minorversion=75`,
          simpleInvoiceData,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );
        
        // Mover a criação da fatura no banco de dados para dentro deste bloco
        const newInvoice = await prisma.invoice.create({
          data: {
            stripeInvoiceId: `qb-${Date.now()}`,
            externalInvoiceId: response.data.Invoice.Id,
            invoiceType: "quickbooks",
            externalDocNumber: response.data.Invoice.DocNumber,
            status: response.data.Invoice.status || "draft",
            totalAmount: totalAmount,
            dueDate: dueDateObj,
            description: description || `Invoice for Project ${project.id}`,
            projectId: project.id,
            companyId: project.company_id,
            user_id: userId,
            percentageCoefficient: coefficientPerfentage || 1,
            type_value: type_value,
            // Criar os itens da fatura
            InvoiceItems: {
              create: processedLineItems.map((item: any) => ({
                name: item.SalesItemLineDetail?.ItemName || "Service",
                description: item.Description,
                quantity: item.SalesItemLineDetail?.Qty || 1,
                price: item.SalesItemLineDetail?.UnitPrice || item.Amount,
                totalAmount: item.Amount
              }))
            }
          },
          include: {
            InvoiceItems: true
          }
        });

        return res.status(201).json({
          message: "QuickBooks invoice created successfully",
          invoice: newInvoice
        });
        
      } catch (clientError: any) {
        console.error("Erro ao processar cliente:", clientError.response?.data || clientError.message);
        return res.status(400).json({
          error: "Error processing client in QuickBooks",
          details: clientError.response?.data || clientError.message
        });
      }
    } catch (error: any) {
      console.error("Erro detalhado ao criar fatura no QuickBooks:", error);
      
      if (error.response) {
        // A requisição foi feita e o servidor respondeu com um status fora do intervalo 2xx
        console.error("Dados da resposta de erro:", error.response.data);
        console.error("Status do erro:", error.response.status);
        console.error("Headers da resposta:", error.response.headers);
        
        if (error.response.status === 403) {
          console.error("Detalhes do erro 403:", error.response.data.fault?.error);
          // Atualizar o status da conta para indicar que precisa de reautorização
          await prisma.quickBooksAccount.update({
            where: { user_id: userId },
            data: { 
              // Adicione um campo no schema para indicar que precisa de reautorização
              needsReauthorization: true 
            }
          });
          
          return res.status(403).json({ 
            error: "Insufficient permissions", 
            message: "You need to reconnect your QuickBooks account with additional permissions",
            action: "reauthorize",
            // authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}`
          });
        }
        
        return res.status(error.response.status).json({
          error: "QuickBooks API Error",
          details: error.response.data,
          message: error.message
        });
      } else if (error.request) {
        // A requisição foi feita mas nenhuma resposta foi recebida
        console.error("Nenhuma resposta recebida:", error.request);
        
        return res.status(500).json({
          error: "No response from QuickBooks API",
          message: "The request was made but no response was received"
        });
      } else {
        // Algo aconteceu na configuração da requisição que acionou um erro
        console.error("Erro na configuração da requisição:", error.message);
        
        return res.status(500).json({
          error: "Request setup error",
          message: error.message
        });
      }
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

            // Verificar se o token está expirado e atualizar se necessário
            let accessToken = quickBooksAccount.accessToken;
            if (new Date() > quickBooksAccount.expiresAt) {
              if (!invoice.user_id) {
                return { ...invoice, error: "User ID is missing" };
              }
              const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, invoice.user_id);
              if (!refreshResult.success) {
                return { ...invoice, error: "Failed to refresh token" };
              }
              accessToken = refreshResult.accessToken;
            }

            // Buscar status atualizado da fatura no QuickBooks
            const response = await axios.get(
              `https://quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/invoice/${invoice.externalInvoiceId}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json'
                }
              }
            );

            const status = response.data.Invoice.status || invoice.status;

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
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
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

      // Buscar a conta QuickBooks do usuário
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      if (!quickBooksAccount) {
        return res.status(400).json({ error: "QuickBooks account not found" });
      }

      // Verificar se o token está expirado e atualizar se necessário
      let accessToken = quickBooksAccount.accessToken;
      if (new Date() > quickBooksAccount.expiresAt) {
        if (!invoice.user_id) {
          return { ...invoice, error: "User ID is missing" };
        }
        const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, invoice.user_id);
        if (!refreshResult.success) {
          return { ...invoice, error: "Failed to refresh token" };
        }
        accessToken = refreshResult.accessToken;
      }

      // Enviar a fatura pelo QuickBooks
      const sendInvoiceData = {
        sendTo: invoice.project.client.email,
        email: {
          subject: `Invoice ${invoice.externalDocNumber} from ${invoice.project.client.name}`,
          message: `Please find attached invoice ${invoice.externalDocNumber} for your recent services.`
        }
      };

      await axios.post(
        `https://quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/invoice/${invoice.externalInvoiceId}/send`,
        sendInvoiceData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

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
        details: error.response?.data || error.message
      });
    }
  }

  async cancelInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId } = req.body;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
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

      // Buscar a conta QuickBooks do usuário
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      if (!quickBooksAccount) {
        return res.status(400).json({ error: "QuickBooks account not found" });
      }

      // Verificar se o token está expirado e atualizar se necessário
      let accessToken = quickBooksAccount.accessToken;
      if (new Date() > quickBooksAccount.expiresAt) {
        if (!invoice.user_id) {
          return { ...invoice, error: "User ID is missing" };
        }
        const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, invoice.user_id);
        if (!refreshResult.success) {
          return { ...invoice, error: "Failed to refresh token" };
        }
        accessToken = refreshResult.accessToken;
      }

      // Cancelar a fatura no QuickBooks (marcar como void)
      const voidInvoiceData = {
        SyncToken: "0", // Pode precisar buscar o SyncToken atual
        Id: invoice.externalInvoiceId,
        sparse: true,
        PrivateNote: "Voided by system"
      };

      await axios.post(
        `https://quickbooks.api.intuit.com/v3/company/${quickBooksAccount.realmId}/invoice?operation=void`,
        voidInvoiceData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

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
        details: error.response?.data || error.message
      });
    }
  }
} 