import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { workOrderEmail } from "../../templateEmail/workOrder";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { deleteS3ObjectQuietly, getStagedObjectBuffer, putS3ObjectBuffer, StagedUploadReference, verifyStagedUploadReference } from "../../utils/S3/stagedUpload";
import { signWorkOrderPdf } from "../../utils/workOrders/signWorkOrderPdf";

const includeWorkOrder = {
  items: { orderBy: { position: "asc" as const } },
  attachments: { orderBy: { date_creation: "asc" as const } },
  emailLogs: { orderBy: { sentAt: "desc" as const } },
  projectManagers: { orderBy: { position: "asc" as const } },
  company: { select: { name: true, signature: true } },
};

const includePublicWorkOrder = {
  items: { orderBy: { position: "asc" as const } },
  attachments: { orderBy: { date_creation: "asc" as const } },
  projectManagers: { orderBy: { position: "asc" as const } },
  company: { select: { name: true, avatar: true, signature: true } },
};

const asDate = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serialize = (order: any, publicView = false) => {
  const { sourcePdfKey, signedPdfKey, attachments, projectManagers, ...safeOrder } = order;
  void sourcePdfKey; void signedPdfKey; void attachments; void projectManagers;
  const visibleOrder = publicView && order.showClientName === false
    ? { ...safeOrder, projectName: undefined }
    : safeOrder;
  return {
    ...visibleOrder,
    attachments: [],
    projectManagers: (order.projectManagers || []).map((manager: any) => publicView ? {
      id: manager.id,
      name: manager.name,
      phone: manager.phone || null,
    } : manager),
    items: (order.items || []).map((item: any) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
  };
};

async function serializeWithPdfUrls(order: any, publicView = false) {
  const serialized = serialize(order, publicView);
  const attachments = await Promise.all((order.attachments || []).map(async (attachment: any) => ({
    id: attachment.id,
    uri: attachment.url ? await getPresignedUrl(attachment.url).catch(() => "") : "",
    title: attachment.title || "",
  })));
  return {
    ...serialized,
    attachments,
    pdfUrl: order.sourcePdfKey ? await getPresignedUrl(order.sourcePdfKey).catch(() => "") : "",
    signedPdfUrl: order.signedPdfKey ? await getPresignedUrl(order.signedPdfKey).catch(() => "") : "",
  };
}

type AttachmentCreate = { title?: string; upload: StagedUploadReference };

async function validateAttachments(payload: any, companyId: string, userId: string) {
  const submittedExistingIds: string[] = Array.isArray(payload.attachments?.existingIds)
    ? payload.attachments.existingIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id))
    : [];
  const existingIds = [...new Set(submittedExistingIds)];
  const create = Array.isArray(payload.attachments?.create) ? payload.attachments.create as AttachmentCreate[] : [];
  if (existingIds.length + create.length > 10) throw new Error("ATTACHMENT_LIMIT");
  for (const attachment of create) {
    if (!attachment?.upload || String(attachment.title || "").length > 191) throw new Error("INVALID_ATTACHMENT");
    try {
      await verifyStagedUploadReference(attachment.upload, { companyId, userId, purpose: "work-order-attachment" });
    } catch {
      throw new Error("INVALID_ATTACHMENT");
    }
  }
  return { existingIds, create };
}

const pdfKey = (order: { companyId: string; id: string }, kind: "source" | "signed") =>
  `work-orders/${order.companyId}/${order.id}/${kind}-${Date.now()}-${randomUUID()}.pdf`;

const isRetryableTransactionError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("deadlock") || message.includes("lock wait timeout");
};

async function withTransactionRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function canAccessCompany(req: Request, companyId: string) {
  const userId = (req as any).userId as string | undefined;
  if (!userId) return false;
  return Boolean(await prisma.user.findFirst({
    where: {
      id: userId,
      OR: [{ company_id: companyId }, { companies: { some: { companyId } } }],
    },
    select: { id: true },
  }));
}

