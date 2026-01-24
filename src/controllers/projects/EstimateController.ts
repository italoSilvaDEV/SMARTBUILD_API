import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { returnPayLoad } from "../../config/returnPayLoad";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { estimateEmail, estimateNotificationEmail } from "../../templateEmail/estimate";
import { sendEmail } from "../../utils/sendEmail";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';


export class EstimateController {

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
      const { projectId, idPdfProject, preGeneratedNumber } = req.body;

      // Validate projectId
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      // Validate idPdfProject
      if (!idPdfProject) {
        return res.status(400).json({ error: "PDF Project ID is required" });
      }

      console.log('🔢 [EstimateController] Número pré-gerado recebido:', preGeneratedNumber);

      // Buscar o projeto com informações mínimas necessárias
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          contract_number: true,
          company_id: true,
          serviceProject: {
            select: {
              name: true,
              price: true,
              hours: true,
              description: true
            }
          },
          estimates: {
            select: {
              number: true
            },
            orderBy: {
              date_creation: 'desc'
            }
          }
        }
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // ✅ USAR NÚMERO PRÉ-GERADO OU GERAR NOVO COMO FALLBACK
      let nextNumber: string;

      if (preGeneratedNumber) {
        console.log('✅ [EstimateController] Usando número pré-gerado:', preGeneratedNumber);
        nextNumber = preGeneratedNumber;
      } else {
        console.log('⚠️ [EstimateController] Número pré-gerado não fornecido, gerando novo...');

        if (!project.contract_number) {
          return res.status(400).json({ error: "Project does not have a contract number" });
        }

        // Fallback: gerar número sequencial no formato correto project_number/estimate_number
        let nextEstimateNumber = 1;

        if (project.estimates.length > 0) {
          // Encontrar o maior número de estimate já existente
          const estimateNumbers = project.estimates
            .map(estimate => {
              const parts = estimate.number.split('/');
              return parts.length > 1 ? Number(parts[1]) : 0;
            })
            .filter(num => !isNaN(num) && num > 0);

          if (estimateNumbers.length > 0) {
            const maxEstimateNumber = Math.max(...estimateNumbers);
            nextEstimateNumber = maxEstimateNumber + 1;
          }
        }

        // Formatar: project_number/estimate_number (ex: 1358/0001)
        const formattedEstimateNumber = String(nextEstimateNumber).padStart(4, '0');
        nextNumber = `${project.contract_number}/${formattedEstimateNumber}`;
        console.log('🔄 [EstimateController] Número gerado como fallback:', nextNumber);
      }

      // Buscar contract notes e preparar dados em paralelo
      const [contractNotes] = await Promise.all([
        prisma.contractNotes.findMany({
          where: { company_id: project.company_id },
          select: {
            notes: true
          },
          orderBy: { updatedAt: 'desc' }
        })
      ]);

      // Combinar todos os termos do contrato
      const combinedTerms = contractNotes.length > 0
        ? contractNotes.map(note => note.notes).join('\n\n')
        : "Standard terms and conditions apply.";

      // Calcular o valor total com base nos serviços do projeto
      const totalAmount = project.serviceProject.reduce(
        (total: number, service: any) => total + (Number(service.price) * Number(service.hours)),
        0
      );

      // Preparar dados dos serviços
      const serviceProjectsToCreate = project.serviceProject.map((sp: any, index: number) => ({
        name: `${sp.name}_${index}`,
        quantity: Number(sp.hours),
        unitPrice: Number(sp.price),
        lineTotal: Number(sp.price) * Number(sp.hours),
        notes: sp.description,
      }));

      // Criar o estimate e atualizar o PDF em paralelo
      console.log('💾 [EstimateController] Criando estimate com número:', nextNumber);
      const [estimate] = await Promise.all([
        prisma.estimate.create({
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
        }),
        prisma.pdfProject.update({
          where: { id: idPdfProject },
          data: {
            project_id: projectId
          }
        })
      ]);

      // Operações finais em paralelo
      Promise.all([
        prisma.pdfProject.update({
          where: { id: idPdfProject },
          data: {
            estimate_id: estimate.id
          }
        }),
        EstimateController.addTimelineEvent(estimate.id, "Created")
      ]).catch(error => {
        console.error("Error in final parallel operations:", error);
      });

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
          project: {
            select: {
              id: true,
              status_project: true,
              autorId: true,
              location: true,
              client: {
                select: {
                  id: true,
                  avatar: true,
                  name: true,
                  email: true,
                  city_and_state: true,
                  date_creation: true,
                  date_update: true,
                }
              },
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true
                }
              },
              serviceProject: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  hours: true,
                  price: true,
                  status: true,
                  estimateServiceId: true
                }
              },
              company: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  address: true,
                  district: true,
                  numberHouse: true,
                  avatar: true,
                  complement: true,
                  webSiteUrl: true,
                  NotesContrac: {
                    select: {
                      id: true,
                      notes: true,
                      updatedAt: true,
                      createdAt: true
                    }
                  }
                }
              }
            },
          },
          PdfProject: {
            orderBy: {
              date_creation: 'desc'
            },
            take: 1
          },
          imagesAttachments: {
            select: {
              id: true,
              url: true,
              original_filename: true,
              title: true,
              date_creation: true,
              date_update: true
            }
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

        let imagesAttachmentsData: any[] = [];
        if (estimate.imagesAttachments && estimate.imagesAttachments.length > 0) {
          imagesAttachmentsData = await Promise.all(
            estimate.imagesAttachments.map(async (image) => {
              return {
                id: image.id,
                url: image.url ? await getPresignedUrl(image.url) : null,
                original_filename: image.original_filename,
                title: image.title,
                date_creation: image.date_creation,
                date_update: image.date_update
              }
            })
          );
        }
        (estimate as any).imagesAttachments = imagesAttachmentsData;

        if (estimate.project.company?.avatar) {
          estimate.project.company.avatar = await getPresignedUrl(estimate.project.company.avatar);
        }
        if (estimate.project.user?.avatar) {
          estimate.project.user.avatar = await getPresignedUrl(estimate.project.user.avatar);
        }
        if (estimate.project.client?.avatar) {
          estimate.project.client.avatar = await getPresignedUrl(estimate.project.client.avatar);
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

      if (estimate.PdfProject && estimate.PdfProject.length > 0) {
        const pdf = estimate.PdfProject[0];

        if (pdf.uri) {
          pdf.uri = await getPresignedUrl(pdf.uri);
        }
        (estimate as any).PdfProject = pdf;
      } else {
        (estimate as any).PdfProject = null;
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
          user: true,
          client: true,
          company: true,
          serviceProject: true,
          workContext: true
        }
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (status === "rejected") {
        const companyAvatar = project?.company?.avatar ? await getPresignedUrl(project.company.avatar) : "";
        const totalFormatted = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(Number(estimate.totalAmount));

        await sendEmail({
          to: (project?.user?.email && project?.company?.email) || '',
          templateId: "d-d36af97d7db94ef5b417edff70e04b06",
          dynamicTemplateData: {
            recipientName: project?.workContext?.Name || project?.user?.name || "Team Member",
            clientName: project?.workContext?.Name || project?.client?.name || "Customer",
            projectName: project?.serviceProject?.[0]?.name || `Project ${project?.contract_number || ''}`,
            location: project?.workContext?.location || project?.location || "Not specified",
            totalAmount: totalFormatted,
            companyName: project?.company?.name || "SmartBuild",
            companyAvatar: companyAvatar,
            currentYear: new Date().getFullYear().toString(),
            phone: project?.client?.phone || "N/A"
          }
        });
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
          serviceProjects: true,
          project: {
            include: {
              client: true,
              company: true,
              serviceProject: true
            }
          }
        }
      });

      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      if (estimate.serviceProjects.length > 0) {
        await prisma.serviceProject.createMany({
          data: estimate.serviceProjects.map((service) => ({
            name: service.name,
            description: service.description || "",
            hours: service.hours || 0,
            price: service.price || 0,
            id_service: service.id_service || null,
            projectId: estimate.projectId,
            company_id: estimate.project.company_id,
            estimateServiceId: service.id
          }))
        })
      }

      await prisma.estimate.update({
        where: { id },
        data: {
          clientSignature: JSON.stringify({ signature }),
          status: "approved",
          date_update: new Date()
        }
      });

      const pdfProject = await prisma.pdfProject.findFirst({
        where: { estimate_id: estimate.id }
      });

      if (!pdfProject || !pdfProject.uri) {
        return res.status(404).json({ error: "PDF Project not found or has no URI" });
      }

      const pdfUrl = await getPresignedUrl(pdfProject.uri);

      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const pages = pdfDoc.getPages();

      if (signature) {
        try {
          const base64Data = signature.replace(/^data:image\/[a-z]+;base64,/, '');
          const signatureBuffer = Buffer.from(base64Data, 'base64');

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

          const signatureWidth = 100;
          const signatureHeight = 50;

          for (let i = 1; i < pages.length; i++) {
            const page = pages[i];
            const { width, height } = page.getSize();

            const x = (width - signatureWidth) / 2;
            const y = 20;

            page.drawImage(signatureImage, {
              x,
              y,
              width: signatureWidth,
              height: signatureHeight,
            });

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
              y: y - 15,
              size: 8,
              color: rgb(0.5, 0.5, 0.5)
            });
          }
        } catch (signatureError) {
          console.error('Error processing signature:', signatureError);
        }
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);

      const s3 = new S3Client({
        region: process.env.AMAZON_S3_REGION,
        credentials: {
          accessKeyId: process.env.AMAZON_S3_KEY!,
          secretAccessKey: process.env.AMAZON_S3_SECRET!,
        },
      });

      const fileHash = crypto.randomBytes(4).toString("hex");
      const originalFileName = pdfProject.original_file_name || `estimate_${estimate.number}.pdf`;
      const newFileName = `${fileHash}-${originalFileName.replace(/\s/g, "")}`;

      const putObjectCommand = new PutObjectCommand({
        Bucket: process.env.AMAZON_S3_BUCKET!,
        Key: newFileName,
        Body: modifiedPdfBuffer,
        ContentType: 'application/pdf',
      });

      await s3.send(putObjectCommand);

      await prisma.pdfProject.update({
        where: { id: pdfProject.id },
        data: {
          uri: newFileName
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: estimate.projectId },
        include: {
          user: true,
          client: true,
          company: true,
          workContext: true,
          serviceProject: true
        }
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (project.status_project !== "Accepted" &&
        project.status_project !== "Pre-Start" &&
        project.status_project !== "In Progress" &&
        project.status_project !== "Final walkthrough" &&
        project.status_project !== "Finished"
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

      const companyAvatar = project.company?.avatar ? await getPresignedUrl(project.company.avatar) : "";
      const totalFormatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(estimate.totalAmount));

      const commonData = {
        projectName: project.serviceProject?.[0]?.name || `Project ${project.contract_number || ''}`,
        contractNumber: project.contract_number || "N/A",
        location: project.workContext?.location || project.location || "Not specified",
        totalAmount: totalFormatted,
        companyName: project.company?.name || "SmartBuild",
        companyAvatar: companyAvatar,
        currentYear: new Date().getFullYear().toString(),
        estimateNumber: estimate.number,
        approvedDate: new Date().toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
      };

      await Promise.all([
        (async () => {
          if (project.user?.email && project.company?.email) {
            await sendEmail({
              to: (project.user.email && project.company?.email) || '',
              templateId: "d-640a0ff263d24f7b8f53af6581758706",
              dynamicTemplateData: {
                ...commonData,
                recipientName: project.user.name || "Team Member",
                clientName: project.workContext?.Name || project.client?.name || "Customer"
              }
            });
          }
        })(),
        (async () => {
          if (project.client?.email) {
            await sendEmail({
              to: project.client.email,
              templateId: "d-61180196c59a4b599cefc0828aaebdc1",
              dynamicTemplateData: {
                ...commonData,
                recipientName: project.workContext?.Name || project.client?.name || "Customer"
              }
            });
          }
        })(),
        EstimateController.addTimelineEvent(estimate.id, "Approved by client email: " + decodedEmail)
      ]);

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
      const userId = payload?.id;

      if (!userId) {
        return res.status(401).json({
          error: "Failed to cancel estimate"
        });
      }

      const estimateExists = await prisma.estimate.findUnique({
        where: {
          id: id
        },
        select: {
          status: true,
          serviceProjects: true
        }
      })

      if (!estimateExists) {
        return res.status(404).json({
          error: "Estimate not found"
        })
      }

      if (estimateExists.status === "approved") {
        await prisma.$transaction(async (smartbuild) => {
          for (const estimateServiceProject of estimateExists.serviceProjects) {
            const serviceProject = await smartbuild.serviceProject.findFirst({
              where: {
                estimateServiceId: estimateServiceProject.id
              }
            })

            if (serviceProject) {
              await smartbuild.serviceProject.delete({
                where: {
                  id: serviceProject.id
                }
              })
            }
          }

          const estimate = await smartbuild.estimate.update({
            where: { id },
            data: {
              status: "canceled",
              canceledAt: new Date(),
              canceledById: userId,
              cancellationReason,
              date_update: new Date()
            }
          });

          await smartbuild.estimateTimeline.create({
            data: {
              estimate: {
                connect: {
                  id: estimate.id
                }
              },
              description: "Canceled",
              date_creation: new Date()
            }
          });

          return res.status(200).json({
            message: "Estimate canceled successfully"
          })
        })
      } else {
        await prisma.$transaction(async (smartbuild) => {
          const estimate = await smartbuild.estimate.update({
            where: { id },
            data: {
              status: "canceled",
              canceledAt: new Date(),
              canceledById: userId,
              cancellationReason,
              date_update: new Date()
            }
          });

          await smartbuild.estimateTimeline.create({
            data: {
              estimate: {
                connect: {
                  id: estimate.id
                }
              },
              description: "Canceled",
              date_creation: new Date()
            }
          });

          return res.status(200).json({
            message: "Estimate canceled successfully"
          })
        })

      }
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
      const companyAvatar = estimate.project?.company?.avatar ? await getPresignedUrl(estimate.project.company.avatar) : "";
      // Processar todos os emails
      for (const email of emails) {
        try {
          const mailOptions = {
            from: SMTP_CONFIG.user,
            to: email,
            subject: estimate.project?.company?.name + " - Estimate Reminder",
            html: estimateEmail(
              estimate.project?.client?.name || '',
              companyAvatar || "",
              estimate.project?.company?.name || '',
              estimate.number,
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

    const cleanupTempFiles = (files: Express.Multer.File[]) => {
      if (files && files.length > 0) {
        files.forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (error) {
            console.error(`Error deleting temporary file ${file.path}:`, error);
          }
        });
      }
    };

    try {
      const { id } = req.params;
      attachmentFiles = req.files as Express.Multer.File[];

      const {
        from,
        to,
        cc,
        bcc,
        subject,
        body,
        sendMeCopy,
        numberPerson
      } = req.body;

      if (!to) {
        cleanupTempFiles(attachmentFiles);
        return res.status(400).json({ error: "Recipient email is required" });
      }

      const parseEmailList = (emailInput: any): string[] => {
        if (!emailInput) return [];

        if (typeof emailInput === 'string') {
          try {
            if (emailInput.startsWith('[') && emailInput.endsWith(']')) {
              const parsed = JSON.parse(emailInput);
              if (Array.isArray(parsed)) {
                return parsed.filter(email => email && typeof email === 'string').map(email => email.trim());
              }
            }
            return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
          } catch (error) {
            return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
          }
        }

        if (Array.isArray(emailInput)) {
          return emailInput.filter(email => email && typeof email === 'string').map(email => email.trim());
        }

        return [];
      };

      const dataEmail = {
        from: from || '',
        to: parseEmailList(to),
        cc: parseEmailList(cc),
        bcc: parseEmailList(bcc),
        sendMeCopy: sendMeCopy === 'true' || sendMeCopy === true,
        subject: subject || '',
        body: body || ''
      };

      if (!dataEmail.to || dataEmail.to.length === 0) {
        cleanupTempFiles(attachmentFiles);
        return res.status(400).json({ error: "Please provide at least one recipient email address" });
      }

      const estimate = await prisma.estimate.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              client: true,
              company: true,
              serviceProject: true
            }
          }
        }
      });

      if (!estimate) {
        cleanupTempFiles(attachmentFiles);
        return res.status(404).json({ error: "Estimate not found" });
      }

      const pdfProject = await prisma.pdfProject.findFirst({
        where: { estimate_id: estimate.id }
      });
      if (!pdfProject || !pdfProject.uri) {
        cleanupTempFiles(attachmentFiles);
        return res.status(404).json({ error: "PDF Project not found or has no URI" });
      }
      const pdfUrl = await getPresignedUrl(pdfProject.uri);

      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        cleanupTempFiles(attachmentFiles);
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const fileName = pdfProject.original_file_name || `estimate_${estimate.number}.pdf`;

      const results = [];
      const companyAvatar = estimate.project?.company?.avatar ? await getPresignedUrl(estimate.project.company.avatar) : "";

      const allRecipients = [
        ...dataEmail.to,
        ...dataEmail.cc,
        ...dataEmail.bcc
      ];

      if (dataEmail.sendMeCopy && dataEmail.from) {
        allRecipients.push(dataEmail.from);
      }

      const uniqueRecipients = [...new Set(allRecipients.filter(email => email && typeof email === 'string'))];

      try {
        const attachments = [
          {
            filename: fileName,
            content: pdfBuffer.toString('base64'),
            type: 'application/pdf',
            disposition: 'attachment'
          }
        ];

        if (attachmentFiles && attachmentFiles.length > 0) {
          console.log(`📎 Processing ${attachmentFiles.length} attachment(s)...`);
          for (const file of attachmentFiles) {
            try {
              const fileBuffer = fs.readFileSync(file.path);
              attachments.push({
                filename: file.originalname,
                content: fileBuffer.toString('base64'),
                type: file.mimetype,
                disposition: 'attachment'
              });
              console.log(`✅ Processed attachment: ${file.originalname} (${file.mimetype})`);
            } catch (error) {
              console.error(`Error reading attachment file ${file.originalname}:`, error);
            }
          }
        }

        const TEMPLATE_ID = "d-c779b5bb2dc44a98b0428a0c17597a8d";

        const estimateNumber = estimate.number;
        const creationDate = new Date(estimate.date_creation);
        const validUntilDate = new Date(creationDate);
        validUntilDate.setDate(validUntilDate.getDate() + 30);

        const validUntilFormatted = validUntilDate.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });

        const totalFormatted = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(Number(estimate.totalAmount));

        const reviewLink = `${process.env.URL_FRONT}/estimate-response/${estimate.id}/${Buffer.from(estimate.project?.client?.email || '').toString('base64')}`;
        const companyName = estimate.project?.company?.name || 'SmartBuild';
        const projectDispName = estimate.project?.serviceProject?.[0]?.name || `Project ${estimate.project?.contract_number || ''}`;

        const subjectFixed = `Estimate ${estimateNumber} from ${companyName}`;

        for (const recipientEmail of uniqueRecipients) {
          let recipientName = "Customer";
          if (recipientEmail === estimate.project?.client?.email && estimate.project?.client?.name) {
            recipientName = estimate.project.client.name;
          }

          await sendEmail({
            to: recipientEmail,
            subject: subjectFixed,
            templateId: TEMPLATE_ID,
            dynamicTemplateData: {
              recipientName: recipientName,
              projectName: projectDispName,
              estimateNumber: numberPerson || estimateNumber,
              totalAmount: totalFormatted,
              validUntil: validUntilFormatted,
              reviewLink: reviewLink,
              companyName: companyName,
              companyAvatar: companyAvatar,
              currentYear: new Date().getFullYear().toString(),
              recipientEmail: recipientEmail
            },
            attachments: attachments as any
          });

          await prisma.estimateEmailLog.create({
            data: {
              estimate: { connect: { id } },
              recipient: recipientEmail,
              status: "success",
              sentAt: new Date()
            }
          });
          results.push({ email: recipientEmail, status: "success" });
        }

        await EstimateController.addTimelineEvent(
          estimate.id,
          `Email sent to: ${uniqueRecipients.join(', ')}`
        );

        return res.json({
          success: true,
          results
        });

      } catch (error: any) {
        console.error("Error sending estimate email:", error);

        await prisma.estimateEmailLog.create({
          data: {
            estimate: { connect: { id } },
            recipient: uniqueRecipients.join(', '),
            status: "error",
            errorMessage: error.message || "Unknown error",
            sentAt: new Date()
          }
        });

        await EstimateController.addTimelineEvent(
          estimate.id,
          `Failed to send email via Twilio: ${error.message}`
        );

        return res.status(500).json({ error: "Failed to send email", details: error.message });
      } finally {
        cleanupTempFiles(attachmentFiles);
      }
    } catch (error) {
      console.error('❌ Unexpected error in sendEmail:', error);
      if (typeof cleanupTempFiles === 'function') {
        cleanupTempFiles(attachmentFiles);
      }
      return res.status(500).json({ error: "Failed to send estimate email" });
    }
  }

  async generateNumber(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          contract_number: true,
          estimates: {
            select: {
              number: true
            },
            orderBy: {
              date_creation: 'desc'
            }
          }
        }
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (!project.contract_number) {
        return res.status(400).json({ error: "Project does not have a contract number" });
      }

      let nextEstimateNumber = 1;

      if (project.estimates.length > 0) {
        const estimateNumbers = project.estimates
          .map(estimate => {
            const parts = estimate.number.split('/');
            return parts.length > 1 ? Number(parts[1]) : 0;
          })
          .filter(num => !isNaN(num) && num > 0);

        if (estimateNumbers.length > 0) {
          const maxEstimateNumber = Math.max(...estimateNumbers);
          nextEstimateNumber = maxEstimateNumber + 1;
        }
      }
      const fullNumber = `${project.contract_number}-01`;

      return res.json({
        number: fullNumber,
        projectId: projectId
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to generate estimate number" });
    }
  }

  async generateGlobalNumber(req: Request, res: Response) {
    try {
      const { companyId } = req.params;

      console.log('🌐 [EstimateController] Chamando generateGlobalNumber para companyId:', companyId);

      // Validate companyId
      if (!companyId) {
        console.log('❌ [EstimateController] Company ID não fornecido');
        return res.status(400).json({ error: "Company ID is required" });
      }

      // Buscar o último estimate da empresa (independente do projeto)
      const lastEstimate = await prisma.estimate.findFirst({
        where: {
          project: {
            company_id: companyId
          }
        },
        select: {
          number: true
        },
        orderBy: {
          number: 'desc'
        }
      });

      // Buscar o último project da empresa para verificar contract_number
      const lastProject = await prisma.project.findFirst({
        where: {
          company_id: companyId,
          contract_number: { not: null }
        },
        select: {
          contract_number: true
        },
        orderBy: {
          contract_number: 'desc'
        }
      });

      console.log('🔍 [EstimateController] Último estimate encontrado:', lastEstimate);
      console.log('🔍 [EstimateController] Último project encontrado:', lastProject);

      // Comparar os números e usar o maior para manter sincronização
      // Extrair apenas o número do projeto dos estimates (antes da barra)
      let lastEstimateNumber = 0;
      if (lastEstimate?.number) {
        const parts = lastEstimate.number.split('/');
        // Se tem formato projeto/estimate, pegar a primeira parte. Se não, pegar o número inteiro
        lastEstimateNumber = Number(parts[0]) || 0;
        console.log('🔍 [EstimateController] Extraindo do estimate:', lastEstimate.number, '→', parts[0], '→', lastEstimateNumber);
      }

      const lastProjectNumber = Number(lastProject?.contract_number || '0');
      const highestNumber = Math.max(lastEstimateNumber, lastProjectNumber);

      const nextNumber = String(highestNumber + 1).padStart(4, '0');

      console.log('✅ [EstimateController] Números comparados - Estimate:', lastEstimateNumber, 'Project:', lastProjectNumber);
      console.log('✅ [EstimateController] Próximo número gerado:', nextNumber);

      return res.json({
        number: nextNumber,
        companyId: companyId
      });
    } catch (error) {
      console.error('❌ [EstimateController] Erro ao gerar número global:', error);
      return res.status(500).json({ error: "Failed to generate global estimate number" });
    }
  }
} 