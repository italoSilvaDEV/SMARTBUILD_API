import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { removeManualClientSignatureFromChangeOrderPdfBuffer } from "../../utils/pdfChangeOrderSignatures";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

export class RemoveManualSignatureChangeOrderController {
  async handle(req: Request, res: Response) {
    const {
      changeOrderId
    } = req.params;

    if (!changeOrderId) {
      return res.status(400).json({
        error: "Change order ID is required"
      });
    }

    const changeOrder = await prisma.changeOrder.findUnique({
      where: {
        id: changeOrderId
      },
      select: {
        id: true,
        status: true,
        assignatureRequired: true
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

    try {
      const pdfUrl = await getPresignedUrl(pdfProject.uri);
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const cleanedPdfBuffer =
        await removeManualClientSignatureFromChangeOrderPdfBuffer(
          originalPdfBuffer
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
          Body: cleanedPdfBuffer,
          ContentType: "application/pdf",
        })
      );

      await prisma.pdfProject.update({
        where: {
          id: pdfProject.id
        },
        data: {
          uri: newFileName
        },
      });

      await prisma.changeOrder.update({
        where: {
          id: changeOrder.id
        },
        data: {
          assignatureRequired: true
        },
      });
    } catch (err) {
      console.error("[removeManualSignatureChangeOrder] Error:", err);
      return res.status(500).json({
        error: "Failed to remove signature from change order PDF",
      });
    }

    const updated = await prisma.changeOrder.findUnique({
      where: { id: changeOrder.id },
    });

    return res.status(200).json({
      message: "Signature removed; change order is free for signature again (manual or client)",
      data: updated,
    });
  }
}