async function resolveProjectAndAssignee(companyId: string, payload: any, existingManagerIds: string[] = [], allowLegacySnapshot = false) {
  const project = await prisma.project.findFirst({
    where: { id: payload.projectId, company_id: companyId },
    include: { client: true, workContext: true, project_manager: true, company: { select: { signature: true } } },
  });
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  const assignee = payload.assigneeType === "employee"
    ? await prisma.user.findFirst({
        where: { id: payload.assigneeId, OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] },
        select: { id: true, name: true, email: true, phone: true },
      })
    : payload.assigneeType === "subcontractor"
      ? await prisma.subcontractor.findFirst({
          where: { id: payload.assigneeId, company_id: companyId },
          select: { id: true, name: true, email: true, phone: true },
        })
      : null;
  if (!assignee) throw new Error("ASSIGNEE_NOT_FOUND");

  const submittedManagerIds = Array.isArray(payload.projectManagers)
    ? payload.projectManagers.map((manager: any) => String(manager?.userId || "")).filter(Boolean)
    : project.project_manager_id ? [project.project_manager_id] : [];
  const managerIds = [...new Set<string>(submittedManagerIds)];
  if (managerIds.length > 20) throw new Error("TOO_MANY_PROJECT_MANAGERS");
  const existingManagerIdSet = new Set(existingManagerIds);
  const managers = managerIds.length ? await prisma.user.findMany({
    where: {
      id: { in: managerIds },
      OR: [
        ...(existingManagerIds.length ? [{ id: { in: existingManagerIds } }] : []),
        { company_id: companyId },
        { companies: { some: { companyId } } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true, isDisabled: true, office: { select: { name: true } } },
  }) : [];
  const managerById = new Map(managers
    .filter((manager) => existingManagerIdSet.has(manager.id) || (!manager.isDisabled && !["worker", "master"].includes((manager.office?.name || "").toLowerCase())))
    .map((manager) => [manager.id, manager]));
  if (managerById.size !== managerIds.length) throw new Error("INVALID_PROJECT_MANAGER");
  const projectManagers = managerIds.map((id, position) => {
    const manager = managerById.get(id)!;
    return { userId: manager.id, name: manager.name, email: manager.email || null, phone: manager.phone || null, position };
  });
  const primaryManager = projectManagers[0];

  return {
    project,
    assignee,
    companySignature: project.company?.signature || null,
    snapshot: {
      projectNumber: project.contract_number ? String(project.contract_number) : null,
      projectName: project.client?.name || project.workContext?.Name || project.workContext?.label || "Project",
      projectAddress: project.workContext?.location || project.location || project.client?.location || project.client?.addressOffice || null,
      projectManagerName: primaryManager?.name || (allowLegacySnapshot ? String(payload.projectManagerName || "").trim() : "") || null,
      projectManagerPhone: primaryManager?.phone || (allowLegacySnapshot ? String(payload.projectManagerPhone || "").trim() : "") || null,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email || null,
      assigneePhone: assignee.phone || null,
    },
    projectManagers,
  };
}

function validatePayload(payload: any) {
  const startDate = asDate(payload.startDate);
  const endDate = asDate(payload.endDate);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!payload.companyId || !payload.projectId || !payload.assigneeId || !payload.title?.trim() || !startDate || !endDate) {
    return { error: "Company, project, assignee, title and schedule are required" };
  }
  if (endDate < startDate) return { error: "End date cannot be before start date" };
  if (!items.length || items.some((item: any) => !item?.name?.trim())) return { error: "At least one named service is required" };
  if (payload.title.trim().length > 191) return { error: "Title cannot exceed 191 characters" };
  if (String(payload.scope || "").trim().length > 60000) return { error: "Scope of work is too long" };
  if (items.some((item: any) => item.name.trim().length > 191)) return { error: "Service title cannot exceed 191 characters" };
  if (items.some((item: any) => String(item.description || "").length > 60000)) return { error: "Service description is too long" };
  if (String(payload.projectManagerName || "").length > 191 || String(payload.projectManagerPhone || "").length > 191) {
    return { error: "Project manager information is too long" };
  }
  if (String(payload.terms || "").length > 60000) {
    return { error: "Terms are too long" };
  }
  if (payload.showServicePrices !== undefined && typeof payload.showServicePrices !== "boolean") {
    return { error: "showServicePrices must be a boolean" };
  }
  if (payload.showClientName !== undefined && typeof payload.showClientName !== "boolean") {
    return { error: "showClientName must be a boolean" };
  }
  return { startDate, endDate, items };
}

