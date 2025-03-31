import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { returnPayLoad } from "../../config/returnPayLoad";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
export class ChangeOrderController {
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
          changeOrders: {
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
      const lastNumber = project.changeOrders[0]?.number || '0000';
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

      // Criar o change order
      const changeOrder = await prisma.changeOrder.create({
        data: {
          number: nextNumber,
          description: `Change Order #${nextNumber} for Project ${project.contract_number || 'N/A'}`,
          terms: combinedTerms,
          totalAmount,
          status: "pending",
          project: {
            connect: { id: projectId }
          },
          serviceProjects: {
            create: project.serviceProject.map(sp => ({
              quantity: Number(sp.hours),
              unitPrice: Number(sp.price),
              lineTotal: Number(sp.price)*Number(sp.hours),
              notes: sp.description,
              serviceProject: {
                connect: { id: sp.id }
              }
            }))
          }
        },
        include: {
          serviceProjects: {
            include: {
              serviceProject: true
            }
          },
          project: {
            include: {
              client: true
            }
          }
        }
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
        <p>Link to Estimate: <a href="http://localhost:5173/estimate-response/${changeOrder.id}">View Estimate</a></p>
        <p>Status: ${changeOrder.status}</p>
        `,
      };


      await transporter.sendMail(mailOptions);

      console.log("e-mail enviado com sucesso!");
      return res.status(201).json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create change order" });
    }
  }

  async findByProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      const changeOrders = await prisma.changeOrder.findMany({
        where: {
          projectId
        },
        include: {
          serviceProjects: {
            include: {
              serviceProject: true
            }
          },
          canceledBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          date_creation: 'desc'
        }
      });

      return res.json(changeOrders);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch change orders" });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: {
            include: {
              serviceProject: true
            }
          },
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
          }
        }
      });

      if (!changeOrder) {
        return res.status(404).json({ error: "Change order not found" });
      }

      // Generate presigned URL for company avatar if it exists
      if (changeOrder.project?.company?.avatar) {
        changeOrder.project.company.avatar = await getPresignedUrl(changeOrder.project.company.avatar);
      }

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch change order" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description, terms, totalAmount } = req.body;

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          description,
          terms,
          totalAmount,
          date_update: new Date()
        }
      });

      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update change order" });
    }
  }

  private static async sendStatusUpdateEmail(changeOrder: any, email: string, projectNumber?: string) {
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
        <h1>Estimate #${changeOrder.number} for Project ${projectNumber || 'N/A'}</h1>
       
        <p>Link to Estimate: <a href="http://localhost:5173/estimate-response/${changeOrder.id}">View Estimate</a></p>
        <p>Status: ${changeOrder.status} (Status has been updated)</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          status,
          date_update: new Date()
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: changeOrder.projectId },
        include: {
          user: true
        }
      });

      await ChangeOrderController.sendStatusUpdateEmail(
        changeOrder, 
        project?.user?.email || '', 
        project?.contract_number?.toString() || ''
      );
      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update change order status" });
    }
  }

  async addSignature(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { signature } = req.body;

      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          clientSignature: JSON.stringify({ signature }),
          status: "approved",
          date_update: new Date()
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: changeOrder.projectId },
        include: {
          user: true
        }
      });

      await ChangeOrderController.sendStatusUpdateEmail(
        changeOrder, 
        project?.user?.email || '', 
        project?.contract_number?.toString() || ''
      );
      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to add signature to change order" });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { cancellationReason } = req.body;
      const payload = returnPayLoad(req)
      const userId = payload?.id; // Assuming you have user info in the request from checkToken middleware

      if (!userId) return  res.status(401).json({ error: "Failed to cancel change order" });
      const changeOrder = await prisma.changeOrder.update({
        where: { id },
        data: {
          status: "canceled",
          canceledAt: new Date(),
          canceledById: userId,
          cancellationReason,
          date_update: new Date()
        }
      });
      const project = await prisma.project.findUnique({
        where: { id: changeOrder.projectId },
        include: {
          client: true
        }
      });
      await ChangeOrderController.sendStatusUpdateEmail(
        changeOrder,
        project?.client?.email || '',
        project?.contract_number?.toString() || ''
      );
      return res.json(changeOrder);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to cancel change order" });
    }
  }

  async addService(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { serviceProjectId, quantity, unitPrice, lineTotal, notes } = req.body;

      const changeOrderServiceProject = await prisma.changeOrderServiceProject.create({
        data: {
          changeOrder: {
            connect: { id }
          },
          serviceProject: {
            connect: { id: serviceProjectId }
          },
          quantity,
          unitPrice,
          lineTotal,
          notes
        }
      });

      // Update the total amount of the change order
      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = changeOrder?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      );

      await prisma.changeOrder.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.status(201).json(changeOrderServiceProject);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to add service to change order" });
    }
  }

  async removeService(req: Request, res: Response) {
    try {
      const { id, serviceProjectId } = req.params;

      // Find the record to delete
      const record = await prisma.changeOrderServiceProject.findFirst({
        where: {
          changeOrderId: id,
          serviceProjectId
        }
      });

      if (!record) {
        return res.status(404).json({ error: "Service not found in this change order" });
      }

      // Delete the record
      await prisma.changeOrderServiceProject.delete({
        where: {
          id: record.id
        }
      });

      // Update the total amount of the change order
      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = changeOrder?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      ) || 0;

      await prisma.changeOrder.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.json({ message: "Service removed from change order" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to remove service from change order" });
    }
  }

  async updateService(req: Request, res: Response) {
    try {
      const { id, serviceProjectId } = req.params;
      const { quantity, unitPrice, lineTotal, notes } = req.body;

      // Find the record to update
      const record = await prisma.changeOrderServiceProject.findFirst({
        where: {
          changeOrderId: id,
          serviceProjectId
        }
      });

      if (!record) {
        return res.status(404).json({ error: "Service not found in this change order" });
      }

      // Update the record
      const updatedRecord = await prisma.changeOrderServiceProject.update({
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
      const changeOrder = await prisma.changeOrder.findUnique({
        where: { id },
        include: {
          serviceProjects: true
        }
      });

      const newTotalAmount = changeOrder?.serviceProjects.reduce(
        (total, item) => total + Number(item.lineTotal),
        0
      );

      await prisma.changeOrder.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          date_update: new Date()
        }
      });

      return res.json(updatedRecord);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update service in change order" });
    }
  }

  private async sendStatusUpdateEmail(changeOrder: any, email: string, projectNumber?: string) {
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
        <h1>Estimate #${changeOrder.number} for Project ${projectNumber || 'N/A'}</h1>
        <p>${changeOrder.terms}</p>
        <p>Total Amount: ${changeOrder.totalAmount}</p>
        <p>Link to Estimate: <a href="http://localhost:5173/estimate-response/${changeOrder.id}">View Estimate</a></p>
        <p>Status: ${changeOrder.status} (Status has been updated)</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }
} 