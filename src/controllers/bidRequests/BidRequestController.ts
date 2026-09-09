import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";
import { bidRequestEmail } from "../../templateEmail/bidRequest";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import {
  deleteS3ObjectQuietly,
  getStagedObjectBuffer,
  StagedUploadReference,
  verifyStagedUploadReference,
} from "../../utils/S3/stagedUpload";
import { extractExternalProposalFromDocument } from "../../services/bidRequests/externalProposalExtraction";

const includeBid = {
  items: { orderBy: { position: "asc" as const } },
  recipients: {
    include: { items: { orderBy: { position: "asc" as const } } },
    orderBy: { createdAt: "asc" as const },
  },
  attachments: { orderBy: { createdAt: "asc" as const } },
  company: { select: { name: true, avatar: true } },
};

const money = (value: unknown) => Number(value) || 0;
const serializeItems = (items: any[] = []) =>
  items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    suggestedValue:
      item.suggestedValue == null ? null : Number(item.suggestedValue),
    unitPrice: item.unitPrice == null ? undefined : Number(item.unitPrice),
  }));
const proposalTotal = (items: any[] = []) =>
  items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );

async function finalizeExpired(companyId?: string) {
  const now = new Date();
  await prisma.bidRequest.updateMany({
    where: {
      status: "pending",
      responseDeadline: { lt: now },
      ...(companyId ? { companyId } : {}),
    },
    data: { status: "finalized", finalizedAt: now },
  });
  await prisma.bidRequestRecipient.updateMany({
    where: {
      status: "pending",
      bidRequest: {
        status: "finalized",
        responseDeadline: { lt: now },
        approvedRecipientId: null,
        ...(companyId ? { companyId } : {}),
      },
    },
    data: { status: "expired" },
  });
}

async function reopenAutoFinalized(filters: { id?: string; companyId?: string } = {}) {
  await prisma.bidRequest.updateMany({
    where: {
      ...(filters.id ? { id: filters.id } : {}),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      status: "finalized",
      approvedRecipientId: null,
      responseDeadline: { gt: new Date() },
    },
    data: { status: "pending", finalizedAt: null },
  });
}

async function serialize(bid: any, publicRecipientId?: string) {
  const attachments = await Promise.all(
    (bid.attachments || []).map(async (attachment: any) => ({
      id: attachment.id,
      name: attachment.originalName,
      contentType: attachment.contentType,
      size: attachment.size,
      url: await getPresignedUrl(attachment.key).catch(() => ""),
    })),
  );
  const recipients = await Promise.all((bid.recipients || [])
    .filter(
      (recipient: any) =>
        !publicRecipientId || recipient.id === publicRecipientId,
    )
    .map(async (recipient: any) => ({
      id: recipient.id,
      status: recipient.status,
      subcontractorId: recipient.subcontractorId,
      subcontractorName: recipient.subcontractorName,
      subcontractorEmail: recipient.subcontractorEmail,
      submittedAt: recipient.submittedAt,
      approvedAt: recipient.approvedAt,
      rejectedAt: recipient.rejectedAt,
      notes: recipient.notes || "",
      submissionSource: recipient.submissionSource || "portal",
      extractionConfidence: recipient.extractionConfidence,
      externalDocument: recipient.externalDocumentKey ? {
        name: recipient.externalDocumentName,
        contentType: recipient.externalDocumentContentType,
        size: recipient.externalDocumentSize,
        url: await getPresignedUrl(recipient.externalDocumentKey).catch(() => ""),
      } : null,
      items: serializeItems(recipient.items),
      total: proposalTotal(recipient.items),
    })));
  return {
    ...bid,
    items: serializeItems(bid.items),
    recipients,
    attachments,
    suggestedBudget: (bid.items || []).reduce(
      (sum: number, item: any) =>
        sum + Number(item.quantity) * money(item.suggestedValue),
      0,
    ),
  };
}

