import { Request, Response } from "express";
import { createStagedUpload, StagedUploadPurpose } from "../../utils/S3/stagedUpload";

const VALIDATION_ERRORS = new Set([
  "companyId is required",
  "userId is required",
  "fileName is required",
  "contentType is required",
  "size is required",
  "File is too large",
  "File type is not allowed for this upload",
]);

const ALLOWED_PURPOSES = new Set<StagedUploadPurpose>(["estimate-pdf", "estimate-attachment", "work-order-attachment"]);

export class StagedUploadController {
  async presign(req: Request, res: Response) {
    try {
      const { companyId, fileName, contentType, size, purpose } = req.body || {};
      const userId = (req as any).userId;

      if (!ALLOWED_PURPOSES.has(purpose)) {
        return res.status(400).json({ error: "Invalid upload purpose" });
      }

      const upload = await createStagedUpload({
        companyId,
        userId,
        fileName,
        contentType,
        size: Number(size),
        purpose,
      });

      return res.status(201).json(upload);
    } catch (error: any) {
      if (VALIDATION_ERRORS.has(error?.message)) {
        return res.status(400).json({ error: error.message });
      }

      console.error("[StagedUploadController]", error);
      return res.status(500).json({ error: "Internal server error while preparing upload" });
    }
  }
}
