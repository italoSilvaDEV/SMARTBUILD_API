import cron from "node-cron";
import { prisma } from "../utils/prisma";
import { getPresignedUrl } from "../utils/S3/getPresignedUrl";
import { sendEmail } from "../utils/sendEmail";

/**
 * Serviço de cron para envio automático de emails de invoices pendentes
 * Executa diariamente às 9h da manhã, verificando todos os invoices que precisam receber lembretes
 */

/**
 * Função auxiliar para calcular a diferença em dias entre duas datas
 * Usa UTC para garantir consistência independente do timezone do servidor
 */
function getDaysDifference(date1: Date, date2: Date): number {
  // Usar UTC para extrair apenas ano, mês e dia (ignorar horas e timezone)
  const d1 = new Date(Date.UTC(
    date1.getUTCFullYear(),
    date1.getUTCMonth(),
    date1.getUTCDate()
  ));
  
  const d2 = new Date(Date.UTC(
    date2.getUTCFullYear(),
    date2.getUTCMonth(),
    date2.getUTCDate()
  ));
  
  // Calcular diferença em milissegundos e converter para dias
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Função auxiliar para formatar o corpo do email baseado no tipo de lembrete
 */
function getEmailBody(
  emailType: string,
  clientName: string,
  invoiceAmount: string,
  invoiceCode: string,
  companyName: string,
  dueDate: Date,
  invoiceType: string
): { message: string; subject: string } {
  // Criar data de hoje em UTC
  const now = new Date();
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  
  // Garantir que dueDate também está em UTC
  const dueDateUTC = new Date(Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate()
  ));
  
  const daysDiff = getDaysDifference(dueDateUTC, today);

  let message = "";
  let subject = "";

  // Formatar data de vencimento em inglês (usar UTC)
  const formattedDueDate = dueDateUTC.toLocaleDateString("en-US", { 
    year: "numeric", 
    month: "long", 
    day: "numeric",
    timeZone: "UTC"
  });

  const paymentText = `<p>Contact us to arrange payment.</p>`;

  if (emailType.startsWith("before_")) {
    // Lembretes antes do vencimento
    const daysRemaining = Math.abs(daysDiff);
    subject = `Your invoice is due on ${formattedDueDate}`;
    message = `
      <p>This is a reminder that your invoice <strong>#${invoiceCode}</strong>, in the amount of <strong>${invoiceAmount}</strong>, is due on <strong>${formattedDueDate}</strong>.</p>
      ${paymentText}
    `;
  } else if (emailType === "on_due") {
    // Lembrete no dia do vencimento
    subject = `Your invoice #${invoiceCode} is due today`;
    message = `
      <p>This is a reminder that your invoice <strong>#${invoiceCode}</strong>, in the amount of <strong>${invoiceAmount}</strong>, is due <strong>today</strong>.</p>
      ${paymentText}
    `;
  } else if (emailType.startsWith("after_")) {
    // Lembretes após o vencimento
    const daysOverdue = Math.abs(daysDiff);
    subject = `Your invoice #${invoiceCode} is ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue`;
    message = `
      <p>This is a reminder that your invoice <strong>#${invoiceCode}</strong>, in the amount of <strong>${invoiceAmount}</strong>, is now <strong>${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue</strong>.</p>
      <p><strong>Original due date:</strong> ${formattedDueDate}</p>
      ${paymentText}
    `;
  }

  return { message, subject };
}

/**
 * Função auxiliar para montar o template HTML completo do email
 */
function buildEmailTemplate(
  clientName: string,
  companyLogo: string | undefined,
  invoiceCode: string,
  invoiceAmount: string,
  companyName: string,
  phone: string,
  emailBody: string,
  subject: string,
  invoiceType: string,
  invoiceUrl: string | null,
  invoiceId: string,
  companyEmail?: string
): string {
  // Usar o mesmo template do sendInvoice
  const { invoiceCustom } = require("../templateEmail/invoiceCustom");
  return invoiceCustom(
    clientName,
    companyLogo,
    invoiceCode,
    invoiceAmount,
    companyName,
    phone,
    emailBody,
    subject,
    invoiceType,
    invoiceUrl,
    invoiceId,
    companyEmail
  );
}

/**
 * Função principal que verifica e envia emails para invoices pendentes
 */
