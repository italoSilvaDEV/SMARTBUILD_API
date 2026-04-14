import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { prisma } from "./prisma";
import { getPresignedUrl } from "./S3/getPresignedUrl";
import { removeManualClientSignatureFromPdfBuffer } from "./pdfEstimateSignatures";

export class EstimatePdfNotFoundError extends Error {
  constructor(message = "PDF Project not found or has no URI") {
    super(message);
    this.name = "EstimatePdfNotFoundError";
  }
}

export async function clearEstimateClientSignaturePdf(estimateId: string) {
  const pdfProject = await prisma.pdfProject.findFirst({
    where: { estimate_id: estimateId },
    select: {
      id: true,
      uri: true,
      original_file_name: true,
    },
  });

  if (!pdfProject?.uri) {
    throw new EstimatePdfNotFoundError();
  }

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
  const baseName = pdfProject.original_file_name || `estimate_${estimateId}.pdf`;
  const newFileName = `${fileHash}-${baseName.replace(/\s/g, "")}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AMAZON_S3_BUCKET!,
      Key: newFileName,
      Body: cleanedPdfBuffer,
      ContentType: "application/pdf",
    })
  );

  return {
    pdfProjectId: pdfProject.id,
    newFileName,
  };
}