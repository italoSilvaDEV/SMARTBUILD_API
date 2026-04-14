import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import {
  addManualApprovalClientSignatureToChangeOrderPdfBuffer,
} from "../../utils/pdfChangeOrderSignatures";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";

export class ManualApprovalChangeOrderController {
  async handle(req: Request, res: Response) {
    const {
      changeOrderId
    } = req.params;

    const clientNameBody = (req.body as { clientName?: string }).clientName;

    if (!changeOrderId) {
      return res.status(400).json({
        error: "Change order ID is required"
      });
    }

    const changeOrder = await prisma.changeOrder.findUnique({
      where: { id: changeOrderId },
      include: {
        changeOrderServices: true,
        estimate: {
          include: {
            project: {
              include: {
                client: true,
                workContext: true,
              },
            },
          },
        },
      },
    });

    if (!changeOrder) {
      return res.status(404).json({
        error: "Change order not found"
      });
    }

    const pdfProject = await prisma.pdfProject.findFirst({
      where: {
        changeOrderId: changeOrder.id
      },
    });

    if (!pdfProject?.uri) {
      return res.status(404).json({
        error: "PDF Project not found or has no URI for this change order",
      });
    }

    const isPending = changeOrder.status === "pending";
    const isApprovedNeedingSignature =
      changeOrder.status === "approved" &&
      changeOrder.assignatureRequired === true;

    if (!isPending && !isApprovedNeedingSignature) {
      return res.status(400).json({
        error:
          "Change order must be pending or approved with signature required (assignatureRequired: true)",
      });
    }

    const clientName =
      clientNameBody?.trim() ||
      changeOrder.estimate?.project?.workContext?.Name ||
      changeOrder.estimate?.project?.client?.name ||
      "Client";

    const approvedAt = new Date();

    if (isPending) {
      await prisma.$transaction(async (smartbuild) => {
        await smartbuild.changeOrder.update({
          where: {
            id: changeOrder.id
          },
          data: {
            status: "approved"
          },
        });

        const estimate = await smartbuild.estimate.findUnique({
          where: {
            id: changeOrder.estimateId
          },
          include: {
            serviceProjects: true,
            project: true,
          },
        });

        if (!estimate) {
          return res.status(404).json({
            error: "Estimate not found"
          });
        }

        for (const service of changeOrder.changeOrderServices) {
          await smartbuild.estimateServiceProject.create({
            data: {
              name: service.name,
              description: service.description,
              quantity: service.quantity,
              unitPrice: service.unitPrice,
              lineTotal: service.lineTotal,
              price: service.price,
              estimateId: estimate.id,
              hours: service.quantity,
            },
          });
        }

        await syncEstimateDiscountedServices(smartbuild, estimate.id);
        await smartbuild.estimate.update({
          where: { id: estimate.id },
          data: { pdf_needs_update: true },
        });
      });
    }

    await prisma.changeOrder.update({
      where: {
        id: changeOrder.id
      },
      data: {
        assignatureRequired: false,
        date_update: approvedAt,
      },
    });

    try {
      const pdfUrl = await getPresignedUrl(pdfProject.uri);
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const signedPdfBuffer =
        await addManualApprovalClientSignatureToChangeOrderPdfBuffer(
          originalPdfBuffer,
          clientName,
          approvedAt
        );

      const s3 = new S3Client({
        region: process.env.AMAZON_S3_REGION,
        credentials: {
          accessKeyId: process.env.AMAZON_S3_KEY!,
          secretAccessKey: process.env.AMAZON_S3_SECRET!,
        },
      });

      const fileHash = crypto.randomBytes(4).toString("hex");
      const baseName =
        pdfProject.original_file_name || `change_order_${changeOrder.id}.pdf`;
      const newFileName = `${fileHash}-${baseName.replace(/\s/g, "")}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AMAZON_S3_BUCKET!,
          Key: newFileName,
          Body: signedPdfBuffer,
          ContentType: "application/pdf",
        })
      );

      await prisma.pdfProject.update({
        where: { id: pdfProject.id },
        data: { uri: newFileName },
      });
    } catch (err) {
      console.error("[manualApprovalChangeOrder] Error applying signature:", err);
      return res.status(500).json({
        error: "Failed to apply manual approval signature to PDF",
      });
    }

    const updated = await prisma.changeOrder.findUnique({
      where: {
        id: changeOrder.id
      },
    });

    return res.status(200).json({
      message: "Manual approval applied successfully",
      data: updated,
    });
  }
}