async function checkAndSendAutoEmails() { 
  // console.log(`[${new Date().toISOString()}] Iniciando verificação automática de emails de invoices...`);

  try {
    // Buscar todas as configurações ativas
    const activeConfigs = await prisma.invoiceAutoEmailConfig.findMany({
      where: {
        isActive: true
      },
      include: {
        company: true
      }
    });

    // console.log(`Encontradas ${activeConfigs.length} configurações ativas de envio automático de emails`);

    // Para cada configuração ativa, processar os invoices da empresa
    for (const config of activeConfigs) {
      // console.log(`Processando empresa: ${config.company.name} (${config.companyId})`);

      try {
        // Buscar todos os invoices pendentes (open) da empresa que têm dueDate
        const pendingInvoices = await prisma.invoice.findMany({
          where: {
            companyId: config.companyId,
            status: "open",
            dueDate: {
              not: null
            }
          },
          include: {
            project: {
              include: {
                client: true,
                workContext: true
              }
            },
            PdfProject: true,
            InvoiceAutoEmailLog: true
          }
        });

        // console.log(`Encontrados ${pendingInvoices.length} invoices pendentes para a empresa ${config.company.name}`);

        // Para cada invoice, verificar se precisa enviar algum lembrete
        for (const invoice of pendingInvoices) {
          // Verificar se tem email (workContext primeiro, depois client como fallback)
          const recipientEmail = invoice.project?.workContext?.Email || invoice.project?.client?.email;
          
          if (!invoice.dueDate || !recipientEmail) {
            // console.log(`Pulando invoice ${invoice.externalInvoiceId}: data de vencimento ou email do destinatário ausente`);
            continue;
          }

          // Criar data de hoje em UTC (apenas data, sem horas)
          const now = new Date();
          const today = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
          ));
          
          // Criar data de vencimento em UTC (apenas data, sem horas)
          const invoiceDueDate = new Date(invoice.dueDate);
          const dueDate = new Date(Date.UTC(
            invoiceDueDate.getUTCFullYear(),
            invoiceDueDate.getUTCMonth(),
            invoiceDueDate.getUTCDate()
          ));

          const daysDiff = getDaysDifference(dueDate, today);
          
          // Log de debug para verificar cálculo de dias (usar formato UTC)
          // const dueDateStr = `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(dueDate.getUTCDate()).padStart(2, '0')}`;
          // const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
          // console.log(`Invoice ${invoice.externalInvoiceId}: DueDate=${dueDateStr}, Hoje=${todayStr}, Diferença=${daysDiff} dias`);

          // Determinar qual tipo de email enviar baseado na configuração
          let emailType: string | null = null;

          if (daysDiff === 7 && config.sendBefore7Days) {
            emailType = "before_7";
          } else if (daysDiff === 3 && config.sendBefore3Days) {
            emailType = "before_3";
          } else if (daysDiff === 1 && config.sendBefore1Day) {
            emailType = "before_1";
          } else if (daysDiff === 0 && config.sendOnDueDate) {
            emailType = "on_due";
          } else if (daysDiff === -1 && config.sendAfter1Day) {
            emailType = "after_1";
          } else if (daysDiff === -3 && config.sendAfter3Days) {
            emailType = "after_3";
          } else if (daysDiff === -7 && config.sendAfter7Days) {
            emailType = "after_7";
          }

          // Se não há tipo de email para enviar, pular
          if (!emailType) {
            continue;
          }

          // Verificar se já foi enviado um email deste tipo para este invoice hoje
          const alreadySentToday = invoice.InvoiceAutoEmailLog.some(log => {
            const logDate = new Date(log.sentAt);
            logDate.setHours(0, 0, 0, 0);
            return (
              log.emailType === emailType &&
              logDate.getTime() === today.getTime()
            );
          });

          if (alreadySentToday) {
            // console.log(`Email do tipo ${emailType} já foi enviado hoje para o invoice ${invoice.externalInvoiceId}`);
            continue;
          }

          // Enviar o email
          // console.log(`Enviando email do tipo ${emailType} para o invoice ${invoice.externalInvoiceId}`);
          await sendAutoEmail(invoice, emailType, config.company); 
        }
      } catch (companyError) {
        // console.error(`Erro ao processar empresa ${config.company.name}:`, companyError);
        // Continuar para a próxima empresa em caso de erro
        continue;
      }
    }

    // console.log(`[${new Date().toISOString()}] Verificação automática de emails de invoices concluída`);
  } catch (error) {
    // console.error("Erro em checkAndSendAutoEmails:", error);
  }
}

/**
 * Função para enviar um email automático para um invoice específico
 */
