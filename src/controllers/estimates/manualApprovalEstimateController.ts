import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { addManualApprovalClientSignatureToPdfBuffer } from "../../utils/pdfEstimateSignatures";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

export class ManualApprovalEstimateController {
  async handle(req: Request, res: Response) {
    const { id } = req.params;
    const { clientName: bodyClientName } = req.body as { clientName?: string };

    const estimate = await prisma.estimate.findUnique({
      where: { id },
      include: {
        serviceProjects: {
          orderBy: {
            date_creation: "asc",
          },
        },
        project: {
          include: {
            client: true,
            company: true,
            workContext: true,
          },
        },
      },
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

    const isPending = estimate.status === "pending";
    const isApprovedNeedingSignature =
      estimate.status === "approved" && estimate.assignatureRequired === true;

    if (!isPending && !isApprovedNeedingSignature) {
      return res.status(400).json({
        error:
          "Estimate must be pending or approved with signature required (assignatureRequired: true)",
      });
    }

    const clientName =
      bodyClientName?.trim() ||
      estimate.project?.workContext?.Name ||
      estimate.project?.client?.name ||
      "Client";

    const approvedAt = new Date();

    if (isPending) {
      if (estimate.serviceProjects.length > 0) {
        const projectId = estimate.projectId;
        const companyId = estimate.project.company_id ?? undefined;

        for (const service of estimate.serviceProjects) {
          const existingSibling = await prisma.serviceProject.findFirst({
            where: { estimateServiceId: service.id },
          });

          if (existingSibling) {
            await prisma.serviceProject.update({
              where: { id: existingSibling.id },
              data: {
                projectId,
                ...(companyId && { company_id: companyId }),
              },
            });
          } else {
            await prisma.serviceProject.create({
              data: {
                name: service.name,
                description: service.description ?? "",
                hours: service.hours ?? 0,
                price: service.price ?? 0,
                id_service: service.id_service ?? undefined,
                projectId,
                ...(companyId && { company_id: companyId }),
                estimateServiceId: service.id,
              },
            });
          }
        }
      }

      await prisma.estimate.update({
        where: { id },
        data: {
          status: "approved",
          assignatureRequired: false,
          date_update: approvedAt,
          clientSignature: JSON.stringify({ manualApproval: true }),
        },
      });
    } else {
      await prisma.estimate.update({
        where: { id },
        data: {
          assignatureRequired: false,
          date_update: approvedAt,
          clientSignature: JSON.stringify({ manualApproval: true }),
        },
      });
    }

    try {
      const pdfUrl = await getPresignedUrl(pdfProject.uri);
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      const signedPdfBuffer = await addManualApprovalClientSignatureToPdfBuffer(
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
        pdfProject.original_file_name || `estimate_${estimate.number}.pdf`;
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
      console.error("[manualApproval] Error applying signature to PDF:", err);
      return res.status(500).json({
        error: "Failed to apply manual approval signature to PDF",
      });
    }

    const updated = await prisma.estimate.findUnique({
      where: { id },
      include: { project: { select: { contract_number: true } } },
    });

    return res.status(200).json({
      message: "Manual approval applied successfully",
      data: updated,
    });
  }
}