export class WorkOrderController {
  async getPublic(req: Request, res: Response) {
    const order = await prisma.workOrder.findUnique({
      where: { publicToken: req.params.publicToken },
      include: includePublicWorkOrder,
    });
    if (!order) return res.status(404).json({ error: "Work order not found" });
    const company = {
      ...order.company,
      avatar: order.company.avatar
        ? await getPresignedUrl(order.company.avatar).catch(() => "")
        : "",
    };
    return res.json({ data: await serializeWithPdfUrls({ ...order, company }, true) });
  }

  async signPublic(req: Request, res: Response) {
    const signature = typeof req.body.signature === "string" ? req.body.signature.trim() : "";
    if (!/^data:image\/(png|jpe?g);base64,/i.test(signature)) {
      return res.status(400).json({ error: "A valid signature is required" });
    }
    if (signature.length > 6_000_000) {
      return res.status(413).json({ error: "Signature image is too large" });
    }

    try {
      const existing = await prisma.workOrder.findUnique({ where: { publicToken: req.params.publicToken } });
      if (!existing) return res.status(404).json({ error: "Work order not found" });

      if (existing.status === "canceled") return res.status(409).json({ error: "This work order has been canceled" });
      if (existing.status === "pending") {
        if (!existing.sourcePdfKey) return res.status(409).json({ error: "This work order must be sent again before it can be signed" });
        const signedAt = new Date();
        const sourcePdf = await getStagedObjectBuffer(existing.sourcePdfKey);
        const signedPdf = await signWorkOrderPdf(sourcePdf, signature, signedAt);
        const signedPdfKey = pdfKey(existing, "signed");
        await putS3ObjectBuffer({ key: signedPdfKey, body: signedPdf, contentType: "application/pdf" });
        const updated = await prisma.workOrder.updateMany({
          where: { id: existing.id, status: "pending" },
          data: { status: "approved", approvedAt: signedAt, assigneeSignature: signature, assigneeSignedAt: signedAt, signedPdfKey },
        });
        if (updated.count === 0) await deleteS3ObjectQuietly(signedPdfKey);
      }

      const order = await prisma.workOrder.findUniqueOrThrow({
        where: { id: existing.id },
        include: includePublicWorkOrder,
      });
      const company = {
        ...order.company,
        avatar: order.company.avatar
          ? await getPresignedUrl(order.company.avatar).catch(() => "")
          : "",
      };
      return res.json({ data: await serializeWithPdfUrls({ ...order, company }, true) });
    } catch (error) {
      console.error("[workOrder.signPublic]", error);
      return res.status(500).json({ error: "Unable to sign work order" });
    }
  }

  async nextNumber(req: Request, res: Response) {
    const { companyId } = req.params;
    if (!await canAccessCompany(req, companyId)) return res.status(403).json({ error: "Access denied" });
    const sequence = await prisma.workOrderNumberSequence.findUnique({ where: { companyId } });
    return res.json({ number: sequence?.nextNumber || 1029 });
  }

  async list(req: Request, res: Response) {
    const companyId = String(req.query.companyId || "");
    const projectId = String(req.query.projectId || "");
    if (!companyId) return res.status(400).json({ error: "Company ID is required" });
    if (!await canAccessCompany(req, companyId)) return res.status(403).json({ error: "Access denied" });
    const orders = await prisma.workOrder.findMany({ where: { companyId, ...(projectId ? { projectId } : {}) }, include: includeWorkOrder, orderBy: { createdAt: "desc" } });
    return res.json({ data: orders.map((order) => serialize(order)) });
  }

  async listMine(req: Request, res: Response) {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Authenticated user not found" });

    const orders = await prisma.workOrder.findMany({
      where: {
        OR: [
          { assigneeType: "employee", assigneeId: userId },
          { projectManagers: { some: { userId } } },
        ],
      },
      include: includeWorkOrder,
      orderBy: { createdAt: "desc" },
    });

    return res.json({ data: orders.map((order) => serialize(order)) });
  }

