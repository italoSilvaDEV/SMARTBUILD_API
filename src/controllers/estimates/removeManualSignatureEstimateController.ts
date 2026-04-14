import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import {
  clearEstimateClientSignaturePdf,
  EstimatePdfNotFoundError,
} from "../../utils/clearEstimateClientSignaturePdf";

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

    try {
      const { pdfProjectId, newFileName } = await clearEstimateClientSignaturePdf(estimate.id);

      await prisma.pdfProject.update({
        where: { id: pdfProjectId },
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
      if (err instanceof EstimatePdfNotFoundError) {
        return res.status(404).json({ error: err.message });
      }

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