import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import axios from "axios";
import crypto from "crypto";
import { Request, Response } from "express";

import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";
import { CustomInvoiceController } from "./CustomInvoiceController";
import { StripeController } from "../stripe/StripeController";
import { UnifiedInvoiceController } from "./UnifiedInvoiceController";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";
import { QuickBooksInvoiceController } from "../quickbooks/invoice/QuickBooksInvoiceController";

const PDFSHIFT_API_URL = "https://api.pdfshift.io/v3/convert/pdf";

type MobileStandaloneCustomInvoicePayload = {
  action: "save" | "createAndSend";
  additionalEmails?: string[];
  amount: {
    fixedValue?: number;
    percentage?: number;
    type: "fixed" | "percentage";
  };
  client: {
    address?: string | null;
    email: string;
    id?: string;
    name: string;
    phone?: string | null;
  };
  companyId: string;
  dateCreation: string;
  description?: string;
  dueDate: string;
  invoiceNumber?: string;
  paymentMethod?: "custom" | "quickbooks" | "stripe";
  pdfTemplate?: "web-professional-invoice";
  sellerUserId: string;
  services: Array<{
    catalogServiceId?: string;
    description?: string;
    lineTotal?: number;
    name: string;
    pos?: number;
    quantity?: number;
    unitPrice?: number;
  }>;
  showPaymentMethods?: boolean;
  workContextId?: string;
};

type NormalizedServiceLine = {
  catalogServiceId?: string;
  description: string;
  lineTotal: number;
  name: string;
  pos: number;
  quantity: number;
  unitPrice: number;
};

