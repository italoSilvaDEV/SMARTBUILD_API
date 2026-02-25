import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { removeManualClientSignatureFromPdfBuffer } from "../../utils/pdfEstimateSignatures";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

export class RemoveManualSignatureEstimateController {
  async handle(req: Request, res: Response) {
    const { id } = req.params;

    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: { id: true, status: true, assignatureRequired: true },
    });

    if (!estimate) {
      return res.status(404).json({ error: "Estimate not found" });
    }

    const pdfProject = await prisma.pdfProject.findFirst({
      where: { estimate_id: estimate.id },
    });

    if (!pdfProject?.uri) {
      return res.status(404).json({ error: "PDF Project not found or has no URI" });
    }

    try {
      const pdfUrl = await getPresignedUrl(pdfProject.uri);
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const cleanedPdfBuffer = await removeManualClientSignatureFromPdfBuffer(originalPdfBuffer);

      const s3 = new S3Client({
        region: process.env.AMAZON_S3_REGION,
        credentials: {
          accessKeyId: process.env.AMAZON_S3_KEY!,
          secretAccessKey: process.env.AMAZON_S3_SECRET!,
        },
      });

      const fileHash = crypto.randomBytes(4).toString("hex");
      const baseName =
        pdfProject.original_file_name || `estimate_${estimate.id}.pdf`;
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
        where: { id: pdfProject.id },
        data: { uri: newFileName },
      });

      await prisma.estimate.update({
        where: { id },
        data: {
          assignatureRequired: true,
          clientSignature: null,
        },
      });
    } catch (err) {
      console.error("[removeManualSignature] Error:", err);
      return res.status(500).json({
        error: "Failed to remove manual signature from PDF",
      });
    }

    const updated = await prisma.estimate.findUnique({
      where: { id },
      include: { project: { select: { contract_number: true } } },
    });

    return res.status(200).json({
      message: "Manual signature removed; estimate requires client signature again",
      data: updated,
    });
  }
}
