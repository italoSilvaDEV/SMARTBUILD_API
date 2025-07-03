import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { returnPayLoad } from "../../config/returnPayLoad";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { estimateEmail, estimateNotificationEmail } from "../../templateEmail/estimate";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';


export class EstimateController {

  private static async sendStatusUpdateEmail(estimate: any, email: string, emailClient: string) {
    const SMTP_CONFIG = require("../../config/smtp");

    // Buscar o projeto relacionado ao estimate
    const project = await prisma.project.findUnique({
      where: { id: estimate.projectId },
      include: {
        client: true,
        company: true
      }
    });

    if (!project) {
      console.error("Project not found for estimate:", estimate.id);
      return;
    }
    // Buscar o PDF para usar como anexo
    const pdfProject = await prisma.pdfProject.findFirst({
      where: { estimate_id: estimate.id }
    });
    if (!pdfProject || !pdfProject.uri) {
      console.error("PDF Project not found or has no URI for estimate:", estimate.id);
      return;
    }
    // Gerar URL presigned para o PDF
    const pdfUrl = await getPresignedUrl(pdfProject.uri);

    // Baixar o PDF do S3
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const fileName = pdfProject.original_file_name || `estimate_${estimate.project?.contract_number}/${estimate.number}.pdf`;

    // Obter o avatar da empresa
    const companyAvatar = await getPresignedUrl(project.company?.avatar || '');

    // Obter o número do estimate
    const nextNumber = estimate.number;

    // Calcular o valor total
    const totalAmount = Number(estimate.totalAmount);

    const transporter = nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: SMTP_CONFIG.port === 465,
      auth: {
        user: SMTP_CONFIG.user,
        pass: SMTP_CONFIG.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verificar a configuração do transportador
    transporter.verify((error, success) => {
      if (error) {
        console.error("Erro ao configurar o transportador de e-mail:", error);
      } else {
        console.log("Transportador de e-mail configurado com sucesso:", success);
      }
    });

    const mailOptions = {
      from: SMTP_CONFIG.user,
      to: email,
      subject: "Smart Build - Estimate",
      html: estimateNotificationEmail(
        project.client?.name || '',
        companyAvatar,
        project.company?.name || '',
        `${project.contract_number}/${nextNumber}`,
        totalAmount,
        emailClient,
        estimate.status
      ),
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ],
    };

    await transporter.sendMail(mailOptions);
  }

  // Método utilitário para verificar configuração SMTP
  private static async verifySMTPConfig() {
    try {
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const verification = await transporter.verify();
      console.log('✅ SMTP Configuration verified:', verification);
      return verification;
    } catch (error) {
      console.error('❌ SMTP Configuration error:', error);
      throw error;
    }
  }

  // Função utilitária para registrar eventos na timeline
  private static async addTimelineEvent(estimateId: string, description: string) {
    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId },
        select: {
          number: true,
          project: {
            select: {
              contract_number: true,
              user: {
                select: {
                  phone: true
                }
              }
            }
          }
        }
      });
      