type InvoicePdfInput = {
  amountPaid?: number;
  apiBalanceDue?: number;
  balanceDue?: number;
  client: {
    address?: string | null;
    email?: string | null;
    name: string;
    phone?: string | null;
  };
  company: {
    address?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
    name: string;
    phone?: string | null;
    webSiteUrl?: string | null;
  };
  dateCreation: Date;
  description?: string | null;
  dueDate: Date;
  extraWork?: number;
  invoiceAmount: number;
  invoiceNumber: string;
  invoiceType: string;
  invoicePaymentTimeline?: Array<{
    date_creation: Date | string;
    date_update?: Date | string;
    description: string;
    estimateId?: string | null;
    id: string;
    projectId?: string | null;
  }>;
  isPaid?: boolean;
  services: NormalizedServiceLine[];
  showPaymentMethods: boolean;
  totalInvoice: number;
  workContext?: {
    address?: string | null;
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
};

export class MobileStandaloneCustomInvoiceController {
  private customInvoiceController: CustomInvoiceController;
  private quickBooksController: QuickBooksInvoiceController;
  private stripeController: StripeController;
  private unifiedInvoiceController: UnifiedInvoiceController;

  constructor() {
    this.customInvoiceController = new CustomInvoiceController();
    this.quickBooksController = new QuickBooksInvoiceController();
    this.stripeController = new StripeController();
    this.unifiedInvoiceController = new UnifiedInvoiceController();
  }

  async handle(req: Request, res: Response) {
    const payload = req.body as MobileStandaloneCustomInvoicePayload;

    try {
      const validationError = validatePayload(payload);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const services = normalizeServices(payload.services);
      if (services.length === 0) {
        return res.status(400).json({ error: "At least one valid service is required" });
      }

      const company = await prisma.company.findUnique({
        where: { id: payload.companyId },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const seller = await prisma.user.findFirst({
        where: {
          id: payload.sellerUserId,
        },
        select: {
          email: true,
          id: true,
          name: true,
        },
      });

      if (!seller) {
        return res.status(404).json({ error: "Seller user not found" });
      }

      const workContext = payload.workContextId
        ? await prisma.workContext.findFirst({
            where: {
              companyId: payload.companyId,
              id: payload.workContextId,
              isActive: true,
            },
          })
        : null;

      if (payload.workContextId && !workContext) {
        return res.status(404).json({ error: "Work context not found" });
      }

      const servicesTotal = roundCurrency(
        services.reduce((sum, service) => sum + service.lineTotal, 0),
      );
      const { coefficient, invoiceAmount, typeValue } = computeInvoiceAmount(payload.amount, servicesTotal);
      const invoiceNumber = await getNextInvoiceNumber(payload.companyId, payload.invoiceNumber);
      const projectNumber = await getNextProjectNumber(payload.companyId);
      const estimateNumber = `${projectNumber}-01`;
      const dateCreation = normalizeDate(payload.dateCreation);
      const dueDate = normalizeDate(payload.dueDate);
      const showPaymentMethods = payload.showPaymentMethods !== false;
      const companyAvatarUrl = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
      const companyAddress = formatCompanyAddress(company);
      const workContextDetails = workContext
        ? {
            address: workContext.addressOffice || workContext.location || "",
            email: workContext.Email || "",
            name: workContext.Name || workContext.label || "",
            phone: workContext.phone || "",
          }
        : null;

      const pdfInput: InvoicePdfInput = {
        client: {
          address: payload.client.address || "",
          email: payload.client.email,
          name: payload.client.name,
          phone: payload.client.phone || "",
        },
        company: {
          address: companyAddress,
          avatarUrl: companyAvatarUrl,
          email: company.email || "",
          name: company.name,
          phone: company.phone || "",
          webSiteUrl: company.webSiteUrl || "",
        },
        dateCreation,
        description: payload.description || "",
        dueDate,
        invoiceAmount,
        invoiceNumber,
        invoiceType: "custom",
        services,
        showPaymentMethods,
        totalInvoice: servicesTotal,
        workContext: workContextDetails,
      };

      const normalPdfBuffer = await generatePdfBuffer(buildProfessionalInvoiceHtml(pdfInput));
      const paidPdfBuffer = await generatePdfBuffer(buildProfessionalInvoiceHtml({ ...pdfInput, isPaid: true }));
      const pdfFileName = `Invoice_${safeFileSegment(payload.client.name)}_${invoiceNumber}.pdf`;
      const paidPdfFileName = `Invoice_${safeFileSegment(payload.client.name)}_${invoiceNumber}_PAID.pdf`;
      const [pdfS3Key, paidPdfS3Key] = await Promise.all([
        uploadBufferToS3(normalPdfBuffer, pdfFileName, "application/pdf"),
        uploadBufferToS3(paidPdfBuffer, paidPdfFileName, "application/pdf"),
      ]);

      const result = await prisma.$transaction(async (tx) => {
        let client = payload.client.id
          ? await tx.client.findFirst({
              where: {
                company_id: payload.companyId,
                id: payload.client.id,
              },
            })
          : null;

        if (!client) {
          client = await tx.client.findUnique({
            where: {
              email_company_id: {
                company_id: payload.companyId,
                email: payload.client.email,
              },
            },
          });
        }

        if (client) {
          client = await tx.client.update({
            where: { id: client.id },
          data: {
              addressOffice: payload.client.address || undefined,
              name: payload.client.name,
              phone: payload.client.phone || "",
            },
          });
        } else {
          client = await tx.client.create({
            data: {
              company_id: payload.companyId,
              email: payload.client.email,
              name: payload.client.name,
              addressOffice: payload.client.address || "",
              phone: payload.client.phone || "",
            },
          });
        }

        const project = await tx.project.create({
          data: {
            balanceDue: servicesTotal,
            client_id: client.id,
            company_id: payload.companyId,
            contract_number: projectNumber,
            lat: workContext?.latitude?.toString() || "",
            location: workContext?.addressOffice || workContext?.location || client.addressOffice || client.location || "",
            log: workContext?.longitude?.toString() || "",
            price: servicesTotal,
            radius: workContext?.radius || client.radius || null,
            seller_user_id: payload.sellerUserId,
            status_project: "Pending",
            workContextId: workContext?.id || null,
          },
        });

        const serviceProjects = [];
        for (const service of services) {
          const serviceProject = await tx.serviceProject.create({
            data: {
              company_id: payload.companyId,
              description: service.description || "",
              hours: service.quantity,
              id_service: service.catalogServiceId || null,
              name: service.name,
              price: service.unitPrice,
              projectId: project.id,
            },
          });
          serviceProjects.push({ input: service, serviceProject });
        }

        const invoice = await tx.invoice.create({
          data: {
            companyId: payload.companyId,
            createdAt: dateCreation,
            description: payload.description || "",
            dueDate,
            externalInvoiceId: invoiceNumber,
            invoiceType: "custom",
            isStandaloneInvoice: true,
            multi_emails: normalizeEmailList(payload.additionalEmails).join(","),
            percentageCoefficient: coefficient,
            projectId: project.id,
            showPaymentMethods,
            status: "open",
            totalAmount: invoiceAmount,
            type_invoicebase: "project",
            type_value: typeValue,
            user_id: payload.sellerUserId,
          },
        });

        await tx.invoiceItem.createMany({
          data: services.map((service) => ({
            description: service.description,
            invoiceId: invoice.id,
            name: service.name,
            price: service.unitPrice,
            quantity: service.quantity,
            totalAmount: roundCurrency(service.lineTotal * coefficient),
          })),
        });

        const pdfProject = await tx.pdfProject.create({
          data: {
            invoice_id: invoice.id,
            original_file_name: pdfFileName,
            project_id: project.id,
            templateNumber: 1,
            type_pdf: "invoice",
            uri: pdfS3Key,
          },
        });

        const paidPdfProject = await tx.pdfInvoicePaid.create({
          data: {
            invoiceId: invoice.id,
            original_file_name: paidPdfFileName,
            uri: paidPdfS3Key,
          },
        });

        const estimate = await tx.estimate.create({
          data: {
            amountPaid: 0,
            approvedAt: dateCreation,
            assignatureRequired: true,
            balanceDue: servicesTotal,
            date_creation: dateCreation,
            description: payload.description || "",
            finalAmount: servicesTotal,
            isStandaloneEstimate: true,
            multi_emails: "",
            number: estimateNumber,
            project: {
              connect: { id: project.id },
            },
            status: "approved",
            terms: "",
            totalAmount: servicesTotal,
            type_estimate: "estimateProject",
          },
        });

        await tx.pdfProject.update({
          where: { id: pdfProject.id },
          data: {
            estimate_id: estimate.id,
          },
        });

        for (const [index, item] of serviceProjects.entries()) {
          await tx.estimateServiceProject.create({
            data: {
              description: item.input.description,
              estimateId: estimate.id,
              hours: item.input.quantity,
              id_service: item.input.catalogServiceId || null,
              lineTotal: item.input.lineTotal,
              name: item.input.name,
              originalLineTotal: item.input.lineTotal,
              originalUnitPrice: item.input.unitPrice,
              pos: index,
              price: item.input.unitPrice,
              quantity: item.input.quantity,
              serviceProject: {
                connect: { id: item.serviceProject.id },
              },
              unitPrice: item.input.unitPrice,
            },
          });
        }

        await tx.invoiceTimeline.create({
          data: {
            description: `Created with total amount $${invoiceAmount.toFixed(2)}`,
            invoice: {
              connect: { id: invoice.id },
            },
          },
        });

        await tx.estimateTimeline.create({
          data: {
            description: "Standalone estimate created from mobile custom invoice",
            estimate: {
              connect: { id: estimate.id },
            },
          },
        });

        return {
          client,
          estimate,
          invoice,
          paidPdfProject,
          pdfProject,
          project,
        };
      });

      let quickBooksResult = null;
      let quickBooksError: string | null = null;

      try {
        const quickBooksConfig = await prisma.quickBooksConfig.findUnique({
          where: {
            configType_companyId: {
              companyId: payload.companyId,
              configType: "INVOICE_CREATION",
            },
          },
        });

        if (quickBooksConfig?.isActive) {
          const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: payload.companyId },
          });

          if (quickBooksAccount) {
            quickBooksResult = await this.quickBooksController.createInvoiceInternal({
              calledFromStripe: true,
              coefficientPerfentage: coefficient,
              date_creation: payload.dateCreation,
              description: payload.description || `Invoice for Project ${projectNumber}`,
              dueDate: payload.dueDate,
              isStandaloneInvoice: true,
              projectId: result.project.id,
              services: services.map((service) => ({
                description: service.description,
                name: service.name,
                price: service.unitPrice,
                quantity: service.quantity,
                total: service.lineTotal,
              })),
              showPaymentMethods,
              totalAmountTarget: invoiceAmount,
              type_invoicebase: "project",
              type_value: typeValue,
              userId: payload.sellerUserId,
            });

            if (quickBooksResult?.quickbooksId) {
              await prisma.invoice.update({
                where: { id: result.invoice.id },
                data: {
                  docNumberQuickBooksContabio: quickBooksResult.docNumber || null,
                  idQuickbookContabio: quickBooksResult.quickbooksId,
                  qboCustomerRef: quickBooksResult.qboCustomerRef || null,
                },
              });
            }

            await prisma.invoiceTimeline.create({
              data: {
                description: `QuickBooks invoice created successfully (ID: ${quickBooksResult?.quickbooksId}, DocNumber: ${quickBooksResult?.docNumber})`,
                invoice: { connect: { id: result.invoice.id } },
              },
            });
          } else {
            await prisma.invoiceTimeline.create({
              data: {
                description: "QuickBooks invoice creation skipped (no QuickBooks account connected)",
                invoice: { connect: { id: result.invoice.id } },
              },
            });
          }
        } else {
          await prisma.invoiceTimeline.create({
            data: {
              description: "QuickBooks invoice creation skipped (feature disabled in company settings)",
              invoice: { connect: { id: result.invoice.id } },
            },
          });
        }
      } catch (error: any) {
        quickBooksError = error?.message || "Unknown QuickBooks error";
        await prisma.invoiceTimeline.create({
          data: {
            description: `Failed to create QuickBooks invoice: ${quickBooksError}`,
            invoice: { connect: { id: result.invoice.id } },
          },
        });
      }

      fireAndForgetUpsertEstimateToQBO(payload.companyId, (req as any).userId, result.estimate.id);

      let emailSent = false;
      if (payload.action === "createAndSend") {
        emailSent = await sendInvoiceEmail({
          additionalEmails: payload.additionalEmails || [],
          clientEmail: workContext?.Email || payload.client.email,
          clientName: workContext?.Name || payload.client.name,
          company: {
            avatar: company.avatar,
            email: company.email,
            id: company.id,
            name: company.name,
          },
          dueDate,
          invoiceAmount,
          invoiceDbId: result.invoice.id,
          invoiceNumber,
          pdfBuffer: normalPdfBuffer,
          pdfFileName,
          projectNumber,
          userId: payload.sellerUserId,
        });
      }

      return res.status(201).json({
        emailSent,
        estimateId: result.estimate.id,
        invoiceId: result.invoice.id,
        number: invoiceNumber,
        paidPdfProjectId: result.paidPdfProject.id,
        pdfProjectId: result.pdfProject.id,
        projectId: result.project.id,
        quickBooks: {
          error: quickBooksError,
          result: quickBooksResult,
          success: !!quickBooksResult,
        },
      });
    } catch (error: any) {
      console.error("[MobileStandaloneCustomInvoice] Error:", error);
      return res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  }

  async handleProject(req: Request, res: Response) {
    const { projectId } = req.params;

    try {
      const payload = {
        ...req.body,
        invoiceType: normalizeInvoiceType(req.body?.invoiceType),
        isStandaloneInvoice: false,
        type_invoicebase: "project",
      };
      const delegatedReq = withRequestOverrides(req, { body: payload, params: { ...req.params, projectId } });
      const delegatedRes = createCapturedResponse();

      await this.unifiedInvoiceController.createInvoice(delegatedReq, delegatedRes.response);

      if (delegatedRes.statusCode >= 400) {
        return res.status(delegatedRes.statusCode).json(delegatedRes.body || { error: "Could not create invoice" });
      }

      const invoiceId = getInvoiceIdFromControllerResponse(delegatedRes.body);
      if (!invoiceId) {
        return res.status(500).json({ error: "Invoice was created but the response did not include an invoice id." });
      }

      const pdfResult = await generateAndAttachMobileProjectInvoicePdf(invoiceId, payload);
      const emailSent = payload.action === "createAndSend"
        ? await sendProjectInvoiceEmailFromPdf({
            invoice: pdfResult.invoice,
            normalPdfBuffer: pdfResult.normalPdfBuffer,
            normalPdfFileName: pdfResult.normalPdfFileName,
            payload,
          })
        : false;

      return res.status(delegatedRes.statusCode || 201).json({
        ...delegatedRes.body,
        emailSent,
        invoice: pdfResult.invoice,
        paidPdfProjectId: pdfResult.paidPdfProject.id,
        pdfProjectId: pdfResult.pdfProject.id,
        projectId: pdfResult.invoice.projectId,
      });
    } catch (error: any) {
      console.error("[MobileProjectInvoice:create] Error:", error);
      return res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  }

  async updateProject(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const existingInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { invoiceType: true },
      });

      if (!existingInvoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const payload = {
        ...req.body,
        invoiceType: normalizeInvoiceType(req.body?.invoiceType || existingInvoice.invoiceType),
        isStandaloneInvoice: false,
        type_invoicebase: "project",
      };
      const delegatedReq = withRequestOverrides(req, { body: payload, params: { ...req.params, invoiceId } });
      const delegatedRes = createCapturedResponse();

      if (payload.invoiceType === "quickbooks") {
        await this.quickBooksController.updateInvoice(delegatedReq, delegatedRes.response);
      } else if (payload.invoiceType === "custom") {
        await this.customInvoiceController.updateInvoice(delegatedReq, delegatedRes.response);
      } else {
        await this.stripeController.updateInvoice(delegatedReq, delegatedRes.response);
      }

      if (delegatedRes.statusCode >= 400) {
        return res.status(delegatedRes.statusCode).json(delegatedRes.body || { error: "Could not update invoice" });
      }

      const pdfResult = await generateAndAttachMobileProjectInvoicePdf(invoiceId, payload);
      const emailSent = payload.action === "createAndSend"
        ? await sendProjectInvoiceEmailFromPdf({
            invoice: pdfResult.invoice,
            normalPdfBuffer: pdfResult.normalPdfBuffer,
            normalPdfFileName: pdfResult.normalPdfFileName,
            payload,
          })
        : false;

      return res.status(delegatedRes.statusCode || 200).json({
        ...delegatedRes.body,
        emailSent,
        invoice: pdfResult.invoice,
        paidPdfProjectId: pdfResult.paidPdfProject.id,
        pdfProjectId: pdfResult.pdfProject.id,
        projectId: pdfResult.invoice.projectId,
      });
    } catch (error: any) {
      console.error("[MobileProjectInvoice:update] Error:", error);
      return res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  }

  async getForEdit(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          InvoiceItems: true,
          project: {
            include: {
              client: true,
              company: true,
              workContext: true,
            },
          },
        },
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Only custom invoices can be edited in the mobile builder." });
      }

      const project = invoice.project;
      const client = project?.client;
      const workContext = project?.workContext;
      const servicesTotal = invoice.InvoiceItems.reduce(
        (sum, item) => sum + Number(item.totalAmount || 0),
        0,
      );
      const typeValue = invoice.type_value === "value" ? "fixed" : "percentage";
      const coefficient = Number(invoice.percentageCoefficient || 0);

      return res.json({
        amount: {
          fixedValue: typeValue === "fixed" ? Number(invoice.totalAmount || 0) : undefined,
          percentage: typeValue === "percentage" ? roundPrecision((coefficient || 1) * 100, 2) : undefined,
          type: typeValue,
        },
        client: {
          address: client?.addressOffice || project?.location || "",
          email: client?.email || "",
          id: client?.id || "",
          name: client?.name || "",
          phone: client?.phone || "",
        },
        companyId: invoice.companyId || project?.company_id || "",
        dateCreation: invoice.createdAt,
        description: invoice.description || "",
        dueDate: invoice.dueDate,
        invoiceId: invoice.id,
        invoiceNumber: invoice.externalInvoiceId || "",
        paymentMethod: "custom",
        projectId: invoice.projectId,
        services: invoice.InvoiceItems.map((item, index) => ({
          description: item.description || "",
          lineTotal: Number(item.totalAmount || 0),
          name: item.name || "Service",
          pos: index + 1,
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.price || 0),
        })),
        servicesTotal: roundCurrency(servicesTotal),
        showPaymentMethods: invoice.showPaymentMethods !== false,
        status: invoice.status,
        workContextId: workContext?.id || null,
      });
    } catch (error: any) {
      console.error("[MobileStandaloneCustomInvoice:getForEdit] Error:", error);
      return res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  }

  async update(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const payload = req.body as MobileStandaloneCustomInvoicePayload;

    try {
      const validationError = validatePayload(payload);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const existingInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          InvoiceItems: true,
          PdfProject: true,
          pdfInvoicePaids: true,
          project: {
            include: {
              client: true,
              company: true,
              workContext: true,
            },
          },
        },
      });

      if (!existingInvoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (existingInvoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Only custom invoices can be edited in the mobile builder." });
      }

      if (["paid", "void"].includes(String(existingInvoice.status || "").toLowerCase())) {
        return res.status(400).json({ error: "Paid or void invoices cannot be edited." });
      }

      const services = normalizeServices(payload.services);
      if (services.length === 0) {
        return res.status(400).json({ error: "At least one valid service is required" });
      }

      const company = await prisma.company.findUnique({
        where: { id: payload.companyId },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const seller = await prisma.user.findFirst({
        where: { id: payload.sellerUserId },
        select: { email: true, id: true, name: true },
      });

      if (!seller) {
        return res.status(404).json({ error: "Seller user not found" });
      }

      const workContext = payload.workContextId
        ? await prisma.workContext.findFirst({
            where: {
              companyId: payload.companyId,
              id: payload.workContextId,
              isActive: true,
            },
          })
        : null;

      if (payload.workContextId && !workContext) {
        return res.status(404).json({ error: "Work context not found" });
      }

      const servicesTotal = roundCurrency(
        services.reduce((sum, service) => sum + service.lineTotal, 0),
      );
      const { coefficient, invoiceAmount, typeValue } = computeInvoiceAmount(payload.amount, servicesTotal);
      const invoiceNumber = payload.invoiceNumber || existingInvoice.externalInvoiceId || "";
      const projectNumber = existingInvoice.project?.contract_number || Number.parseInt(invoiceNumber, 10) || 0;
      const dateCreation = normalizeDate(payload.dateCreation);
      const dueDate = normalizeDate(payload.dueDate);
      const showPaymentMethods = payload.showPaymentMethods !== false;
      const companyAvatarUrl = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
      const companyAddress = formatCompanyAddress(company);
      const workContextDetails = workContext
        ? {
            address: workContext.addressOffice || workContext.location || "",
            email: workContext.Email || "",
            name: workContext.Name || workContext.label || "",
            phone: workContext.phone || "",
          }
        : null;

      const pdfInput: InvoicePdfInput = {
        client: {
          address: payload.client.address || "",
          email: payload.client.email,
          name: payload.client.name,
          phone: payload.client.phone || "",
        },
        company: {
          address: companyAddress,
          avatarUrl: companyAvatarUrl,
          email: company.email || "",
          name: company.name,
          phone: company.phone || "",
          webSiteUrl: company.webSiteUrl || "",
        },
        dateCreation,
        description: payload.description || "",
        dueDate,
        invoiceAmount,
        invoiceNumber,
        invoiceType: "custom",
        services,
        showPaymentMethods,
        totalInvoice: servicesTotal,
        workContext: workContextDetails,
      };

      const normalPdfBuffer = await generatePdfBuffer(buildProfessionalInvoiceHtml(pdfInput));
      const paidPdfBuffer = await generatePdfBuffer(buildProfessionalInvoiceHtml({ ...pdfInput, isPaid: true }));
      const pdfFileName = `Invoice_${safeFileSegment(payload.client.name)}_${invoiceNumber}.pdf`;
      const paidPdfFileName = `Invoice_${safeFileSegment(payload.client.name)}_${invoiceNumber}_PAID.pdf`;
      const [pdfS3Key, paidPdfS3Key] = await Promise.all([
        uploadBufferToS3(normalPdfBuffer, pdfFileName, "application/pdf"),
        uploadBufferToS3(paidPdfBuffer, paidPdfFileName, "application/pdf"),
      ]);

      const result = await prisma.$transaction(async (tx) => {
        const client = payload.client.id
          ? await tx.client.update({
              where: { id: payload.client.id },
              data: {
                addressOffice: payload.client.address || undefined,
                email: payload.client.email,
                name: payload.client.name,
                phone: payload.client.phone || undefined,
              },
            })
          : await tx.client.create({
              data: {
                addressOffice: payload.client.address || "",
                company_id: payload.companyId,
                email: payload.client.email,
                lat: "",
                location: payload.client.address || "",
                log: "",
                name: payload.client.name,
                phone: payload.client.phone || "",
              },
            });

        const project = await tx.project.update({
          where: { id: existingInvoice.projectId },
          data: {
            balanceDue: servicesTotal,
            client_id: client.id,
            company_id: payload.companyId,
            lat: workContext?.latitude?.toString() || "",
            location: workContext?.addressOffice || workContext?.location || client.addressOffice || client.location || "",
            log: workContext?.longitude?.toString() || "",
            price: servicesTotal,
            radius: workContext?.radius || client.radius || null,
            seller_user_id: payload.sellerUserId,
            workContextId: workContext?.id || null,
          },
        });

        await tx.serviceProject.deleteMany({
          where: { projectId: project.id },
        });

        const serviceProjects = await Promise.all(
          services.map((service) =>
            tx.serviceProject.create({
              data: {
                company_id: payload.companyId,
                description: service.description,
                hours: service.quantity,
                id_service: service.catalogServiceId || null,
                name: service.name,
                price: service.unitPrice,
                projectId: project.id,
                status: "Approved",
              },
            }),
          ),
        );

        const invoice = await tx.invoice.update({
          where: { id: existingInvoice.id },
          data: {
            companyId: payload.companyId,
            createdAt: dateCreation,
            description: payload.description || "",
            dueDate,
            externalInvoiceId: invoiceNumber,
            invoiceType: "custom",
            percentageCoefficient: coefficient,
            project_manager_id: undefined,
            showPaymentMethods,
            totalAmount: invoiceAmount,
            type_value: typeValue,
            updatedAt: new Date(),
            user_id: payload.sellerUserId,
          },
        });

        await tx.invoiceItem.deleteMany({
          where: { invoiceId: invoice.id },
        });

        await tx.invoiceItem.createMany({
          data: services.map((service) => ({
            description: service.description,
            invoiceId: invoice.id,
            name: service.name,
            price: service.unitPrice,
            quantity: service.quantity,
            totalAmount: service.lineTotal,
          })),
        });

        const pdfProject = existingInvoice.PdfProject[0]
          ? await tx.pdfProject.update({
              where: { id: existingInvoice.PdfProject[0].id },
              data: {
                original_file_name: pdfFileName,
                project_id: project.id,
                templateNumber: 1,
                type_pdf: "invoice",
                uri: pdfS3Key,
              },
            })
          : await tx.pdfProject.create({
              data: {
                invoice_id: invoice.id,
                original_file_name: pdfFileName,
                project_id: project.id,
                templateNumber: 1,
                type_pdf: "invoice",
                uri: pdfS3Key,
              },
            });

        const paidPdfProject = await tx.pdfInvoicePaid.upsert({
          create: {
            invoiceId: invoice.id,
            original_file_name: paidPdfFileName,
            uri: paidPdfS3Key,
          },
          update: {
            original_file_name: paidPdfFileName,
            uri: paidPdfS3Key,
          },
          where: { invoiceId: invoice.id },
        });

        await tx.invoiceTimeline.create({
          data: {
            description: `Invoice updated from mobile. Total amount ${formatCurrency(invoiceAmount)}.`,
            invoice: { connect: { id: invoice.id } },
          },
        });

        return { invoice, paidPdfProject, pdfProject, project, serviceProjects };
      });

      let emailSent = false;
      if (payload.action === "createAndSend") {
        emailSent = await sendInvoiceEmail({
          additionalEmails: payload.additionalEmails || [],
          clientEmail: workContext?.Email || payload.client.email,
          clientName: workContext?.Name || payload.client.name,
          company: {
            avatar: company.avatar,
            email: company.email,
            id: company.id,
            name: company.name,
          },
          dueDate,
          invoiceAmount,
          invoiceDbId: result.invoice.id,
          invoiceNumber,
          pdfBuffer: normalPdfBuffer,
          pdfFileName,
          projectNumber,
          userId: payload.sellerUserId,
        });
      }

      return res.json({
        emailSent,
        invoiceId: result.invoice.id,
        number: invoiceNumber,
        paidPdfProjectId: result.paidPdfProject.id,
        pdfProjectId: result.pdfProject.id,
        projectId: result.project.id,
      });
    } catch (error: any) {
      console.error("[MobileStandaloneCustomInvoice:update] Error:", error);
      return res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  }
}

type CapturedResponse = {
  body: any;
  response: Response;
  statusCode: number;
};

function createCapturedResponse(): CapturedResponse {
  const captured: CapturedResponse = {
    body: null,
    response: {} as Response,
    statusCode: 200,
  };

  const response = {
    header: () => response,
    json: (body: any) => {
      captured.body = body;
      return response;
    },
    send: (body: any) => {
      captured.body = body;
      return response;
    },
    set: () => response,
    setHeader: () => response,
    status: (statusCode: number) => {
      captured.statusCode = statusCode;
      return response;
    },
  };

  captured.response = response as unknown as Response;
  return captured;
}

function withRequestOverrides(req: Request, overrides: { body?: any; params?: Record<string, any> }) {
  const delegatedReq = Object.create(req) as Request;
  delegatedReq.body = overrides.body ?? req.body;
  delegatedReq.params = overrides.params ?? req.params;
  (delegatedReq as any).userId = (req as any).userId;
  return delegatedReq;
}

function getInvoiceIdFromControllerResponse(body: any) {
  return body?.invoice?.id || body?.databaseInvoice?.id || body?.invoiceId || body?.id || null;
}

function normalizeInvoiceType(invoiceType?: string | null) {
  if (invoiceType === "quickbooks" || invoiceType === "custom") return invoiceType;
  return "stripe";
}

async function generateAndAttachMobileProjectInvoicePdf(invoiceId: string, payload: any) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      InvoiceItems: true,
      PdfProject: true,
      company: true,
      pdfInvoicePaids: true,
      project: {
        include: {
          InvoicePaymentTimeLine: true,
          client: true,
          company: true,
          serviceProject: true,
          workContext: true,
        },
      },
    },
  });

  if (!invoice || !invoice.project || !invoice.project.client || !invoice.project.company) {
    throw new Error("Invoice, project, company, or client not found for PDF generation.");
  }

  const services = normalizeProjectInvoicePdfServices(payload.services, invoice.InvoiceItems);
  if (!services.length) {
    throw new Error("At least one valid service is required for PDF generation.");
  }

  const company = invoice.project.company;
  const client = invoice.project.client;
  const workContext = invoice.project.workContext;
  const invoiceAmount = Number(invoice.totalAmount || payload.totalAmount || 0);
  const servicesTotal = roundCurrency(services.reduce((sum, service) => sum + Number(service.lineTotal || 0), 0));
  const projectPrice = roundCurrency(Number(invoice.project.price || 0));
  const currentProjectAmountPaid = roundCurrency(Number(invoice.project.amountPaid || 0));
  const amountPaidBeforeCurrentInvoice = roundCurrency(
    Math.max(0, currentProjectAmountPaid >= invoiceAmount ? currentProjectAmountPaid - invoiceAmount : currentProjectAmountPaid),
  );
  const fallbackApiBalanceDue = projectPrice > 0
    ? roundCurrency(Math.max(0, projectPrice - amountPaidBeforeCurrentInvoice))
    : roundCurrency(Number(invoice.project.balanceDue ?? servicesTotal));
  const apiBalanceDue = roundCurrency(getFiniteNumber(payload.apiBalanceDue, fallbackApiBalanceDue));
  const extraWork = roundCurrency(getFiniteNumber(payload.extraWork, Math.max(0, invoiceAmount - apiBalanceDue)));
  const amountPaid = roundCurrency(getFiniteNumber(payload.amountPaid, amountPaidBeforeCurrentInvoice));
  const paymentTimeline = Array.isArray(invoice.project.InvoicePaymentTimeLine)
    ? invoice.project.InvoicePaymentTimeLine
    : [];
  const companyAvatarUrl = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
  const companyAddress = formatCompanyAddress(company);
  const dateCreation = payload.date_creation ? normalizeDate(payload.date_creation) : invoice.createdAt;
  const dueDate = payload.dueDate ? normalizeDate(payload.dueDate) : invoice.dueDate || new Date();
  const invoiceNumber = invoice.externalInvoiceId || payload.invoiceNumber || invoice.id;
  const showPaymentMethods = payload.showPaymentMethods !== false;
  const pdfInput: InvoicePdfInput = {
    amountPaid,
    apiBalanceDue,
    balanceDue: invoiceAmount,
    client: {
      address: client.addressOffice || client.location || invoice.project.location || "",
      email: client.email || "",
      name: client.name || "Client",
      phone: client.phone || "",
    },
    company: {
      address: companyAddress,
      avatarUrl: companyAvatarUrl,
      email: company.email || "",
      name: company.name,
      phone: company.phone || "",
      webSiteUrl: company.webSiteUrl || "",
    },
    dateCreation,
    description: payload.description || invoice.description || "",
    dueDate,
    extraWork,
    invoiceAmount,
    invoiceNumber,
    invoiceType: normalizeInvoiceType(invoice.invoiceType),
    invoicePaymentTimeline: paymentTimeline.map((payment) => ({
      date_creation: payment.date_creation,
      date_update: payment.date_update,
      description: payment.description,
      estimateId: payment.estimateId,
      id: payment.id,
      projectId: payment.projectId,
    })),
    services,
    showPaymentMethods,
    totalInvoice: apiBalanceDue > 0 ? apiBalanceDue : servicesTotal,
    workContext: workContext
      ? {
          address: workContext.addressOffice || workContext.location || "",
          email: workContext.Email || "",
          name: workContext.Name || workContext.label || "",
          phone: workContext.phone || "",
        }
      : null,
  };

  const normalPdfBuffer = await generatePdfBuffer(buildProfessionalInvoiceHtml(pdfInput));
  const paidPdfBuffer = await generatePdfBuffer(buildProfessionalInvoiceHtml({ ...pdfInput, isPaid: true }));
  const normalPdfFileName = `Invoice_${safeFileSegment(client.name || "Client")}_${invoiceNumber}.pdf`;
  const paidPdfFileName = `Invoice_${safeFileSegment(client.name || "Client")}_${invoiceNumber}_PAID.pdf`;
  const [pdfS3Key, paidPdfS3Key] = await Promise.all([
    uploadBufferToS3(normalPdfBuffer, normalPdfFileName, "application/pdf"),
    uploadBufferToS3(paidPdfBuffer, paidPdfFileName, "application/pdf"),
  ]);

  const existingPdfProject = await prisma.pdfProject.findFirst({
    where: { invoice_id: invoice.id },
  });
  const pdfProject = existingPdfProject
    ? await prisma.pdfProject.update({
        where: { id: existingPdfProject.id },
        data: {
          original_file_name: normalPdfFileName,
          project_id: invoice.projectId,
          templateNumber: 1,
          type_pdf: "invoice",
          uri: pdfS3Key,
        },
      })
    : await prisma.pdfProject.create({
        data: {
          invoice_id: invoice.id,
          original_file_name: normalPdfFileName,
          project_id: invoice.projectId,
          templateNumber: 1,
          type_pdf: "invoice",
          uri: pdfS3Key,
        },
      });

  const paidPdfProject = await prisma.pdfInvoicePaid.upsert({
    create: {
      invoiceId: invoice.id,
      original_file_name: paidPdfFileName,
      uri: paidPdfS3Key,
    },
    update: {
      original_file_name: paidPdfFileName,
      uri: paidPdfS3Key,
    },
    where: { invoiceId: invoice.id },
  });

  await prisma.invoiceTimeline.create({
    data: {
      description: "Mobile invoice PDF generated successfully",
      invoice: { connect: { id: invoice.id } },
    },
  });

  const refreshedInvoice = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    include: {
      InvoiceItems: true,
      InvoiceTimeline: true,
      PdfProject: true,
      PaymentIntents: true,
      company: true,
      payment: true,
      paymentApplications: true,
      pdfInvoicePaids: true,
      project: {
        include: {
          InvoicePaymentTimeLine: true,
          client: true,
          company: true,
          workContext: true,
        },
      },
    },
  });

  return {
    invoice: refreshedInvoice || invoice,
    normalPdfBuffer,
    normalPdfFileName,
    paidPdfProject,
    pdfProject,
  };
}

