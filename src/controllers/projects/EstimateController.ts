import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { returnPayLoad } from "../../config/returnPayLoad";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
export class EstimateController {

  private static async sendStatusUpdateEmail(estimate: any, email: string, projectNumber?: string) {
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

    const mailOptions = {
      from: SMTP_CONFIG.user,
      to: email,
      subject: "Smart Build - Estimate",
      html: `
        <h1>Estimate #${estimate.number} for Project ${projectNumber || 'N/A'}</h1>
       
        <p>Link to Estimate: <a href="http://localhost:5173/estimate-response/${estimate.id}">View Estimate</a></p>
        <p>Status: ${estimate.status} (Status has been updated)</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  // Função utilitária para registrar eventos na timeline
  private static async addTimelineEvent(estimateId: string, description: string) {
    try {
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
        (total, service) => total + (Number(service.price)*Number(service.hours)),
        0
      );

      // Map over service projects and ensure unique names by adding a unique identifier
      const serviceProjectsToCreate = project.serviceProject.map((sp, index) => ({
        name: `${sp.name}_${index}`, // Add index to make names unique
        quantity: Number(sp.hours),
        unitPrice: Number(sp.price),
        lineTotal: Number(sp.price)*Number(sp.hours),
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
        // include: {
        //   serviceProjects: true,
        //   project: {
        //     include: {
        //       client: true
        //     }
        //   }
        // }
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

      const mailOptions = {
        from: SMTP_CONFIG.user,
        to: project.client?.email || '',
        subject: "Smart Build - Estimate",
        html: `
        <h1>Estimate #${nextNumber} for Project ${project.contract_number || 'N/A'}</h1>
        <p>Link to Estimate: <a href="${process.env.URL_FRONT}/estimate-response/${estimate.id}">View Estimate</a></p>
        <p>Status: ${estimate.status}</p>
        `,
      };


      await transporter.sendMail(mailOptions);

      console.log("e-mail enviado com sucesso!");
      
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

      if (!["pending", "approved", "rejected", "canceled"].includes(status)) {
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

      await EstimateController.sendStatusUpdateEmail(
        estimate, 
        project?.user?.email || '', 
        project?.contract_number?.toString() || ''
      );
      
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
      const { signature } = req.body;

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

      await EstimateController.sendStatusUpdateEmail(
        estimate, 
        project?.user?.email || '', 
        project?.contract_number?.toString() || ''
      );
      
      // Adicionar evento na timeline
      await EstimateController.addTimelineEvent(estimate.id, "Approved");
      
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

      if (!userId) return  res.status(401).json({ error: "Failed to cancel estimate" });
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
      const {   name, quantity, unitPrice, lineTotal, notes } = req.body;

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

      // Processar todos os emails
      for (const email of emails) {
        try {
          const mailOptions = {
            from: SMTP_CONFIG.user,
            to: email,
            subject: "Smart Build - Estimate Reminder",
            html: `
              <h1>Estimate #${estimate.number} for Project ${estimate.project?.contract_number?.toString() || 'N/A'}</h1>
              <p>This is a reminder about your estimate.</p>
              <p>Total Amount: ${estimate.totalAmount}</p>
              <p>Link to Estimate: <a href="${process.env.URL_FRONT}/estimate-response/${estimate.id}">View Estimate</a></p>
              <p>Status: ${estimate.status}</p>
            `,
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