//       if (estimate?.project?.user?.phone) {
//         const text = `📩 *SmartBuild Notification*
// Estimate ${estimate?.project?.contract_number || ''}/${estimate?.number || ''} 
// ${description}`;
//         // Formatar o telefone removendo caracteres não numéricos e garantindo formato correto
//         const formattedPhone = estimate?.project?.user?.phone.replace(/\D/g, '');
//         await EstimateController.sendWebhookNotification(formattedPhone, text);
//       }

      return await prisma.estimateTimeline.create({
        data: {
          description,
          estimate: {
            connect: { id: estimateId }
          }
        }
      });
    } catch (error) {
      console.error("Error adding timeline event:", error);
      // Não lançamos o erro para não interromper o fluxo principal
    }
  }

  private static async sendWebhookNotification(number: string, text: string) {
    try {
      const response = await fetch('https://n8n.codelabsusa.com/webhook/d29c40a4-a974-4000-b1ea-cef981a72646', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, text }),
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Webhook notification sent successfully:', data);
      return data;
    } catch (error) {
      console.error('Error sending webhook notification:', error);
      // Não lançamos o erro para não interromper o fluxo principal
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { projectId, idPdfProject } = req.body;

      // Validate projectId
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      // Validate idPdfProject
      if (!idPdfProject) {
        return res.status(400).json({ error: "PDF Project ID is required" });
      }

      // Buscar o projeto com seus serviços
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          serviceProject: {
            include: {
              photos: true
            }
          },
          client: true,
          company: true,
          estimates: {
            orderBy: {
              number: 'desc'
            },
            take: 1
          }
        }
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Gerar o próximo número sequencial
      const lastNumber = project.estimates[0]?.number || '0000';
      const nextNumber = String(Number(lastNumber) + 1).padStart(4, '0');

      // Buscar todos os termos do contrato da empresa
      const contractNotes = await prisma.contractNotes.findMany({
        where: { company_id: project.company_id },
        orderBy: { updatedAt: 'desc' }
      });

      // Combinar todos os termos do contrato
      const combinedTerms = contractNotes.length > 0
        ? contractNotes.map(note => note.notes).join('\n\n')
        : "Standard terms and conditions apply.";

      // Calcular o valor total com base nos serviços do projeto
      const totalAmount = project.serviceProject.reduce(
        (total, service) => total + (Number(service.price) * Number(service.hours)),
        0
      );

      // Map over service projects and ensure unique names by adding a unique identifier
      const serviceProjectsToCreate = project.serviceProject.map((sp, index) => ({
        name: `${sp.name}_${index}`, // Add index to make names unique
        quantity: Number(sp.hours),
        unitPrice: Number(sp.price),
        lineTotal: Number(sp.price) * Number(sp.hours),
        notes: sp.description,
      }));

      // Criar o change order
      const estimate = await prisma.estimate.create({
        data: {
          number: nextNumber,
          description: `Estimate #${nextNumber} for Project ${project.contract_number || 'N/A'}`,
          terms: combinedTerms,
          totalAmount,
          status: "pending",
          project: {
            connect: { id: projectId }
          },
          serviceProjects: {
            create: serviceProjectsToCreate
          }
        },
      });

      // Atualizar o PdfProject com o estimate_id
      await prisma.pdfProject.update({
        where: { id: idPdfProject },
        data: {
          estimate_id: estimate.id,
          project_id: projectId
        }
      });

      // Buscar o PDF para usar como anexo
      const pdfProject = await prisma.pdfProject.findUnique({
        where: { id: idPdfProject }
      });

      if (!pdfProject || !pdfProject.uri) {
        return res.status(404).json({ error: "PDF Project not found or has no URI" });
      }

      // Gerar URL presigned para o PDF
      const pdfUrl = await getPresignedUrl(pdfProject.uri);

      // Baixar o PDF do S3
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      // Configurar e enviar o email com o PDF anexado
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Verificar a configuração do transportador
      transporter.verify((error, success) => {
        if (error) {
          console.error("Erro ao configurar o transportador de e-mail:", error);
        } else {
          console.log("Transportador de e-mail configurado com sucesso:", success);
        }
      });

      const companyAvatar = await getPresignedUrl(project.company?.avatar || '');
      const fileName = pdfProject.original_file_name || `estimate_${project.contract_number || 'Nº'}_${nextNumber}.pdf`;

      const mailOptions = {
        from: SMTP_CONFIG.user,
        to: project.client?.email || '',
        subject: project.company?.name + " - Estimate",
        html: estimateEmail(
          project.client?.name || '',
          companyAvatar,
          project.company?.name || '',
          `${project.contract_number}/${nextNumber}`,
          totalAmount,
          estimate.id,
          project.client?.email || ''
        ),
        attachments: [
          {
            filename: fileName,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      //nao envia email durante a criaçao
      // await transporter.sendMail(mailOptions);

      // Usar a função utilitária
      await EstimateController.addTimelineEvent(estimate.id, "Created");

      return res.status(201).json(estimate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create change order" });
    }
  }

  async findByProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      const estimates = await prisma.estimate.findMany({
        where: {
          projectId
        },
        include: {
          serviceProjects: true,
          PdfProject: {
            orderBy: {
              date_creation: 'desc'
            },
            take: 1
          },
          canceledBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          timelineEvents: {
            orderBy: {
              date_creation: 'asc'
            }
          },
          emailLogs: {
            orderBy: {
              date_creation: 'asc'
            }
          },
        },
        orderBy: {
          date_creation: 'desc'
        }
      });

      // Generate presigned URLs for PDFs in all estimates and convert array to single object
      for (const estimate of estimates) {
        if (estimate.PdfProject && estimate.PdfProject.length > 0) {
          const pdf = estimate.PdfProject[0];
          if (pdf.uri) {
            pdf.uri = await getPresignedUrl(pdf.uri);
          }
          // Convert array to single object
          (estimate as any).PdfProject = pdf;
        } else {
          // Set to null if no PDF found
          (estimate as any).PdfProject = null;
        }
      }

      return res.json(estimates);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch estimates" });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          serviceProjects: true,
          canceledBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          project: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  email: true,
                  phone: true
                }
              },
              client: { 
                select: {
                  id: true,
                  name: true,
                  email: true,
                }
              }
            }
          },
          PdfProject: true,
          timelineEvents: {
            orderBy: {
              date_creation: 'asc'
            }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      // Generate presigned URL for company avatar if it exists
      if (estimate.project?.company?.avatar) {
        estimate.project.company.avatar = await getPresignedUrl(estimate.project.company.avatar);
      }

      // Generate presigned URLs for PDFs if they exist
      if (estimate.PdfProject && estimate.PdfProject.length > 0) {
        for (const pdf of estimate.PdfProject) {
          if (pdf.uri) {
            pdf.uri = await getPresignedUrl(pdf.uri);
          }
        }
      }

      // Usar a função utilitária
      await EstimateController.addTimelineEvent(id, "Viewed");

      return res.json(estimate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch estimate" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description, terms, totalAmount } = req.body;

      const estimate = await prisma.estimate.update({
        where: { id },
        data: {
          description,
          terms,
          totalAmount,
          date_update: new Date()
        }
      });

      return res.json(estimate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update estimate" });
    }
  }



  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["rejected", "canceled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const estimate = await prisma.estimate.update({
        where: { id },
        data: {
          status,
          date_update: new Date()
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: estimate.projectId },
        include: {
          user: true
        }
      });
      if (status === "rejected") {
        await EstimateController.sendStatusUpdateEmail(
          estimate,
          project?.user?.email || '',
          "client"
        );
      }

      // Usar a função utilitária
      const event = status === "rejected" ? "Rejected" : status;
      await EstimateController.addTimelineEvent(estimate.id, event);

      return res.json(estimate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update estimate status" });
    }
  }

  async addSignature(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { signature, email } = req.body;
      const decodedEmail = email ? Buffer.from(email.toString(), 'base64').toString() : 'unknown';
      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              client: true,
              company: true
            }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      
      // Atualizar o estimate com a signature
      await prisma.estimate.update({
        where: { id },
        data: {
          clientSignature: JSON.stringify({ signature }),
          status: "approved",
          date_update: new Date()
        }
      });

      // Buscar o PDF para usar como anexo
      const pdfProject = await prisma.pdfProject.findFirst({
        where: { estimate_id: estimate.id }
      });
      
      if (!pdfProject || !pdfProject.uri) {
        return res.status(404).json({ error: "PDF Project not found or has no URI" });
      }

      // Gerar URL presigned para o PDF
      const pdfUrl = await getPresignedUrl(pdfProject.uri);

      // Baixar o PDF do S3
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      // Carregar o PDF original usando pdf-lib
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const pages = pdfDoc.getPages();

      // Converter signature de base64 para imagem se ela existir
      if (signature) {
        try {
          // Remove o prefixo data:image se existir
          const base64Data = signature.replace(/^data:image\/[a-z]+;base64,/, '');
          const signatureBuffer = Buffer.from(base64Data, 'base64');
          
          // Tentar embeddar como PNG primeiro, depois como JPEG
          let signatureImage;
          try {
            signatureImage = await pdfDoc.embedPng(signatureBuffer);
          } catch (pngError) {
            try {
              signatureImage = await pdfDoc.embedJpg(signatureBuffer);
            } catch (jpgError) {
              console.error('Failed to embed signature as PNG or JPG:', pngError, jpgError);
              throw new Error('Invalid signature image format');
            }
          }

          // Dimensões da signature
          const signatureWidth = 100;
          const signatureHeight = 50;
          
          // Adicionar signature em todas as páginas a partir da segunda
          for (let i = 1; i < pages.length; i++) {
            const page = pages[i];
            const { width, height } = page.getSize();
            
            // Posicionar a signature no canto inferior direito
            const x = width - signatureWidth - 50;
            const y = 50;
            
            page.drawImage(signatureImage, {
              x,
              y,
              width: signatureWidth,
              height: signatureHeight,
            });
            
            // Adicionar data e hora atual abaixo da assinatura
            const currentDate = new Date();
            const formattedDate = currentDate.toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'America/New_York'
            });
            
            page.drawText(`Signed on: ${formattedDate}`, {
              x,
              y: y - 15, // 15 pixels abaixo da assinatura
              size: 8,
              color: rgb(0.5, 0.5, 0.5) // Cor cinza
            });
          }
        } catch (signatureError) {
          console.error('Error processing signature:', signatureError);
          // Continue sem adicionar a signature se houver erro
        }
      }

      // Gerar o PDF modificado
      const modifiedPdfBytes = await pdfDoc.save();
      const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);

      // Upload do PDF modificado diretamente para S3
      const s3 = new S3Client({
        region: process.env.AMAZON_S3_REGION,
        credentials: {
          accessKeyId: process.env.AMAZON_S3_KEY!,
          secretAccessKey: process.env.AMAZON_S3_SECRET!,
        },
      });

      const fileHash = crypto.randomBytes(4).toString("hex");
      const originalFileName = pdfProject.original_file_name || `estimate_${estimate.project?.contract_number}_${estimate.number}.pdf`;
      const newFileName = `${fileHash}-${originalFileName.replace(/\s/g, "")}`;

      const putObjectCommand = new PutObjectCommand({
        Bucket: process.env.AMAZON_S3_BUCKET!,
        Key: newFileName,
        Body: modifiedPdfBuffer,
        ContentType: 'application/pdf',
      });

      await s3.send(putObjectCommand);
      
      // Atualizar o pdfProject com o novo URI
      await prisma.pdfProject.update({
        where: { id: pdfProject.id },
        data: {
          uri: newFileName
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: estimate.projectId },
        include: {
          user: true
        }
      });

      if (project && project?.status_project !== "Accepted" &&
        project?.status_project !== "Pre-Start" &&
        project?.status_project !== "In Progress" &&
        project?.status_project !== "Final walkthrough" &&
        project?.status_project !== "Finished"
      ) {
        await prisma.project.update({
          where: {
            id: project.id
          },
          data: {
            status_project: "Accepted"
          }
        });
      }

      await EstimateController.sendStatusUpdateEmail(
        estimate,
        project?.user?.email || '',
        decodedEmail
      );
      
      // Adicionar evento na timeline
      await EstimateController.addTimelineEvent(estimate.id, "Approved by client email: " + decodedEmail);

      return res.json(estimate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to add signature to estimate" });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { cancellationReason } = req.body;
      const payload = returnPayLoad(req)
      const userId = payload?.id; // Assuming you have user info in the request from checkToken middleware

      if (!userId) return res.status(401).json({ error: "Failed to cancel estimate" });
      const estimate = await prisma.estimate.update({
        where: { id },
        data: {
          status: "canceled",
          canceledAt: new Date(),
          canceledById: userId,
          cancellationReason,
          date_update: new Date()
        }
      });
      await prisma.project.findUnique({
        where: { id: estimate.projectId },
        include: {
          client: true
        }
      });


      // Usar a função utilitária
      await EstimateController.addTimelineEvent(estimate.id, "Canceled");

      return res.json(estimate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to cancel estimate" });
    }
  }

  async addService(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, quantity, unitPrice, lineTotal, notes } = req.body;

      const estimateServiceProject = await prisma.estimateServiceProject.create({
        data: {
          estimate: {
            connect: { id }
          },
          name,
          quantity,
          unitPrice,
          lineTotal,
          notes
        }
      });

      // Update the total amount of the change order
      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = estimate?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      );

      await prisma.estimate.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.status(201).json(estimateServiceProject);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to add service to estimate" });
    }
  }

  async removeService(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Find the record to delete
      const record = await prisma.estimateServiceProject.findFirst({
        where: {
          id
        }
      });

      if (!record) {
        return res.status(404).json({ error: "Service not found in this change order" });
      }

      // Delete the record
      await prisma.estimateServiceProject.delete({
        where: {
          id: record.id
        }
      });

      // Update the total amount of the change order
      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = estimate?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      ) || 0;

      await prisma.estimate.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.json({ message: "Service removed from estimate" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to remove service from estimate" });
    }
  }

  async updateService(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { quantity, unitPrice, lineTotal, notes } = req.body;

      // Find the record to update
      const record = await prisma.estimateServiceProject.findFirst({
        where: {
          id
        }
      });

      if (!record) {
        return res.status(404).json({ error: "Service not found in this change order" });
      }

      // Update the record
      const updatedRecord = await prisma.estimateServiceProject.update({
        where: {
          id: record.id
        },
        data: {
          quantity,
          unitPrice,
          lineTotal,
          notes,
          date_update: new Date()
        }
      });

      // Update the total amount of the change order
      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = estimate?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      );

      await prisma.estimate.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.json(updatedRecord);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update service in estimate" });
    }
  }

  async resendEmail(req: Request, res: Response) { 
    try {
      const { id } = req.params;
      const { emails } = req.body;

      // Validar se emails é um array
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: "Please provide at least one email address" });
      }

      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              client: true,
              company: true
            }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      // Configurar o transportador de email
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Resultados do envio para cada email
      const results = [];
      const companyAvatar = await getPresignedUrl(estimate.project?.company?.avatar || '');
      // Processar todos os emails
      for (const email of emails) {
        try {
          const mailOptions = {
            from: SMTP_CONFIG.user,
            to: email,
            subject: estimate.project?.company?.name + " - Estimate Reminder",
            html: estimateEmail(
              estimate.project?.client?.name || '',
              companyAvatar,
              estimate.project?.company?.name || '',
              `${estimate.project?.contract_number}/${estimate.number}`,
              Number(estimate.totalAmount),
              estimate.id,
              estimate.project?.client?.email || ''
            ),
          };

          // Enviar o email e aguardar a resposta
          await transporter.sendMail(mailOptions);

          // Se chegou aqui, o envio foi bem-sucedido
          await prisma.estimateEmailLog.create({
            data: {
              estimate: { connect: { id } },
              recipient: email,
              status: "success",
              sentAt: new Date()
            }
          });

          results.push({ email, status: "success" });

          await EstimateController.addTimelineEvent(
            estimate.id,
            `Email sent to ${email} successfully`
          );
        } catch (error: any) {

          await prisma.estimateEmailLog.create({
            data: {
              estimate: { connect: { id } },
              recipient: email,
              status: "error",
              errorMessage: error.message || "Unknown error",
              sentAt: new Date()
            }
          });

          results.push({ email, status: "error", message: error.message });

          await EstimateController.addTimelineEvent(
            estimate.id,
            `Failed to send email to ${email}: ${error.message}`
          );
        }
      }

      // Retornar todos os resultados após processar todos os emails
      return res.json({
        success: results.some(r => r.status === "success"),
        results
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to resend estimate email" });
    }
  }
  async sendEmail(req: Request, res: Response) {
    let attachmentFiles: Express.Multer.File[] = [];
    
    // Função utilitária para limpar arquivos temporários
    const cleanupTempFiles = (files: Express.Multer.File[]) => {
      if (files && files.length > 0) {
        files.forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (error) {
            console.error(`❌ Error deleting temporary file ${file.path}:`, error);
          }
        });
      }
    };

    try {
      const { id } = req.params;
      attachmentFiles = req.files as Express.Multer.File[];

      // Extrair dados diretamente do body (FormData)
      const { from, to, cc, bcc, subject, body, sendMeCopy } = req.body;

      // Validar se há dados básicos do email
      if (!to) {
        // Limpar arquivos antes de retornar erro
        cleanupTempFiles(attachmentFiles);
        return res.status(400).json({ error: "Recipient email is required" });
      }

      // Função para validar tipos de arquivo permitidos
      const validateFileType = (file: Express.Multer.File): boolean => {
        const allowedTypes = [
          'image/jpeg',
          'image/jpg', 
          'image/png',
          'image/gif',
          'image/bmp',
          'image/webp',
          'application/pdf'
        ];
        return allowedTypes.includes(file.mimetype);
      };

      // Validar tipos de arquivo dos anexos
      if (attachmentFiles && attachmentFiles.length > 0) {
        const invalidFiles = attachmentFiles.filter(file => !validateFileType(file));
        if (invalidFiles.length > 0) {
          // Limpar arquivos temporários
          cleanupTempFiles(attachmentFiles);
          return res.status(400).json({ 
            error: "Invalid file type. Only images (JPEG, PNG, GIF, BMP, WEBP) and PDF files are allowed.",
            invalidFiles: invalidFiles.map(f => ({ 
              name: f.originalname, 
              type: f.mimetype 
            }))
          });
        }
      }

      // Função utilitária para processar emails corretamente
      const parseEmailList = (emailInput: any): string[] => {
        if (!emailInput) return [];
        
        // Se for uma string que parece ser um array JSON, tentar fazer parse
        if (typeof emailInput === 'string') {
          try {
            // Tentar fazer parse se parecer com JSON array
            if (emailInput.startsWith('[') && emailInput.endsWith(']')) {
              const parsed = JSON.parse(emailInput);
              if (Array.isArray(parsed)) {
                return parsed.filter(email => email && typeof email === 'string').map(email => email.trim());
              }
            }
            // Se não for JSON, tratar como string separada por vírgulas
            return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
          } catch (error) {
            // Se falhar o parse, tratar como string normal
            return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
          }
        }
        
        // Se já for array, garantir que seja array de strings
        if (Array.isArray(emailInput)) {
          return emailInput.filter(email => email && typeof email === 'string').map(email => email.trim());
        }
        
        return [];
      };

      // Criar o payload estruturado do email
      const dataEmail = {
        from: from || '',
        to: parseEmailList(to),
        cc: parseEmailList(cc),
        bcc: parseEmailList(bcc),
        sendMeCopy: sendMeCopy === 'true' || sendMeCopy === true,
        subject: subject || '',
        body: body || ''
      };

      // Validar se há pelo menos um destinatário
      if (!dataEmail.to || dataEmail.to.length === 0) {
        // Limpar arquivos antes de retornar erro
        cleanupTempFiles(attachmentFiles);
        return res.status(400).json({ error: "Please provide at least one recipient email address" });
      }

      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              client: true,
              company: true
            }
          }
        }
      });

      if (!estimate) {
        // Limpar arquivos antes de retornar erro
        cleanupTempFiles(attachmentFiles);
        return res.status(404).json({ error: "Estimate not found" });
      }

      // Buscar o PDF para usar como anexo
      const pdfProject = await prisma.pdfProject.findFirst({
        where: { estimate_id: estimate.id }
      });
      if (!pdfProject || !pdfProject.uri) {
        // Limpar arquivos antes de retornar erro
        cleanupTempFiles(attachmentFiles);
        return res.status(404).json({ error: "PDF Project not found or has no URI" });
      }
      // Gerar URL presigned para o PDF
      const pdfUrl = await getPresignedUrl(pdfProject.uri);

      // Baixar o PDF do S3
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        // Limpar arquivos antes de lançar erro
        cleanupTempFiles(attachmentFiles);
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const fileName = pdfProject.original_file_name || `estimate_${estimate.project?.contract_number}/${estimate.number}.pdf`;

      // Configurar o transportador de email
      const SMTP_CONFIG = require("../../config/smtp");
      
      // Verificar configuração SMTP
      try {
        await EstimateController.verifySMTPConfig();
      } catch (error) {
        console.error('SMTP verification failed:', error);
        // Limpar arquivos antes de retornar erro
        cleanupTempFiles(attachmentFiles);
        return res.status(500).json({ 
          error: "SMTP configuration error", 
          details: error instanceof Error ? error.message : 'Unknown error' 
        });
      }

      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Resultados do envio
      const results = [];
      const companyAvatar = await getPresignedUrl(estimate.project?.company?.avatar || '');

      // Preparar lista completa de destinatários APENAS dos campos enviados no FormData
      const allRecipients = [
        ...dataEmail.to,
        ...dataEmail.cc,
        ...dataEmail.bcc
      ];

      // Se sendMeCopy for true, adicionar o remetente aos destinatários
      if (dataEmail.sendMeCopy && dataEmail.from) {
        allRecipients.push(dataEmail.from);
      }

      // Garantir que allRecipients seja uma lista plana de strings únicas
      const uniqueRecipients = [...new Set(allRecipients.filter(email => email && typeof email === 'string'))];

      // Log para debug - verificar se não há emails indesejados
      console.log('📧 Recipients list:', {
        to: dataEmail.to,
        cc: dataEmail.cc,
        bcc: dataEmail.bcc,
        sendMeCopy: dataEmail.sendMeCopy,
        from: dataEmail.from,
        allRecipients: allRecipients,
        uniqueRecipients: uniqueRecipients
      });

      try {
        // Preparar anexos
        const attachments = [
          {
            filename: fileName,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ];

        // Adicionar anexos enviados pelo usuário
        if (attachmentFiles && attachmentFiles.length > 0) {
          console.log(`📎 Processing ${attachmentFiles.length} attachment(s)...`);
          for (const file of attachmentFiles) {
            try {
              const fileBuffer = fs.readFileSync(file.path);
              attachments.push({
                filename: file.originalname,
                content: fileBuffer,
                contentType: file.mimetype
              });
              console.log(`✅ Processed attachment: ${file.originalname} (${file.mimetype})`);
            } catch (error) {
              console.error(`❌ Error reading attachment file ${file.originalname}:`, error);
            }
          }
        }

        const mailOptions = {
          from: SMTP_CONFIG.user,
          to: dataEmail.to,
          cc: dataEmail.cc.length > 0 ? dataEmail.cc : undefined,
          bcc: dataEmail.bcc.length > 0 ? dataEmail.bcc : undefined,
          subject: dataEmail.subject || `${estimate.project?.company?.name} - Estimate`,
          html: estimateEmail(
            estimate.project?.client?.name || '',
            companyAvatar,
            estimate.project?.company?.name || '',
            `${estimate.project?.contract_number}/${estimate.number}`,
            Number(estimate.totalAmount),
            estimate.id,
            estimate.project?.client?.email || '', // Usado APENAS para gerar o link no template
            dataEmail.body
          ),
          attachments,
          
          // Adicionar versão texto para melhorar a entregabilidade
          text: dataEmail.body ? dataEmail.body.replace(/<[^>]*>/g, '') : `
Dear ${estimate.project?.client?.name || 'Client'},

Your Estimate ${estimate.project?.contract_number}/${estimate.number} is ready!
Total: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(estimate.totalAmount))}

Please access the link to view details and approve the budget:
${process.env.URL_FRONT}/estimate-response/${estimate.id}/${Buffer.from(estimate.project?.client?.email || '').toString('base64')}

We appreciate your business. Feel free to contact us if you have any questions.

Have a great day!
${estimate.project?.company?.name || ''}
          `.trim()
        };

        // Se sendMeCopy for true, adicionar o remetente ao BCC
        if (dataEmail.sendMeCopy && dataEmail.from) {
          if (mailOptions.bcc) {
            if (Array.isArray(mailOptions.bcc)) {
              mailOptions.bcc.push(dataEmail.from);
            } else {
              mailOptions.bcc = [mailOptions.bcc, dataEmail.from];
            }
          } else {
            mailOptions.bcc = [dataEmail.from];
          }
        }

        // Log detalhado antes do envio
        console.log('📧 Sending email with options:', {
          from: mailOptions.from,
          to: mailOptions.to,
          cc: mailOptions.cc,
          bcc: mailOptions.bcc,
          subject: mailOptions.subject,
          hasHtml: !!mailOptions.html,
          hasText: !!mailOptions.text,
          attachmentCount: attachments.length,
          smtpConfig: {
            host: SMTP_CONFIG.host,
            port: SMTP_CONFIG.port,
            secure: SMTP_CONFIG.port === 465,
            user: SMTP_CONFIG.user
          }
        });

        // Enviar o email
        const emailResponse = await transporter.sendMail(mailOptions);
        
        // Log detalhado da resposta
        console.log('✅ Email sent successfully:', {
          messageId: emailResponse.messageId,
          accepted: emailResponse.accepted,
          rejected: emailResponse.rejected,
          response: emailResponse.response,
          envelope: emailResponse.envelope
        });

        // Log de sucesso APENAS para os destinatários reais (não incluir o email do cliente do banco)
        for (const recipient of uniqueRecipients) {
          await prisma.estimateEmailLog.create({
            data: {
              estimate: { connect: { id } },
              recipient,
              status: "success",
              sentAt: new Date()
            }
          });

          results.push({ email: recipient, status: "success" });
        }

        // Timeline event APENAS com os destinatários reais
        await EstimateController.addTimelineEvent(
          estimate.id,
          `Email sent to ${uniqueRecipients.length} recipient(s): ${uniqueRecipients.join(', ')}${attachmentFiles && attachmentFiles.length > 0 ? ` with ${attachmentFiles.length} attachment(s)` : ''}`
        );

      } catch (error: any) {
        // Log de erro APENAS para os destinatários reais
        for (const recipient of uniqueRecipients) {
          await prisma.estimateEmailLog.create({
            data: {
              estimate: { connect: { id } },
              recipient,
              status: "error",
              errorMessage: error.message || "Unknown error",
              sentAt: new Date()
            }
          });

          results.push({ email: recipient, status: "error", message: error.message });
        }

        await EstimateController.addTimelineEvent(
          estimate.id,
          `Failed to send email to ${uniqueRecipients.join(', ')}: ${error.message}`
        );
      } finally {
        // Limpar arquivos temporários - SEMPRE executado
        cleanupTempFiles(attachmentFiles);
      }

      // Retornar os resultados
      return res.json({
        success: results.some(r => r.status === "success"),
        results,
        dataEmail: {
          to: dataEmail.to,
          cc: dataEmail.cc,
          bcc: dataEmail.bcc,
          subject: dataEmail.subject,
          sendMeCopy: dataEmail.sendMeCopy,
          attachmentCount: attachmentFiles ? attachmentFiles.length : 0
        }
      });
    } catch (error) {
      console.error('❌ Unexpected error in sendEmail:', error);
      // Garantir limpeza mesmo em erros não tratados
      cleanupTempFiles(attachmentFiles);
      return res.status(500).json({ error: "Failed to send estimate email" });
    }
  }
} 