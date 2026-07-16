import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";
import { bidRequestEmail } from "../../templateEmail/bidRequest";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import {
  deleteS3ObjectQuietly,
  StagedUploadReference,
  verifyStagedUploadReference,
} from "../../utils/S3/stagedUpload";

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
  const recipients = (bid.recipients || [])
    .filter(
      (recipient: any) =>
        !publicRecipientId || recipient.id === publicRecipientId,
    )
    .map((recipient: any) => ({
      id: recipient.id,
      status: recipient.status,
      subcontractorId: recipient.subcontractorId,
      subcontractorName: recipient.subcontractorName,
      subcontractorEmail: recipient.subcontractorEmail,
      submittedAt: recipient.submittedAt,
      approvedAt: recipient.approvedAt,
      rejectedAt: recipient.rejectedAt,
      notes: recipient.notes || "",
      items: serializeItems(recipient.items),
      total: proposalTotal(recipient.items),
    }));
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
  async list(req: Request, res: Response) {
    const companyId = String(req.query.companyId || "");
    if (!companyId)
      return res.status(400).json({ error: "Company ID is required" });
    if (!(await canAccess(req, companyId)))
      return res.status(403).json({ error: "Access denied" });
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

  async send(req: Request, res: Response) {
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
    if (failed.length === results.length)
      return res
        .status(502)
        .json({ error: "Unable to send bid request", failed });
    await prisma.bidRequest.update({
      where: { id: record.id },
      data: { sentAt: new Date() },
    });
    return res.json({
      success: true,
      sent: results.length - failed.length,
      failed,
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
      const pendingRecipients = await tx.bidRequestRecipient.count({
        where: { bidRequestId: recipient.bidRequestId, status: "pending" },
      });
      if (pendingRecipients === 0) {
        await tx.bidRequest.updateMany({
          where: { id: recipient.bidRequestId, status: "pending" },
          data: { status: "finalized", finalizedAt: new Date() },
        });
      }
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