async function canAccess(req: Request, companyId: string) {
  const userId = (req as any).userId as string | undefined;
  return Boolean(
    userId &&
    (await prisma.user.findFirst({
      where: {
        id: userId,
        OR: [{ company_id: companyId }, { companies: { some: { companyId } } }],
      },
      select: { id: true },
    })),
  );
}

async function deliverBidRequest(
  record: any,
  recipients: any[],
  message: string,
) {
  const logo = record.company.avatar
    ? await getPresignedUrl(record.company.avatar).catch(() => "")
    : "";
  const baseUrl = String(
    process.env.URL_FRONT || process.env.FRONTEND_URL || "",
  ).replace(/\/$/, "");
  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient.subcontractorEmail,
        subject: `Bid Request #${record.number} from ${record.company.name}`,
        html: bidRequestEmail({
          recipientName: recipient.subcontractorName,
          companyName: record.company.name,
          companyLogo: logo,
          number: record.number,
          projectName: record.projectName,
          deadline: record.responseDeadline,
          responseLink: `${baseUrl}/bid-request-response/${recipient.publicToken}`,
          message: message || undefined,
        }),
        companyId: record.companyId,
        throwOnError: true,
        debugContext: `bidRequest.send.${record.id}.${recipient.id}`,
      }),
    ),
  );
  const now = new Date();
  await prisma.$transaction(
    recipients.map((recipient, index) =>
      prisma.bidRequestRecipient.update({
        where: { id: recipient.id },
        data:
          results[index].status === "fulfilled"
            ? {
                deliveryStatus: "sent",
                invitedAt: recipient.invitedAt || now,
                lastSentAt: now,
                sendCount: { increment: 1 },
              }
            : { deliveryStatus: "failed" },
      }),
    ),
  );
  const failed = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            recipient: recipients[index].subcontractorEmail,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "Unable to send",
          },
        ]
      : [],
  );
  if (failed.length < results.length) {
    await prisma.bidRequest.update({
      where: { id: record.id },
      data: { sentAt: now },
    });
  }
  return { sent: results.length - failed.length, failed };
}

function validatePayload(payload: any) {
  const deadlineValue = String(payload.responseDeadline || "");
  const deadline = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(deadlineValue)
      ? `${deadlineValue}T23:59:59.999`
      : deadlineValue,
  );
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subcontractorIds = [
    ...new Set<string>(
      Array.isArray(payload.subcontractorIds)
        ? payload.subcontractorIds.map(String)
        : [],
    ),
  ];
  if (
    !payload.companyId ||
    !payload.projectId ||
    !String(payload.title || "").trim() ||
    !String(payload.scope || "").trim() ||
    Number.isNaN(deadline.getTime())
  )
    return {
      error: "Project, title, scope and response deadline are required",
    };
  if (
    !items.length ||
    items.some((item: any) => !String(item?.name || "").trim())
  )
    return { error: "At least one named service is required" };
  if (!subcontractorIds.length)
    return { error: "At least one subcontractor is required" };
  if (items.length > 250 || subcontractorIds.length > 100)
    return { error: "Request exceeds the allowed item or recipient limit" };
  return { deadline, items, subcontractorIds };
}

