import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { returnPayLoad } from "../../config/returnPayLoad";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { estimateEmail, estimateNotificationEmail } from "../../templateEmail/estimate";

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
    };

    await transporter.sendMail(mailOptions);
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
      const { projectId } = req.body;

      // Buscar o projeto com seus serviços
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          serviceProject: true,
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
      const SMTP_CONFIG = require("../../config/smtp");

      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465, // true for 465, false for other ports
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
          console.log(
            "Transportador de e-mail configurado com sucesso:",
            success
          );
        }
      });

      const companyAvatar = await getPresignedUrl(project.company?.avatar || '');

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
      };


      await transporter.sendMail(mailOptions);

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
      const estimate = await prisma.estimate.update({
        where: { id },
        data: {
          clientSignature: JSON.stringify({ signature }),
          status: "approved",
          date_update: new Date()
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
} 