async function sendAutoEmail(invoice: any, emailType: string, company: any) {
  try {
    // Priorizar email do work context, usar email do client como fallback
    const recipientEmail = invoice.project?.workContext?.Email || invoice.project?.client?.email;
    const clientName = invoice.project?.workContext?.Name || invoice.project?.client?.name || "Client";
    
    if (!recipientEmail) {
      // console.error(`Nenhum email de destinatário encontrado para invoice ${invoice.externalInvoiceId}`);
      return;
    }

    // Log indicando qual email está sendo usado e para quem está enviando
    const emailSource = invoice.project?.workContext?.Email ? "workContext" : "client";
    // console.log(`Usando email de ${emailSource} para invoice ${invoice.externalInvoiceId}: ${recipientEmail}`);
    // console.log(`📧 Enviando email automático para: ${recipientEmail} (${clientName}) - Invoice #${invoice.externalInvoiceId}`);
    const invoiceCode = invoice.externalInvoiceId || invoice.id.substring(0, 8);
    const invoiceAmount = Number(invoice.totalAmount).toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });
    const companyName = company.name || "Smart Build";
    const phone = company.phone || "";

    // Buscar o PDF do invoice
    let pdfBuffer: Buffer | null = null;
    let fileName = `invoice_${invoiceCode}.pdf`;

    if (invoice.PdfProject && invoice.PdfProject.length > 0) {
      const pdfProject = invoice.PdfProject[0];
      if (pdfProject.uri) {
        try {
          const pdfUrl = await getPresignedUrl(pdfProject.uri);
          const pdfResponse = await fetch(pdfUrl);
          if (pdfResponse.ok) {
            pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            fileName = pdfProject.original_file_name || fileName;
          }
        } catch (pdfError) {
          // console.warn(`Falha ao buscar PDF para invoice ${invoice.id}:`, pdfError);
        }
      }
    }

    // Obter logo da empresa
    const urlLogo = company.avatar ? await getPresignedUrl(company.avatar) : undefined;

    // Calcular diferença de dias para o subject (usar UTC)
    const now = new Date();
    const today = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    
    const invoiceDueDate = new Date(invoice.dueDate);
    const dueDateForCalc = new Date(Date.UTC(
      invoiceDueDate.getUTCFullYear(),
      invoiceDueDate.getUTCMonth(),
      invoiceDueDate.getUTCDate()
    ));
    
    const daysDiff = getDaysDifference(dueDateForCalc, today);

    // Gerar o corpo do email baseado no tipo (a função agora retorna subject e message)
    const emailContent = getEmailBody(
      emailType,
      clientName,
      invoiceAmount,
      invoiceCode,
      companyName,
      new Date(invoice.dueDate),
      invoice.invoiceType || "custom"
    );

    const customBody = emailContent.message;
    const subject = emailContent.subject;

    // Montar template HTML completo
    const emailTemplate = buildEmailTemplate(
      clientName,
      urlLogo,
      invoiceCode,
      invoiceAmount,
      companyName,
      phone,
      customBody,
      subject,
      invoice.invoiceType,
      invoice.invoiceUrl,
      invoice.id,
      company.email
    );

    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: fileName,
        content: pdfBuffer.toString('base64'),
        type: "application/pdf",
        disposition: "attachment"
      });
    }

    await sendEmail({
      to: recipientEmail,
      subject: subject,
      html: emailTemplate,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    // Registrar sucesso no log
    await prisma.invoiceAutoEmailLog.create({
      data: {
        invoiceId: invoice.id,
        recipient: recipientEmail,
        emailType: emailType,
        status: "success"
      }
    });

    // Registrar na timeline do invoice
    await prisma.invoiceTimeline.create({
      data: {
        description: `Automatic reminder email sent (${emailType}) to ${recipientEmail}`,
        invoiceId: invoice.id
      }
    });

    // console.log(` Email do tipo ${emailType} enviado com sucesso para invoice ${invoiceCode} para ${recipientEmail}`);
  } catch (error: any) {
    // Obter email do destinatário para o log de erro (workContext primeiro, depois client)
    const recipientEmailForLog = invoice.project?.workContext?.Email || invoice.project?.client?.email || "unknown";

    // console.error(` Erro ao enviar email automático para invoice ${invoice.id}:`, error.code, error.message);

    // Registrar erro no log
    await prisma.invoiceAutoEmailLog.create({
      data: {
        invoiceId: invoice.id,
        recipient: recipientEmailForLog,
        emailType: emailType,
        status: "error",
        errorMessage: `${error.code || 'UNKNOWN'}: ${error.message || "Unknown error"}`
      }
    });
  }
}

/**
 * Configurar e iniciar o job de cron
 * Executa todos os dias às 9h da manhã (0 9 * * *)
 */
export function setupInvoiceAutoEmailJob() {
  // console.log("Configurando job de cron para envio automático de emails de invoices...");

  // Agendar para executar todos os dias às 19:09
  cron.schedule("0 9 * * *", () => {
    // console.log("Executando job agendado de envio automático de emails de invoices às 09:00");
    checkAndSendAutoEmails();
  });

  // console.log("Job de cron de envio automático de emails de invoices agendado para 09:00 diariamente");
}