function normalizeProjectInvoicePdfServices(rawServices: any[] | undefined, invoiceItems: any[]): NormalizedServiceLine[] {
  const source = Array.isArray(rawServices) && rawServices.length ? rawServices : invoiceItems;

  return source
    .map((service, index) => {
      const quantity = Math.max(1, Number(service.quantity || 1));
      const unitPrice = Math.max(0, Number(service.price ?? service.unitPrice ?? 0));
      const computedLineTotal = roundCurrency(quantity * unitPrice);
      const lineTotal = roundCurrency(Number(service.totalAmount ?? service.total ?? service.lineTotal ?? computedLineTotal));

      return {
        catalogServiceId: service.catalogServiceId || service.id_service || undefined,
        description: String(service.description || "").trim(),
        lineTotal,
        name: String(service.name || "Service").trim(),
        pos: Number.isFinite(Number(service.pos)) ? Number(service.pos) : index,
        quantity,
        unitPrice,
      };
    })
    .filter((service) => service.name && service.quantity > 0 && service.unitPrice >= 0 && service.lineTotal > 0)
    .sort((a, b) => a.pos - b.pos);
}

async function sendProjectInvoiceEmailFromPdf({
  invoice,
  normalPdfBuffer,
  normalPdfFileName,
  payload,
}: {
  invoice: any;
  normalPdfBuffer: Buffer;
  normalPdfFileName: string;
  payload: any;
}) {
  const project = invoice.project;
  const client = project?.client;
  const company = project?.company || invoice.company;

  if (!project || !client || !company) return false;

  return sendInvoiceEmail({
    additionalEmails: parseEmailList(payload.multi_emails),
    clientEmail: client.email || "",
    clientName: client.name || "Customer",
    company: {
      avatar: company.avatar,
      email: company.email,
      id: company.id,
      name: company.name,
    },
    dueDate: payload.dueDate ? normalizeDate(payload.dueDate) : invoice.dueDate || new Date(),
    invoiceAmount: Number(invoice.totalAmount || payload.totalAmount || 0),
    invoiceDbId: invoice.id,
    invoiceNumber: invoice.externalInvoiceId || invoice.id,
    pdfBuffer: normalPdfBuffer,
    pdfFileName: normalPdfFileName,
    projectNumber: Number(project.contract_number || 0),
    userId: payload.userId,
  });
}