  async listMineByProject(req: Request, res: Response) {
    const projectId = String(req.params.projectId || "");
    const userId = (req as any).userId as string | undefined;
    if (!projectId) return res.status(400).json({ error: "Project ID is required" });
    if (!userId) return res.status(401).json({ error: "Authenticated user not found" });

    const orders = await prisma.workOrder.findMany({
      where: {
        projectId,
        OR: [
          { assigneeType: "employee", assigneeId: userId },
          { projectManagers: { some: { userId } } },
        ],
      },
      include: includeWorkOrder,
      orderBy: { createdAt: "desc" },
    });

    return res.json({ data: orders.map((order) => serialize(order)) });
  }

  async getMine(req: Request, res: Response) {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Authenticated user not found" });

    const order = await prisma.workOrder.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { assigneeType: "employee", assigneeId: userId },
          { projectManagers: { some: { userId } } },
        ],
      },
      include: includePublicWorkOrder,
    });
    if (!order) return res.status(404).json({ error: "Work order not found" });

    const data = await serializeWithPdfUrls(order);
    return res.json({
      data: {
        ...data,
        canSign: order.assigneeType === "employee" && order.assigneeId === userId,
      },
    });
  }

  async signMine(req: Request, res: Response) {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Authenticated user not found" });

    const signature = typeof req.body.signature === "string" ? req.body.signature.trim() : "";
    if (!/^data:image\/(png|jpe?g);base64,/i.test(signature)) {
      return res.status(400).json({ error: "A valid signature is required" });
    }
    if (signature.length > 6_000_000) {
      return res.status(413).json({ error: "Signature image is too large" });
    }

    try {
      const existing = await prisma.workOrder.findFirst({
        where: {
          id: req.params.id,
          assigneeType: "employee",
          assigneeId: userId,
        },
      });
      if (!existing) return res.status(404).json({ error: "Work order not found" });
      if (existing.status === "canceled") {
        return res.status(409).json({ error: "This work order has been canceled" });
      }

      if (existing.status === "pending") {
        if (!existing.sourcePdfKey) {
          return res.status(409).json({ error: "This work order must be sent again before it can be signed" });
        }
        const signedAt = new Date();
        const sourcePdf = await getStagedObjectBuffer(existing.sourcePdfKey);
        const signedPdf = await signWorkOrderPdf(sourcePdf, signature, signedAt);
        const signedPdfKey = pdfKey(existing, "signed");
        await putS3ObjectBuffer({ key: signedPdfKey, body: signedPdf, contentType: "application/pdf" });
        const updated = await prisma.workOrder.updateMany({
          where: {
            id: existing.id,
            status: "pending",
            assigneeType: "employee",
            assigneeId: userId,
          },
          data: {
            status: "approved",
            approvedAt: signedAt,
            assigneeSignature: signature,
            assigneeSignedAt: signedAt,
            signedPdfKey,
          },
        });
        if (updated.count === 0) await deleteS3ObjectQuietly(signedPdfKey);
      }

      const order = await prisma.workOrder.findUniqueOrThrow({
        where: { id: existing.id },
        include: includePublicWorkOrder,
      });
      return res.json({
        data: {
          ...await serializeWithPdfUrls(order),
          canSign: order.assigneeType === "employee" && order.assigneeId === userId,
        },
      });
    } catch (error) {
      console.error("[workOrder.signMine]", error);
      return res.status(500).json({ error: "Unable to sign work order" });
    }
  }

  async get(req: Request, res: Response) {
    const order = await prisma.workOrder.findUnique({ where: { id: req.params.id }, include: includeWorkOrder });
    if (!order) return res.status(404).json({ error: "Work order not found" });
    if (!await canAccessCompany(req, order.companyId)) return res.status(403).json({ error: "Access denied" });
    return res.json({ data: await serializeWithPdfUrls(order) });
  }

  async create(req: Request, res: Response) {
    let stagedAttachmentKeys: string[] = [];
    let attachmentsPersisted = false;
    try {
      const checked = validatePayload(req.body);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const payload = req.body;
      if (!await canAccessCompany(req, payload.companyId)) return res.status(403).json({ error: "Access denied" });
      const userId = (req as any).userId as string;
      const attachmentChanges = await validateAttachments(payload, payload.companyId, userId);
      if (attachmentChanges.existingIds.length) throw new Error("INVALID_ATTACHMENT");
      stagedAttachmentKeys = attachmentChanges.create.map((attachment) => attachment.upload.key);
      const { snapshot, companySignature, projectManagers } = await resolveProjectAndAssignee(payload.companyId, payload);

      const order = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO work_order_number_sequence (companyId, nextNumber)
          VALUES (${payload.companyId}, 1030)
          ON DUPLICATE KEY UPDATE nextNumber = nextNumber + 1
        `;
        const sequence = await tx.workOrderNumberSequence.findUniqueOrThrow({ where: { companyId: payload.companyId } });
        return tx.workOrder.create({
          data: {
            number: sequence.nextNumber - 1,
            companyId: payload.companyId,
            projectId: payload.projectId,
            status: "pending",
            title: payload.title.trim(),
            scope: String(payload.scope || "").trim(),
            startDate: checked.startDate!,
            endDate: checked.endDate!,
            assigneeType: payload.assigneeType,
            assigneeId: payload.assigneeId,
            ...snapshot,
            showClientName: payload.showClientName !== false,
            showServicePrices: payload.showServicePrices !== false,
            terms: payload.terms || null,
            managerSignature: companySignature,
            managerSignedAt: companySignature ? new Date() : null,
            projectManagers: { create: projectManagers },
            attachments: { create: attachmentChanges.create.map((attachment) => ({
              url: attachment.upload.key,
              original_filename: attachment.upload.originalName,
              title: attachment.title?.trim() || null,
              type_images_attachments: "image",
              projectId: payload.projectId,
            })) },
            items: { create: checked.items!.map((item: any, position: number) => ({
              type: item.type === "material" ? "material" : "service",
              name: item.name.trim(), description: item.description?.trim() || null,
              quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
              unitPrice: Number(item.unitPrice) >= 0 ? Number(item.unitPrice) : 0,
              position,
            })) },
          },
          include: includeWorkOrder,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 }));
      attachmentsPersisted = true;
      return res.status(201).json({ data: await serializeWithPdfUrls(order) });
    } catch (error) {
      if (!attachmentsPersisted) await Promise.all(stagedAttachmentKeys.map((key) => deleteS3ObjectQuietly(key)));
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return res.status(404).json({ error: "Project not found" });
      if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") return res.status(404).json({ error: "Employee or subcontractor not found" });
      if (error instanceof Error && error.message === "INVALID_PROJECT_MANAGER") return res.status(400).json({ error: "A selected project manager is invalid" });
      if (error instanceof Error && error.message === "TOO_MANY_PROJECT_MANAGERS") return res.status(400).json({ error: "A maximum of 20 project managers is allowed" });
      if (error instanceof Error && error.message === "ATTACHMENT_LIMIT") return res.status(400).json({ error: "A maximum of 10 image attachments is allowed" });
      if (error instanceof Error && error.message === "INVALID_ATTACHMENT") return res.status(400).json({ error: "An image attachment is invalid" });
      console.error("[workOrder.create]", error);
      return res.status(500).json({ error: "Unable to create work order" });
    }
  }

  async update(req: Request, res: Response) {
    let stagedAttachmentKeys: string[] = [];
    let attachmentsPersisted = false;
    try {
      const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id }, include: { attachments: true, projectManagers: true } });
      if (!existing) return res.status(404).json({ error: "Work order not found" });
      if (!await canAccessCompany(req, existing.companyId)) return res.status(403).json({ error: "Access denied" });
      const payload = { ...req.body, companyId: existing.companyId };
      const checked = validatePayload(payload);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const existingManagerIds = existing.projectManagers.flatMap((manager) => manager.userId ? [manager.userId] : []);
      const { snapshot, companySignature, projectManagers } = await resolveProjectAndAssignee(existing.companyId, payload, existingManagerIds, existing.projectManagers.length === 0);
      const userId = (req as any).userId as string;
      const attachmentPayload = payload.attachments === undefined
        ? { ...payload, attachments: { existingIds: existing.attachments.map((attachment) => attachment.id), create: [] } }
        : payload;
      const attachmentChanges = await validateAttachments(attachmentPayload, existing.companyId, userId);
      const existingAttachmentIds = new Set(existing.attachments.map((attachment) => attachment.id));
      if (attachmentChanges.existingIds.some((id) => !existingAttachmentIds.has(id))) throw new Error("INVALID_ATTACHMENT");
      stagedAttachmentKeys = attachmentChanges.create.map((attachment) => attachment.upload.key);
      const keptAttachmentIds = new Set(attachmentChanges.existingIds);
      const removedAttachments = existing.attachments.filter((attachment) => !keptAttachmentIds.has(attachment.id));
      const obsoletePdfKeys = [existing.sourcePdfKey, existing.signedPdfKey];
      const order = await prisma.$transaction(async (tx) => {
        await tx.workOrderItem.deleteMany({ where: { workOrderId: existing.id } });
        await tx.workOrderProjectManager.deleteMany({ where: { workOrderId: existing.id } });
        if (removedAttachments.length) await tx.imagesAttachments.deleteMany({ where: { id: { in: removedAttachments.map((attachment) => attachment.id) }, workOrderId: existing.id } });
        if (attachmentChanges.existingIds.length) await tx.imagesAttachments.updateMany({ where: { id: { in: attachmentChanges.existingIds }, workOrderId: existing.id }, data: { projectId: payload.projectId } });
        return tx.workOrder.update({
          where: { id: existing.id },
          data: {
            projectId: payload.projectId, title: payload.title.trim(), scope: String(payload.scope || "").trim(),
            startDate: checked.startDate!, endDate: checked.endDate!, assigneeType: payload.assigneeType,
            assigneeId: payload.assigneeId, ...snapshot, terms: payload.terms || null,
            showClientName: typeof payload.showClientName === "boolean"
              ? payload.showClientName
              : existing.showClientName,
            showServicePrices: typeof payload.showServicePrices === "boolean"
              ? payload.showServicePrices
              : existing.showServicePrices,
            managerSignature: companySignature || existing.managerSignature,
            managerSignedAt: (companySignature || existing.managerSignature) ? (existing.managerSignedAt || new Date()) : null,
            status: "pending", approvedAt: null, canceledAt: null, assigneeSignature: null, assigneeSignedAt: null,
            sourcePdfKey: null, signedPdfKey: null, lastSentAt: null, publicToken: randomUUID(),
            projectManagers: { create: projectManagers },
            attachments: { create: attachmentChanges.create.map((attachment) => ({
              url: attachment.upload.key,
              original_filename: attachment.upload.originalName,
              title: attachment.title?.trim() || null,
              type_images_attachments: "image",
              projectId: payload.projectId,
            })) },
            items: { create: checked.items!.map((item: any, position: number) => ({
              type: item.type === "material" ? "material" : "service", name: item.name.trim(),
              description: item.description?.trim() || null, quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
              unitPrice: Number(item.unitPrice) >= 0 ? Number(item.unitPrice) : 0, position,
            })) },
          },
          include: includeWorkOrder,
        });
      });
      attachmentsPersisted = true;
      await Promise.all(obsoletePdfKeys.map((key) => deleteS3ObjectQuietly(key)));
      await Promise.all(removedAttachments.map((attachment) => deleteS3ObjectQuietly(attachment.url)));
      return res.json({ data: await serializeWithPdfUrls(order) });
    } catch (error) {
      if (!attachmentsPersisted) await Promise.all(stagedAttachmentKeys.map((key) => deleteS3ObjectQuietly(key)));
      if (error instanceof Error && error.message === "ATTACHMENT_LIMIT") return res.status(400).json({ error: "A maximum of 10 image attachments is allowed" });
      if (error instanceof Error && error.message === "INVALID_ATTACHMENT") return res.status(400).json({ error: "An image attachment is invalid" });
      if (error instanceof Error && error.message === "INVALID_PROJECT_MANAGER") return res.status(400).json({ error: "A selected project manager is invalid" });
      if (error instanceof Error && error.message === "TOO_MANY_PROJECT_MANAGERS") return res.status(400).json({ error: "A maximum of 20 project managers is allowed" });
      console.error("[workOrder.update]", error);
      return res.status(500).json({ error: "Unable to update work order" });
    }
  }

  async remove(req: Request, res: Response) {
    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id }, include: { attachments: true } });
    if (!existing) return res.status(404).json({ error: "Work order not found" });
    if (!await canAccessCompany(req, existing.companyId)) return res.status(403).json({ error: "Access denied" });
    await prisma.workOrder.delete({ where: { id: existing.id } });
    await Promise.all([deleteS3ObjectQuietly(existing.sourcePdfKey), deleteS3ObjectQuietly(existing.signedPdfKey)]);
    await Promise.all(existing.attachments.map((attachment) => deleteS3ObjectQuietly(attachment.url)));
    return res.status(204).send();
  }

  async cancel(req: Request, res: Response) {
    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Work order not found" });
    if (!await canAccessCompany(req, existing.companyId)) return res.status(403).json({ error: "Access denied" });
    if (existing.status === "canceled") return res.status(409).json({ error: "Work order is already canceled" });

    const order = await prisma.workOrder.update({
      where: { id: existing.id },
      data: { status: "canceled", canceledAt: new Date() },
      include: includeWorkOrder,
    });
    return res.json({ data: await serializeWithPdfUrls(order) });
  }

  async send(req: Request, res: Response) {
    const pdf = req.file;
    if (!pdf) return res.status(400).json({ error: "Work order PDF is required" });
    if (pdf.mimetype !== "application/pdf" || pdf.buffer.subarray(0, 4).toString() !== "%PDF") {
      return res.status(400).json({ error: "A valid PDF file is required" });
    }
    try {
      const order = await prisma.workOrder.findUnique({
        where: { id: req.params.id },
        include: { company: true },
      });
      if (!order) return res.status(404).json({ error: "Work order not found" });
      if (!await canAccessCompany(req, order.companyId)) return res.status(403).json({ error: "Access denied" });
      if (order.status === "canceled") return res.status(409).json({ error: "Canceled work orders cannot be sent" });
      const recipient = String(req.body.to || order.assigneeEmail || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return res.status(400).json({ error: "A valid recipient email is required" });
      const companyLogo = order.company.avatar ? await getPresignedUrl(order.company.avatar).catch(() => "") : "";
      const content = pdf.buffer.toString("base64");
      let previousSourcePdfKey: string | null = null;
      let storedSourcePdfKey: string | null = null;
      if (order.status === "pending") {
        const sourcePdfKey = pdfKey(order, "source");
        await putS3ObjectBuffer({ key: sourcePdfKey, body: pdf.buffer, contentType: "application/pdf" });
        storedSourcePdfKey = sourcePdfKey;
        previousSourcePdfKey = order.sourcePdfKey;
        try {
          await prisma.workOrder.update({ where: { id: order.id }, data: { sourcePdfKey } });
        } catch (error) {
          await deleteS3ObjectQuietly(sourcePdfKey);
          throw error;
        }
      }
      try {
        await sendEmail({
          to: recipient,
          subject: `Work Order #${order.number} from ${order.company.name}`,
          html: workOrderEmail({ recipientName: order.assigneeName, companyName: order.company.name, companyLogo,
            number: order.number, projectName: order.showClientName ? order.projectName : undefined, startDate: order.startDate, endDate: order.endDate,
            reviewLink: `${String(process.env.URL_FRONT || "").replace(/\/$/, "")}/work-order-response/${order.publicToken}`,
            message: String(req.body.message || "").trim() || undefined }),
          companyId: order.companyId,
          throwOnError: true,
          debugContext: `workOrder.send.${order.id}.${recipient}`,
          attachments: [{ content, filename: `work-order-${order.number}.pdf`, type: "application/pdf", disposition: "attachment" }],
        });
        await prisma.$transaction([
          prisma.workOrder.update({ where: { id: order.id }, data: { lastSentAt: new Date() } }),
          prisma.workOrderEmailLog.create({ data: { workOrderId: order.id, recipient, status: "success" } }),
        ]);
        await deleteS3ObjectQuietly(previousSourcePdfKey);
        return res.json({ success: true, recipient });
      } catch (error) {
        if (storedSourcePdfKey) {
          await prisma.workOrder.updateMany({
            where: { id: order.id, sourcePdfKey: storedSourcePdfKey },
            data: { sourcePdfKey: previousSourcePdfKey },
          });
          await deleteS3ObjectQuietly(storedSourcePdfKey);
        }
        await prisma.workOrderEmailLog.create({ data: { workOrderId: order.id, recipient, status: "error", errorMessage: error instanceof Error ? error.message : "Unknown error" } });
        throw error;
      }
    } catch (error) {
      console.error("[workOrder.send]", error);
      return res.status(500).json({ error: "Unable to send work order" });
    } finally { /* multer memory storage requires no temporary-file cleanup */ }
  }
}