export class BidRequestController {
  async addRecipients(req: Request, res: Response) {
    await reopenAutoFinalized({ id: req.params.id });
    const record = await prisma.bidRequest.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { position: "asc" } },
        recipients: true,
        company: true,
      },
    });
    if (!record) return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, record.companyId)))
      return res.status(403).json({ error: "Access denied" });
    if (record.status !== "pending" || record.approvedRecipientId)
      return res.status(409).json({ error: "This bid request is closed" });
    if (record.responseDeadline.getTime() < Date.now())
      return res.status(409).json({ error: "The response deadline has passed" });

    const subcontractorIds = [
      ...new Set<string>(
        Array.isArray(req.body?.subcontractorIds)
          ? req.body.subcontractorIds.map(String)
          : [],
      ),
    ];
    if (!subcontractorIds.length || subcontractorIds.length > 100)
      return res.status(400).json({ error: "Select at least one valid subcontractor" });
    const existingIds = new Set(record.recipients.map((item) => item.subcontractorId));
    if (subcontractorIds.some((id) => existingIds.has(id)))
      return res.status(409).json({ error: "A selected subcontractor is already part of this bid request" });
    const subcontractors = await prisma.subcontractor.findMany({
      where: { id: { in: subcontractorIds }, company_id: record.companyId },
    });
    if (subcontractors.length !== subcontractorIds.length)
      return res.status(400).json({ error: "A selected subcontractor is invalid" });

    const createdIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const subcontractor of subcontractors) {
        const recipient = await tx.bidRequestRecipient.create({
          data: {
            bidRequestId: record.id,
            subcontractorId: subcontractor.id,
            subcontractorName: subcontractor.name,
            subcontractorEmail: subcontractor.email,
            items: {
              create: record.items.map((item, position) => ({
                name: item.name,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.suggestedValue || 0,
                position,
                isCustom: false,
                sourceItemId: item.id,
              })),
            },
          },
        });
        ids.push(recipient.id);
      }
      return ids;
    });

    let delivery: { sent: number; failed: Array<{ recipient: string; error: string }> } | undefined;
    if (req.body?.sendNow !== false) {
      const newRecipients = await prisma.bidRequestRecipient.findMany({
        where: { id: { in: createdIds } },
      });
      delivery = await deliverBidRequest(
        record,
        newRecipients,
        typeof req.body?.message === "string"
          ? req.body.message.trim()
          : record.customMessage || "",
      );
    }
    const updated = await prisma.bidRequest.findUnique({
      where: { id: record.id },
      include: includeBid,
    });
    return res.status(201).json({ data: await serialize(updated), delivery });
  }

  async enterRecipientProposal(req: Request, res: Response) {
    await reopenAutoFinalized({ id: req.params.id });
    const recipient = await prisma.bidRequestRecipient.findFirst({
      where: { id: req.params.recipientId, bidRequestId: req.params.id },
      include: { bidRequest: true },
    });
    if (!recipient) return res.status(404).json({ error: "Recipient not found" });
    const bid = recipient.bidRequest;
    if (!(await canAccess(req, bid.companyId)))
      return res.status(403).json({ error: "Access denied" });
    if (bid.status === "canceled" || bid.approvedRecipientId)
      return res.status(409).json({ error: "This bid request is closed" });
    if (recipient.status !== "pending" && recipient.status !== "expired")
      return res.status(409).json({ error: "Only unanswered proposals can be entered" });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (
      !items.length ||
      items.length > 250 ||
      items.some((item: any) => !String(item?.name || "").trim() || Number(item.unitPrice) < 0)
    )
      return res.status(400).json({ error: "At least one valid proposal item is required" });
    const upload = req.body?.upload as StagedUploadReference | undefined;
    if (upload)
      await verifyStagedUploadReference(upload, {
        companyId: bid.companyId,
        userId: (req as any).userId,
        purpose: "bid-proposal-attachment",
      });
    const previousDocumentKey = recipient.externalDocumentKey;
    await prisma.$transaction(async (tx) => {
      await tx.bidProposalItem.deleteMany({ where: { recipientId: recipient.id } });
      await tx.bidRequestRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "submitted",
          submittedAt: new Date(),
          notes: String(req.body?.notes || "").trim() || null,
          submissionSource: upload ? "admin_import" : "admin_manual",
          enteredById: (req as any).userId,
          enteredAt: new Date(),
          externalDocumentKey: upload?.key || null,
          externalDocumentName: upload?.originalName || null,
          externalDocumentContentType: upload?.contentType || null,
          externalDocumentSize: upload?.size || null,
          extractionConfidence:
            req.body?.extractionConfidence == null
              ? null
              : Math.min(1, Math.max(0, Number(req.body.extractionConfidence) || 0)),
          items: {
            create: items.map((item: any, position: number) => ({
              name: String(item.name).trim(),
              description: String(item.description || "").trim() || null,
              quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
              unitPrice: Math.max(0, Number(item.unitPrice) || 0),
              position,
              isCustom: Boolean(item.isCustom),
              sourceItemId: item.sourceItemId || null,
            })),
          },
        },
      });
    });
    if (previousDocumentKey && previousDocumentKey !== upload?.key)
      await deleteS3ObjectQuietly(previousDocumentKey);
    const updated = await prisma.bidRequest.findUnique({
      where: { id: bid.id },
      include: includeBid,
    });
    return res.json({ data: await serialize(updated) });
  }

  async extractExternalProposal(req: Request, res: Response) {
    const bid = await prisma.bidRequest.findUnique({ where: { id: req.params.id } });
    if (!bid) return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, bid.companyId))) return res.status(403).json({ error: "Access denied" });
    if (bid.status !== "pending") return res.status(409).json({ error: "This bid request is closed" });
    const upload = req.body?.upload as StagedUploadReference;
    try {
      await verifyStagedUploadReference(upload, { companyId: bid.companyId, userId: (req as any).userId, purpose: "bid-proposal-attachment" });
      const supportedTypes = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
      if (!supportedTypes.has(upload.contentType)) return res.status(400).json({ error: "Only PDF and DOCX files are supported" });
      const data = await extractExternalProposalFromDocument(await getStagedObjectBuffer(upload.key), upload.originalName, upload.contentType);
      return res.json({ data });
    } catch (error: any) {
      console.error("[bidRequest.extractExternalProposal]", { message: error?.message });
      const status = Number(error?.status || 0);
      if (status === 429) return res.status(429).json({ error: "AI extraction is busy. Please try again shortly." });
      if (error?.name === "APIConnectionTimeoutError") return res.status(504).json({ error: "The document took too long to process. Please try again." });
      return res.status(500).json({ error: "Unable to read this document. You can continue with manual entry." });
    }
  }

  async createExternalProposal(req: Request, res: Response) {
    const bid = await prisma.bidRequest.findUnique({ where: { id: req.params.id } });
    if (!bid) return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, bid.companyId))) return res.status(403).json({ error: "Access denied" });
    if (bid.status !== "pending") return res.status(409).json({ error: "This bid request is closed" });
    const subcontractorName = String(req.body?.subcontractorName || "").trim();
    const subcontractorEmail = String(req.body?.subcontractorEmail || "").trim().toLowerCase();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const upload = req.body?.upload as StagedUploadReference | undefined;
    if (!subcontractorName || !/^\S+@\S+\.\S+$/.test(subcontractorEmail)) return res.status(400).json({ error: "Subcontractor name and a valid email are required" });
    if (!items.length || items.some((item: any) => !String(item?.name || "").trim())) return res.status(400).json({ error: "At least one named proposal item is required" });
    if (items.length > 250) return res.status(400).json({ error: "Proposal exceeds the 250 item limit" });

    try {
      if (upload) await verifyStagedUploadReference(upload, { companyId: bid.companyId, userId: (req as any).userId, purpose: "bid-proposal-attachment" });
      const previousDocumentKey = await prisma.$transaction(async (tx) => {
        const subcontractor = await tx.subcontractor.upsert({
          where: { email_company_id: { email: subcontractorEmail, company_id: bid.companyId } },
          update: { name: subcontractorName }, create: { name: subcontractorName, email: subcontractorEmail, company_id: bid.companyId },
        });
        const existing = await tx.bidRequestRecipient.findUnique({ where: { bidRequestId_subcontractorId: { bidRequestId: bid.id, subcontractorId: subcontractor.id } } });
        if (existing?.status === "approved") throw new Error("Approved proposals cannot be replaced");
        const common = {
          status: "submitted" as const, submittedAt: new Date(), notes: String(req.body?.notes || "").trim() || null,
          subcontractorName, subcontractorEmail, submissionSource: "external",
          externalDocumentKey: upload?.key || existing?.externalDocumentKey || null,
          externalDocumentName: upload?.originalName || existing?.externalDocumentName || null,
          externalDocumentContentType: upload?.contentType || existing?.externalDocumentContentType || null,
          externalDocumentSize: upload?.size || existing?.externalDocumentSize || null,
          extractionConfidence: req.body?.extractionConfidence == null ? null : Math.min(1, Math.max(0, Number(req.body.extractionConfidence) || 0)),
        };
        const recipient = existing
          ? await tx.bidRequestRecipient.update({ where: { id: existing.id }, data: common })
          : await tx.bidRequestRecipient.create({ data: { ...common, bidRequestId: bid.id, subcontractorId: subcontractor.id } });
        await tx.bidProposalItem.deleteMany({ where: { recipientId: recipient.id } });
        await tx.bidProposalItem.createMany({ data: items.map((item: any, position: number) => ({
          recipientId: recipient.id, name: String(item.name).trim(), description: String(item.description || "").trim() || null,
          quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1, unitPrice: Math.max(0, Number(item.unitPrice) || 0), position, isCustom: true,
        })) });
        return existing?.externalDocumentKey && upload?.key && existing.externalDocumentKey !== upload.key ? existing.externalDocumentKey : null;
      });
      if (previousDocumentKey) await deleteS3ObjectQuietly(previousDocumentKey);
      const record = await prisma.bidRequest.findUnique({ where: { id: bid.id }, include: includeBid });
      return res.status(201).json({ data: await serialize(record) });
    } catch (error: any) {
      console.error("[bidRequest.createExternalProposal]", { message: error?.message });
      if (error?.message === "Approved proposals cannot be replaced") return res.status(409).json({ error: error.message });
      return res.status(500).json({ error: "Unable to save external proposal" });
    }
  }

  async list(req: Request, res: Response) {
    const companyId = String(req.query.companyId || "");
    if (!companyId)
      return res.status(400).json({ error: "Company ID is required" });
    if (!(await canAccess(req, companyId)))
      return res.status(403).json({ error: "Access denied" });
    await reopenAutoFinalized({ companyId });
    await finalizeExpired(companyId);
    const records = await prisma.bidRequest.findMany({
      where: { companyId },
      include: includeBid,
      orderBy: { createdAt: "desc" },
    });
    return res.json({
      data: await Promise.all(records.map((record) => serialize(record))),
    });
  }

  async get(req: Request, res: Response) {
    await reopenAutoFinalized({ id: req.params.id });
    await finalizeExpired();
    const record = await prisma.bidRequest.findUnique({
      where: { id: req.params.id },
      include: includeBid,
    });
    if (!record)
      return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, record.companyId)))
      return res.status(403).json({ error: "Access denied" });
    if (
      record.status === "pending" &&
      record.responseDeadline.getTime() < Date.now()
    ) {
      const now = new Date();
      await prisma.bidRequest.update({
        where: { id: record.id },
        data: { status: "finalized", finalizedAt: now },
      });
      record.status = "finalized";
      record.finalizedAt = now;
    }
    return res.json({ data: await serialize(record) });
  }

  async create(req: Request, res: Response) {
    let persisted = false;
    const checked = validatePayload(req.body);
    if (checked.error) return res.status(400).json({ error: checked.error });
    const payload = req.body;
    if (!(await canAccess(req, payload.companyId)))
      return res.status(403).json({ error: "Access denied" });
    const project = await prisma.project.findFirst({
      where: { id: payload.projectId, company_id: payload.companyId },
      include: { client: true, workContext: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const subcontractors = await prisma.subcontractor.findMany({
      where: {
        id: { in: checked.subcontractorIds! },
        company_id: payload.companyId,
      },
    });
    if (subcontractors.length !== checked.subcontractorIds!.length)
      return res
        .status(400)
        .json({ error: "A selected subcontractor is invalid" });
    const uploads: StagedUploadReference[] = Array.isArray(payload.attachments)
      ? payload.attachments
      : [];
    if (uploads.length > 20)
      return res
        .status(400)
        .json({ error: "A maximum of 20 attachments is allowed" });
    try {
      for (const upload of uploads)
        await verifyStagedUploadReference(upload, {
          companyId: payload.companyId,
          userId: (req as any).userId,
          purpose: "bid-request-attachment",
        });
      const record = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`INSERT INTO bid_request_number_sequence (companyId, nextNumber) VALUES (${payload.companyId}, 1002) ON DUPLICATE KEY UPDATE nextNumber = nextNumber + 1`;
          const sequence = await tx.bidRequestNumberSequence.findUniqueOrThrow({
            where: { companyId: payload.companyId },
          });
          const baseItems = checked.items!.map(
            (item: any, position: number) => ({
              name: String(item.name).trim(),
              description: String(item.description || "").trim() || null,
              quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
              suggestedValue:
                item.suggestedValue === "" || item.suggestedValue == null
                  ? null
                  : Math.max(0, Number(item.suggestedValue) || 0),
              position,
            }),
          );
          return tx.bidRequest.create({
            data: {
              number: sequence.nextNumber - 1,
              companyId: payload.companyId,
              projectId: payload.projectId,
              title: String(payload.title).trim(),
              scope: String(payload.scope).trim(),
              responseDeadline: checked.deadline!,
              externalFolderUrl:
                String(payload.externalFolderUrl || "").trim() || null,
              customMessage: String(payload.customMessage || "").trim() || null,
              projectNumber: project.contract_number
                ? String(project.contract_number)
                : null,
              projectName:
                project.client?.name ||
                project.workContext?.Name ||
                project.workContext?.label ||
                "Project",
              projectAddress:
                project.workContext?.location ||
                project.location ||
                project.client?.location ||
                project.client?.addressOffice ||
                null,
              createdById: (req as any).userId,
              items: { create: baseItems },
              attachments: {
                create: uploads.map((upload) => ({
                  key: upload.key,
                  originalName: upload.originalName,
                  contentType: upload.contentType,
                  size: upload.size,
                })),
              },
              recipients: {
                create: subcontractors.map((subcontractor) => ({
                  subcontractorId: subcontractor.id,
                  subcontractorName: subcontractor.name,
                  subcontractorEmail: subcontractor.email,
                  items: {
                    create: baseItems.map(
                      (
                        item: {
                          name: string;
                          description: string | null;
                          quantity: number;
                          suggestedValue: number | null;
                        },
                        position: number,
                      ) => ({
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.suggestedValue || 0,
                        position,
                        isCustom: false,
                      }),
                    ),
                  },
                })),
              },
            },
            include: includeBid,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      persisted = true;
      return res.status(201).json({ data: await serialize(record) });
    } catch (error) {
      if (!persisted)
        await Promise.all(
          uploads.map((upload) => deleteS3ObjectQuietly(upload.key)),
        );
      console.error("[bidRequest.create]", error);
      return res.status(500).json({ error: "Unable to create bid request" });
    }
  }

  async update(req: Request, res: Response) {
    const payload = req.body;
    const record = await prisma.bidRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!record)
      return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, record.companyId)))
      return res.status(403).json({ error: "Access denied" });
    if (record.status !== "pending" || record.approvedRecipientId)
      return res.status(409).json({ error: "Only open bid requests can be edited" });

    const title = String(payload.title || "").trim();
    if (!title)
      return res.status(400).json({ error: "Title is required" });
    if (title.length > 191)
      return res.status(400).json({ error: "Title is too long" });

    try {
      await prisma.bidRequest.update({
        where: { id: record.id },
        data: { title },
      });
      const updated = await prisma.bidRequest.findUnique({
        where: { id: record.id },
        include: includeBid,
      });
      return res.json({ data: await serialize(updated) });
    } catch (error) {
      console.error("[bidRequest.update]", error);
      return res.status(500).json({ error: "Unable to update bid request" });
    }
  }

  async send(req: Request, res: Response) {
    await reopenAutoFinalized({ id: req.params.id });
    await finalizeExpired();
    const record = await prisma.bidRequest.findUnique({
      where: { id: req.params.id },
      include: { recipients: true, company: true },
    });
    if (!record)
      return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, record.companyId)))
      return res.status(403).json({ error: "Access denied" });
    if (
      record.status === "pending" &&
      record.responseDeadline.getTime() < Date.now()
    ) {
      await prisma.bidRequest.update({
        where: { id: record.id },
        data: { status: "finalized", finalizedAt: new Date() },
      });
      return res
        .status(409)
        .json({
          error:
            "This bid request is finalized because the response deadline has passed",
        });
    }
    if (record.status !== "pending")
      return res
        .status(409)
        .json({ error: "Only pending bid requests can be sent" });
    const requestedRecipientIds = Array.isArray(req.body?.recipientIds)
      ? [...new Set<string>(req.body.recipientIds.map(String))]
      : [];
    const recipients = requestedRecipientIds.length
      ? record.recipients.filter((recipient) =>
          requestedRecipientIds.includes(recipient.id),
        )
      : record.recipients;
    if (
      !recipients.length ||
      (requestedRecipientIds.length &&
        recipients.length !== requestedRecipientIds.length)
    ) {
      return res
        .status(400)
        .json({ error: "Select at least one valid subcontractor" });
    }
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : record.customMessage || "";
    const delivery = await deliverBidRequest(record, recipients, message);
    if (delivery.failed.length === recipients.length)
      return res
        .status(502)
        .json({ error: "Unable to send bid request", failed: delivery.failed });
    return res.json({
      success: true,
      sent: delivery.sent,
      failed: delivery.failed,
    });
  }

  async cancel(req: Request, res: Response) {
    const record = await prisma.bidRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!record)
      return res.status(404).json({ error: "Bid request not found" });
    if (!(await canAccess(req, record.companyId)))
      return res.status(403).json({ error: "Access denied" });
    if (record.status !== "pending")
      return res
        .status(409)
        .json({ error: "Only pending bid requests can be canceled" });
    await prisma.bidRequest.update({
      where: { id: record.id },
      data: { status: "canceled", canceledAt: new Date() },
    });
    return res.json({ success: true });
  }

  async getPublic(req: Request, res: Response) {
    await finalizeExpired();
    const recipient = await prisma.bidRequestRecipient.findUnique({
      where: { publicToken: req.params.publicToken },
      include: {
        items: { orderBy: { position: "asc" } },
        bidRequest: {
          include: {
            items: { orderBy: { position: "asc" } },
            attachments: true,
            company: { select: { name: true, avatar: true } },
          },
        },
      },
    });
    if (!recipient)
      return res.status(404).json({ error: "Bid request not found" });
    const bid = recipient.bidRequest;
    if (
      bid.status === "pending" &&
      bid.responseDeadline.getTime() < Date.now()
    ) {
      const now = new Date();
      await prisma.bidRequest.update({
        where: { id: bid.id },
        data: { status: "finalized", finalizedAt: now },
      });
      bid.status = "finalized";
      bid.finalizedAt = now;
    }
    const company = {
      ...bid.company,
      avatar: bid.company.avatar
        ? await getPresignedUrl(bid.company.avatar).catch(() => "")
        : "",
    };
    return res.json({
      data: await serialize(
        { ...bid, company, recipients: [recipient] },
        recipient.id,
      ),
    });
  }

  async submitPublic(req: Request, res: Response) {
    await finalizeExpired();
    const recipient = await prisma.bidRequestRecipient.findUnique({
      where: { publicToken: req.params.publicToken },
      include: { bidRequest: true },
    });
    if (!recipient)
      return res.status(404).json({ error: "Bid request not found" });
    if (recipient.bidRequest.status !== "pending")
      return res.status(409).json({ error: "This bid request is closed" });
    if (recipient.bidRequest.responseDeadline.getTime() < Date.now())
      return res
        .status(409)
        .json({ error: "The response deadline has passed" });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (
      !items.length ||
      items.length > 250 ||
      items.some(
        (item: any) =>
          !String(item?.name || "").trim() || Number(item.unitPrice) < 0,
      )
    )
      return res
        .status(400)
        .json({ error: "At least one valid service and price is required" });
    await prisma.$transaction(async (tx) => {
      await tx.bidProposalItem.deleteMany({
        where: { recipientId: recipient.id },
      });
      await tx.bidRequestRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "submitted",
          submittedAt: new Date(),
          notes: String(req.body.notes || "").trim() || null,
          items: {
            create: items.map((item: any, position: number) => ({
              name: String(item.name).trim(),
              description: String(item.description || "").trim() || null,
              quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
              unitPrice: Number(item.unitPrice) || 0,
              position,
              isCustom: Boolean(item.isCustom),
              sourceItemId: item.sourceItemId || null,
            })),
          },
        },
      });
    });
    return res.json({ success: true });
  }

  async approve(req: Request, res: Response) {
    const recipient = await prisma.bidRequestRecipient.findUnique({
      where: { id: req.params.recipientId },
      include: {
        items: true,
        subcontractor: true,
        bidRequest: {
          include: {
            company: true,
            project: { include: { client: true, workContext: true } },
          },
        },
      },
    });
    if (!recipient)
      return res.status(404).json({ error: "Proposal not found" });
    const bid = recipient.bidRequest;
    if (!(await canAccess(req, bid.companyId)))
      return res.status(403).json({ error: "Access denied" });
    const canAward =
      bid.status === "pending" ||
      (bid.status === "finalized" && !bid.approvedRecipientId);
    if (!canAward || recipient.status !== "submitted")
      return res
        .status(409)
        .json({
          error:
            "Only submitted proposals from open or deadline-finalized requests can be approved",
        });
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO work_order_number_sequence (companyId, nextNumber) VALUES (${bid.companyId}, 1030) ON DUPLICATE KEY UPDATE nextNumber = nextNumber + 1`;
      const sequence = await tx.workOrderNumberSequence.findUniqueOrThrow({
        where: { companyId: bid.companyId },
      });
      const now = new Date();
      const workOrder = await tx.workOrder.create({
        data: {
          number: sequence.nextNumber - 1,
          companyId: bid.companyId,
          projectId: bid.projectId,
          status: "pending",
          title: bid.title,
          scope: bid.scope,
          startDate: now,
          endDate: bid.responseDeadline > now ? bid.responseDeadline : now,
          assigneeType: "subcontractor",
          assigneeId: recipient.subcontractorId,
          assigneeName: recipient.subcontractorName,
          assigneeEmail: recipient.subcontractorEmail,
          assigneePhone: recipient.subcontractor.phone,
          projectNumber: bid.projectNumber,
          projectName: bid.projectName,
          projectAddress: bid.projectAddress,
          managerSignature: bid.company.signature,
          managerSignedAt: bid.company.signature ? now : null,
          items: {
            create: recipient.items.map((item, position) => ({
              type: "service",
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              position,
            })),
          },
        },
      });
      await tx.bidRequestRecipient.update({
        where: { id: recipient.id },
        data: { status: "approved", approvedAt: now },
      });
      await tx.bidRequestRecipient.updateMany({
        where: { bidRequestId: bid.id, id: { not: recipient.id } },
        data: { status: "rejected", rejectedAt: now },
      });
      await tx.bidRequest.update({
        where: { id: bid.id },
        data: {
          status: "finalized",
          finalizedAt: now,
          approvedRecipientId: recipient.id,
          approvedWorkOrderId: workOrder.id,
        },
      });
      return workOrder;
    });
    return res.json({ success: true, workOrderId: result.id });
  }
}