function parseEmailList(value?: string | string[]) {
  if (Array.isArray(value)) return normalizeEmailList(value);
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function getFiniteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validatePayload(payload: MobileStandaloneCustomInvoicePayload) {
  if (!payload) return "Request body is required";
  if (!["save", "createAndSend"].includes(payload.action)) return "Invalid action";
  if (!payload.companyId) return "Company ID is required";
  if (!payload.sellerUserId) return "Seller user ID is required";
  if (!payload.client?.name?.trim()) return "Client name is required";
  if (!payload.client?.email?.trim()) return "Client email is required";
  if (!isValidEmail(payload.client.email)) return "Client email is invalid";
  if (!payload.dateCreation) return "Creation date is required";
  if (!payload.dueDate) return "Due date is required";
  if (!payload.amount?.type) return "Invoice amount type is required";
  if (!Array.isArray(payload.services)) return "Services are required";

  const invalidAdditionalEmail = normalizeEmailList(payload.additionalEmails).find((email) => !isValidEmail(email));
  if (invalidAdditionalEmail) return `Invalid additional email: ${invalidAdditionalEmail}`;

  return "";
}

function normalizeServices(services: MobileStandaloneCustomInvoicePayload["services"]): NormalizedServiceLine[] {
  return services
    .map((service, index) => {
      const quantity = Math.max(1, Number(service.quantity || 1));
      const unitPrice = Math.max(0, Number(service.unitPrice || 0));
      const computedLineTotal = roundCurrency(quantity * unitPrice);
      const lineTotal = roundCurrency(Number(service.lineTotal || computedLineTotal));

      return {
        catalogServiceId: service.catalogServiceId,
        description: String(service.description || "").trim(),
        lineTotal,
        name: String(service.name || "").trim(),
        pos: Number.isFinite(Number(service.pos)) ? Number(service.pos) : index,
        quantity,
        unitPrice,
      };
    })
    .filter((service) => service.name && service.quantity > 0 && service.unitPrice >= 0 && service.lineTotal > 0)
    .sort((a, b) => a.pos - b.pos);
}

function computeInvoiceAmount(
  amount: MobileStandaloneCustomInvoicePayload["amount"],
  servicesTotal: number,
) {
  if (amount.type === "percentage") {
    const rawPercentage = Number(amount.percentage || 0);
    if (!Number.isFinite(rawPercentage) || rawPercentage <= 0) {
      throw new Error("Please enter a valid percentage greater than zero.");
    }

    const coefficient = rawPercentage > 1 ? rawPercentage / 100 : rawPercentage;
    return {
      coefficient,
      invoiceAmount: roundCurrency(servicesTotal * coefficient),
      typeValue: "percentage",
    };
  }

  const fixedValue = Number(amount.fixedValue || 0);
  if (!Number.isFinite(fixedValue) || fixedValue <= 0) {
    throw new Error("Please enter a valid fixed amount greater than zero.");
  }

  return {
    coefficient: servicesTotal > 0 ? roundPrecision(fixedValue / servicesTotal, 6) : 1,
    invoiceAmount: roundCurrency(fixedValue),
    typeValue: "value",
  };
}

async function getNextInvoiceNumber(companyId: string, requested?: string) {
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      externalInvoiceId: { not: null },
    },
    select: { externalInvoiceId: true },
  });
  const usedNumbers = invoices
    .map((invoice) => Number.parseInt(invoice.externalInvoiceId || "", 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1000;
  const requestedNumber = Number.parseInt(requested || "", 10);

  if (Number.isFinite(requestedNumber) && requestedNumber >= nextNumber && !usedNumbers.includes(requestedNumber)) {
    return requestedNumber.toString();
  }

  return nextNumber.toString();
}

async function getNextProjectNumber(companyId: string) {
  const [lastEstimate, lastProject] = await Promise.all([
    prisma.estimate.findFirst({
      orderBy: { number: "desc" },
      select: { number: true },
      where: {
        project: {
          company_id: companyId,
        },
      },
    }),
    prisma.project.findFirst({
      orderBy: { contract_number: "desc" },
      select: { contract_number: true },
      where: {
        company_id: companyId,
        contract_number: { not: null },
      },
    }),
  ]);

  const lastEstimateNumber = Number.parseInt(String(lastEstimate?.number || "0").split(/[/-]/)[0] || "0", 10);
  const lastProjectNumber = Number(lastProject?.contract_number || 0);
  return Math.max(
    Number.isFinite(lastEstimateNumber) ? lastEstimateNumber : 0,
    Number.isFinite(lastProjectNumber) ? lastProjectNumber : 0,
  ) + 1;
}

async function getSafePresignedUrl(uri: string) {
  try {
    return await getPresignedUrl(uri);
  } catch {
    return "";
  }
}

async function generatePdfBuffer(html: string) {
  const apiKey = process.env.PDFSHIFT_API_KEY;
  if (!apiKey) {
    throw new Error("PDFSHIFT_API_KEY is not configured.");
  }

  const response = await axios.post(
    PDFSHIFT_API_URL,
    {
      css: `
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @page {
          size: A4 portrait !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          min-height: 100% !important;
        }
        .pdf-container {
          width: 100% !important;
          height: auto !important;
          min-height: calc(297mm - 24mm) !important;
          margin: 0 !important;
          padding: 0 !important;
          page-break-after: always !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          overflow: visible !important;
          box-sizing: border-box !important;
        }
        .pdf-container > * {
          width: 100% !important;
          max-width: 100% !important;
        }
      `,
      disable_javascript: true,
      format: "A4",
      landscape: false,
      margin: "12mm",
      sandbox: false,
      source: html,
      use_print: true,
    },
    {
      headers: {
        Accept: "application/pdf",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      responseType: "arraybuffer",
      timeout: Number(process.env.PDFSHIFT_TIMEOUT_MS || 90000),
    },
  );

  return Buffer.from(response.data);
}

async function uploadBufferToS3(buffer: Buffer, fileName: string, contentType: string) {
  const s3 = new S3Client({
    credentials: {
      accessKeyId: process.env.AMAZON_S3_KEY!,
      secretAccessKey: process.env.AMAZON_S3_SECRET!,
    },
    region: process.env.AMAZON_S3_REGION,
  });
  const key = `${crypto.randomBytes(4).toString("hex")}-${fileName.replace(/\s/g, "")}`;

  await s3.send(
    new PutObjectCommand({
      Body: buffer,
      Bucket: process.env.AMAZON_S3_BUCKET!,
      ContentType: contentType,
      Key: key,
    }),
  );

  return key;
}

async function sendInvoiceEmail({
  additionalEmails,
  clientEmail,
  clientName,
  company,
  dueDate,
  invoiceAmount,
  invoiceDbId,
  invoiceNumber,
  pdfBuffer,
  pdfFileName,
  projectNumber,
  userId,
}: {
  additionalEmails: string[];
  clientEmail: string;
  clientName: string;
  company: {
    avatar?: string | null;
    email?: string | null;
    id: string;
    name: string;
  };
  dueDate: Date;
  invoiceAmount: number;
  invoiceDbId: string;
  invoiceNumber: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
  projectNumber: number;
  userId: string;
}) {
  const recipients = Array.from(new Set([clientEmail, ...normalizeEmailList(additionalEmails)].filter(Boolean)));
  if (recipients.length === 0) return false;

  const companyAvatar = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
  const totalFormatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(invoiceAmount);

  let sentAtLeastOnce = false;
  for (const email of recipients) {
    try {
      await sendEmail({
        attachments: [
          {
            content: pdfBuffer.toString("base64"),
            disposition: "attachment",
            filename: pdfFileName,
            type: "application/pdf",
          },
        ],
        dynamicTemplateData: {
          companyAvatar,
          companyName: company.name,
          companyReplyToEmail: company.email || "",
          currentYear: new Date().getFullYear().toString(),
          dueDate: dueDate.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }),
          invoiceNumber,
          paymentUrl: "",
          projectName: `Project #${projectNumber}`,
          recipientEmail: email,
          recipientName: clientName || "Customer",
          totalAmount: totalFormatted,
        },
        subject: `Invoice #${invoiceNumber} - ${company.name}`,
        templateId: "d-0ce549c501c34e958c342212821b0604",
        to: email,
      });

      await prisma.invoiceEmailLog.create({
        data: {
          invoice: { connect: { id: invoiceDbId } },
          recipient: email,
          sentAt: new Date(),
          status: "success",
        },
      });

      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoiceDbId,
          recipient: email,
          user_id: userId,
        },
      });

      await prisma.invoiceTimeline.create({
        data: {
          description: `Sent to ${email}`,
          invoice: { connect: { id: invoiceDbId } },
        },
      });

      sentAtLeastOnce = true;
    } catch (error: any) {
      await prisma.invoiceEmailLog.create({
        data: {
          errorMessage: error?.message || "Unknown error",
          invoice: { connect: { id: invoiceDbId } },
          recipient: email,
          sentAt: new Date(),
          status: "error",
        },
      });

      await prisma.invoiceTimeline.create({
        data: {
          description: `Failed to send email to ${email}: ${error?.message || "Unknown error"}`,
          invoice: { connect: { id: invoiceDbId } },
        },
      });
    }
  }

  return sentAtLeastOnce;
}

function buildProfessionalInvoiceHtml(input: InvoicePdfInput) {
  const serviceRows = input.services
    .map((service, index) => renderServiceRow(service, index, input.services.length))
    .join("");
  const paymentMethods = input.showPaymentMethods ? renderPaymentMethods(input.invoiceAmount) : "";
  const paidWatermark = input.isPaid
    ? `<div style="position:absolute;top:50%;left:0%;right:0%;bottom:0%;pointer-events:none;z-index:0;"><div style="display:flex;justify-content:center;align-items:center;font-size:200px;font-weight:900;opacity:0.10;color:#22c55e;letter-spacing:32px;text-transform:uppercase;">PAID</div></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(input.invoiceNumber)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      line-height: 1.4;
      color: #000;
      background: white;
    }
    .pdf-container {
      width: 100% !important;
      height: auto !important;
      background: white;
      margin: 0 !important;
      padding: 0;
      min-height: calc(297mm - 24mm);
      page-break-after: always;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: visible;
      box-sizing: border-box;
    }
    .pdf-container > * {
      width: 100% !important;
      max-width: 100% !important;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: bold;
      margin-bottom: 10px;
    }
    p {
      margin-bottom: 8px;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td, th {
      padding: 8px;
      border: 1px solid #ddd;
    }
    @media print {
      .pdf-container {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="pdf-container" style="width:100%;background:white;margin:0;padding:0;page-break-after:always;min-height:calc(297mm - 24mm);height:auto;box-sizing:border-box;overflow:visible;">
    <div style="width:100%;margin:0 auto;">
      <div style="width:100%;background-color:white;font-family:system-ui,-apple-system,sans-serif;color:#333333;line-height:1.4;font-size:12px;position:relative;box-sizing:border-box;">
        <style>
          @page { size: A4; }
          .page-break-before { page-break-before: auto; }
          .page-break-avoid { page-break-inside: avoid; break-inside: avoid; }
        </style>
        <div style="box-sizing:border-box;background-color:#ffffff;display:flex;flex-direction:column;position:relative;">
          ${paidWatermark}
          <div style="padding:24px 24px 24px 24px;border-bottom:1px solid #e5e7eb;background-color:#ffffff;position:relative;z-index:1;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
              <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;">
                ${
                  input.company.avatarUrl
                    ? `<div style="padding:0px;"><img src="${escapeAttribute(input.company.avatarUrl)}" alt="${escapeAttribute(input.company.name)}" style="max-height:48px;object-fit:contain;display:block;" /></div>`
                    : ""
                }
                <div>
                  <div style="font-size:20px;font-weight:600;color:#1a1a1a;margin-bottom:4px;letter-spacing:-0.02em;">${escapeHtml(input.company.name || "Company Name")}</div>
                  <div style="font-size:12px;color:#6b7280;line-height:1.4;">
                    ${input.company.address ? `<div>${escapeHtml(input.company.address)}</div>` : ""}
                    ${input.company.phone ? `<div>${escapeHtml(input.company.phone)}</div>` : ""}
                    ${input.company.email ? `<div>${escapeHtml(input.company.email)}</div>` : ""}
                  </div>
                </div>
              </div>
              <div style="text-align:right;padding:24px 24px;background-color:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;">
                <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:8px;letter-spacing:0.5px;">INVOICE #${escapeHtml(input.invoiceNumber)}</div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Date: ${formatDisplayDate(input.dateCreation)}</div>
                <div style="font-size:12px;color:#6b7280;">Due: ${formatDisplayDate(input.dueDate)}</div>
              </div>
            </div>
          </div>
          <div style="padding:24px 24px;display:flex;gap:40px;">
            <div style="flex:1;">
              <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
                <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;">Bill To</div>
                <div style="font-size:16px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">${escapeHtml(input.client.name || "Client Name")}</div>
                <div style="font-size:12px;color:#6b7280;line-height:1.5;">
                  ${input.client.address ? `<div style="margin-bottom:6px;">&#128205; ${escapeHtml(input.client.address)}</div>` : ""}
                  ${input.client.phone ? `<div style="margin-bottom:6px;">&#128222; ${escapeHtml(input.client.phone)}</div>` : ""}
                  ${input.client.email ? `<div style="margin-bottom:6px;">&#9993;&#65039; ${escapeHtml(input.client.email)}</div>` : ""}
                </div>
              </div>
              ${
                input.workContext?.name || input.workContext?.address
                  ? `<div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:16px;">
                      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;">Work Site</div>
                      <div style="font-size:16px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">${escapeHtml(input.workContext?.name || input.client.name)}</div>
                      <div style="font-size:12px;color:#6b7280;line-height:1.5;">
                        ${input.workContext?.address ? `<div style="margin-bottom:6px;">&#128205; ${escapeHtml(input.workContext.address)}</div>` : ""}
                        ${input.workContext?.phone ? `<div style="margin-bottom:6px;">&#128222; ${escapeHtml(input.workContext.phone)}</div>` : ""}
                        ${input.workContext?.email ? `<div style="margin-bottom:6px;">&#9993;&#65039; ${escapeHtml(input.workContext.email)}</div>` : ""}
                      </div>
                    </div>`
                  : ""
              }
            </div>
            <div style="flex:1;max-width:300px;">
              <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
                <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;">Invoice Details</div>
                <div style="margin-bottom:16px;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-size:11px;color:#6b7280;">Payment Method:</span>
                    <span style="font-size:11px;color:#1a1a1a;font-weight:500;">${input.invoiceType === "stripe" ? "Stripe" : "Other"}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-size:11px;color:#6b7280;">Supervisor:</span>
                    <span style="font-size:11px;color:#1a1a1a;font-weight:500;">${escapeHtml(input.company.name || "Project Manager")}</span>
                  </div>
                </div>
                <div style="background-color:#374151;color:white;padding:16px;border-radius:6px;text-align:center;margin-bottom:16px;">
                  <div style="font-size:10px;opacity:0.8;margin-bottom:4px;">BALANCE DUE</div>
                  <div style="font-size:16px;font-weight:600;">${input.invoiceAmount > 0 ? formatCurrency(input.invoiceAmount) : "$0.00"}</div>
                </div>
                ${
                  input.isPaid
                    ? `<div style="display:flex;justify-content:space-between;margin-bottom:16px;padding:8px;background-color:#f0fdf4;border-radius:4px;border:1px solid #bbf7d0;">
                        <span style="font-size:11px;color:#15803d;font-weight:600;">Payment:</span>
                        <span style="font-size:11px;color:#15803d;font-weight:600;">-${formatCurrency(input.invoiceAmount)}</span>
                      </div>`
                    : ""
                }
                ${
                  input.showPaymentMethods
                    ? `<div>
                        <div style="font-size:11px;color:#6b7280;margin-bottom:8px;font-weight:500;">Accepted Payment Methods:</div>
                        <div style="margin-bottom:8px;display:grid;grid-template-columns:repeat(5,28px);gap:6px;">
                          ${renderPaymentIcon("https://i.ibb.co/vvRcGxWB/visa.png", 18)}
                          ${renderPaymentIcon("https://i.ibb.co/fY2zKg6S/mastercard.png", 18)}
                          ${renderPaymentIcon("https://i.ibb.co/C3QPyJSy/discorver.png", 18)}
                          ${renderPaymentIcon("https://i.ibb.co/dss3QdzF/Untitled.png", 18)}
                          <span style="height:18px;background-color:#059669;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:700;color:white;">BANK</span>
                        </div>
                        <div style="font-size:9px;color:#9ca3af;text-align:center;">Secure payment processing</div>
                      </div>`
                    : ""
                }
              </div>
            </div>
          </div>
          ${
            input.description
              ? `<div style="padding:0 24px 24px 24px;">
                  <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
                    <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">Description</div>
                    <div style="font-size:12px;color:#1a1a1a;line-height:1.6;">${sanitizeDescriptionHtml(input.description)}</div>
                  </div>
                </div>`
              : ""
          }
        </div>
        <div style="margin-top:40px;">
          <div style="width:100%;background-color:white;font-family:system-ui,-apple-system,sans-serif;color:#333333;line-height:1.4;font-size:12px;position:relative;box-sizing:border-box;padding:24px 24px 24px 24px;display:block;page-break-inside:auto;overflow:visible;">
            <div style="display:block;position:relative;z-index:1;">
              <h2 style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:16px;margin:0 0 16px 0;flex-shrink:0;letter-spacing:0.5px;">SERVICES</h2>
              <div style="display:flex;background-color:#f8f9fa;border:1px solid #e9ecef;border-radius:6px 6px 0 0;padding:12px 16px;font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">
                <div style="flex:3;padding-right:16px;">Service</div>
                <div style="flex:1;text-align:center;padding-right:16px;">Quantity</div>
                <div style="flex:1.2;text-align:right;padding-right:16px;">Unit Price</div>
                <div style="flex:1.2;text-align:right;">Amount</div>
              </div>
              <div style="border:1px solid #e9ecef;border-top:none;border-radius:0 0 6px 6px;background-color:#ffffff;">${serviceRows}</div>
              <div style="margin-top:24px;padding-top:20px;border-top:2px solid #e5e7eb;flex-shrink:0;page-break-inside:avoid;break-inside:avoid;">
                <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
                  <div style="text-align:right;padding:24px;">
                    ${renderInvoiceFinancialSummary(input)}
                  </div>
                </div>
                ${paymentMethods}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderInvoiceFinancialSummary(input: InvoicePdfInput) {
  const totalInvoice = input.apiBalanceDue && input.apiBalanceDue > 0 ? input.apiBalanceDue : input.totalInvoice;
  const amountPaid = Number(input.amountPaid || 0);
  const paymentHistory = renderInvoicePaymentHistory(input.invoicePaymentTimeline || []);
  const showExtraWork =
    typeof input.extraWork === "number" &&
    input.extraWork > 0 &&
    typeof input.apiBalanceDue === "number" &&
    input.apiBalanceDue > 0;
  const extraWork = showExtraWork
    ? `<div style="font-size:11px;color:#6b7280;margin-bottom:0px;margin-top:4px;font-weight:600;padding-top:8px;border-top:1px solid #e5e7eb;">Extra Work</div>
       <div style="font-size:12px;font-weight:600;color:#dc2626;">${formatCurrency(input.extraWork || 0)}</div>`
    : "";

  if (input.isPaid) {
    return `<div style="font-size:11px;color:#15803d;margin-bottom:4px;margin-top:4px;font-weight:600;">Payment</div>
            <div style="font-size:12px;font-weight:700;color:#15803d;">-${formatCurrency(input.invoiceAmount)}</div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:4px;margin-top:4px;font-weight:600;padding-top:8px;border-top:1px solid #e5e7eb;">Remaining Balance</div>
            <div style="font-size:14px;font-weight:700;color:#1a1a1a;">${formatCurrency(Math.max(0, totalInvoice - input.invoiceAmount))}</div>
            ${extraWork}
            ${paymentHistory}`;
  }

  return `<div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;">Total Invoice</div>
          <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${formatCurrency(totalInvoice)}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:4px;margin-top:4px;font-weight:600;padding-top:8px;border-top:1px solid #e5e7eb;">Paid Invoice</div>
          <div style="font-size:12px;font-weight:700;color:#009900;">${amountPaid > 0 ? formatCurrency(amountPaid) : "$0.00"}</div>
          ${extraWork}
          ${paymentHistory}`;
}

function renderInvoicePaymentHistory(
  payments: NonNullable<InvoicePdfInput["invoicePaymentTimeline"]>,
) {
  if (!payments.length) return "";

  const rows = [...payments]
    .sort((first, second) => new Date(first.date_creation).getTime() - new Date(second.date_creation).getTime())
    .map((payment) => {
      return `<div style="font-size:9px;color:#4b5563;margin-bottom:4px;padding-left:8px;border-left:2px solid #e5e7eb;">${escapeHtml(payment.description || "")}</div>`;
    })
    .join("");

  return `<div style="margin-top:4px;padding-top:8px;border-top:1px solid #e5e7eb;">
            <div style="font-size:11px;color:#6b7280;margin-bottom:8px;font-weight:600;">Payment History</div>
            ${rows}
          </div>`;
}

function renderServiceRow(service: NormalizedServiceLine, index: number, totalRows: number) {
  const hasDescription = Boolean(service.description);
  const borderBottom = index < totalRows - 1 ? "border-bottom:1px solid #f1f3f4;" : "";

  return `<div>
    <div style="display:flex;align-items:center;padding:16px;min-height:50px;${hasDescription ? "" : borderBottom}">
      <div style="flex:3;padding-right:16px;">
        <div style="font-size:12px;font-weight:600;color:#1a1a1a;">${escapeHtml(service.name)}</div>
      </div>
      <div style="flex:1;text-align:center;padding-right:16px;font-size:11px;color:#374151;">${service.quantity}</div>
      <div style="flex:1.2;text-align:right;padding-right:16px;font-size:11px;color:#374151;">${formatCurrency(service.unitPrice)}</div>
      <div style="flex:1.2;text-align:right;font-size:12px;font-weight:600;color:#1a1a1a;">${formatCurrency(service.lineTotal)}</div>
    </div>
    ${
      hasDescription
        ? `<div style="padding:0 16px 16px 16px;${borderBottom}">
            <div style="font-size:10px;color:#6b7280;line-height:1.5;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;background-color:#f8f9fa;padding:12px;border-radius:4px;border:1px solid #e9ecef;">${sanitizeDescriptionHtml(service.description)}</div>
          </div>`
        : ""
    }
  </div>`;
}

function renderPaymentMethods(balanceDue: number) {
  return `<div style="background-color:#f8f9fa;border:1px solid #e9ecef;border-radius:6px;padding:20px;page-break-inside:avoid;break-inside:avoid;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;">
      <div style="font-size:11px;color:#6b7280;font-weight:500;display:flex;flex-direction:column;gap:6px;">
        Accepted Payment Methods
        <div style="margin-top:6px;display:grid;grid-template-columns:repeat(5,32px);gap:6px;">
          ${renderPaymentIcon("https://i.ibb.co/vvRcGxWB/visa.png", 20)}
          ${renderPaymentIcon("https://i.ibb.co/fY2zKg6S/mastercard.png", 20)}
          ${renderPaymentIcon("https://i.ibb.co/C3QPyJSy/discorver.png", 20)}
          ${renderPaymentIcon("https://i.ibb.co/dss3QdzF/Untitled.png", 20)}
          <span style="height:20px;background-color:#059669;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:white;">BANK</span>
        </div>
        <div style="font-size:9px;color:#9ca3af;">Secure payment processing</div>
      </div>
      <div style="background-color:#374151;color:white;padding:16px;border-radius:6px;text-align:center;min-width:180px;">
        <div style="font-size:10px;opacity:0.8;margin-bottom:4px;letter-spacing:0.5px;">BALANCE DUE</div>
        <div style="font-size:16px;font-weight:600;">${balanceDue > 0 ? formatCurrency(balanceDue) : "$0.00"}</div>
      </div>
    </div>
  </div>`;
}

function renderPaymentIcon(url: string, height: number) {
  return `<span style="height:${height}px;background-image:url(${url});background-size:100% 100%;border:1px solid #d1d5db;border-radius:3px;background-color:white;"></span>`;
}

function formatCompanyAddress(company: {
  address?: string | null;
  complement?: string | null;
  district?: string | null;
  numberHouse?: string | null;
}) {
  return [company.address, company.numberHouse, company.complement, company.district]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(", ");
}

function normalizeEmailList(emails?: string[]) {
  if (!Array.isArray(emails)) return [];
  return emails.map((email) => String(email || "").trim()).filter(Boolean);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return date;
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value || 0));
}

function roundCurrency(value: number) {
  return roundPrecision(value, 2);
}

function roundPrecision(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function safeFileSegment(value: string) {
  return String(value || "Client").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "Client";
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string | number | null | undefined) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function sanitizeDescriptionHtml(value: string) {
  const input = String(value || "");
  if (!input.includes("<")) {
    return escapeHtml(input).replace(/\n/g, "<br>");
  }

  const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<([a-z][a-z0-9]*)\b[^>]*>/gi, (_match, tag: string) => {
      const normalizedTag = tag.toLowerCase();
      return allowedTags.has(normalizedTag) ? `<${normalizedTag}>` : "";
    })
    .replace(/<\/([a-z][a-z0-9]*)>/gi, (_match, tag: string) => {
      const normalizedTag = tag.toLowerCase();
      return allowedTags.has(normalizedTag) && normalizedTag !== "br" ? `</${normalizedTag}>` : "";
    });
}
