import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { workOrderEmail } from "../../templateEmail/workOrder";
import { Prisma } from "@prisma/client";

const includeWorkOrder = {
  items: { orderBy: { position: "asc" as const } },
  emailLogs: { orderBy: { sentAt: "desc" as const } },
  company: { select: { name: true, signature: true } },
};

const includePublicWorkOrder = {
  items: { orderBy: { position: "asc" as const } },
  company: { select: { name: true, avatar: true, signature: true } },
};

const asDate = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serialize = (order: any) => ({
  ...order,
  items: (order.items || []).map((item: any) => ({
    ...item,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  })),
});

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

async function resolveProjectAndAssignee(companyId: string, payload: any) {
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

  return {
    project,
    assignee,
    companySignature: project.company?.signature || null,
    snapshot: {
      projectNumber: project.contract_number ? String(project.contract_number) : null,
      projectName: project.client?.name || project.workContext?.Name || project.workContext?.label || "Project",
      projectAddress: project.workContext?.location || project.location || project.client?.location || project.client?.addressOffice || null,
      projectManagerName: payload.projectManagerName?.trim() || project.project_manager?.name || null,
      projectManagerPhone: payload.projectManagerPhone?.trim() || project.project_manager?.phone || null,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email || null,
      assigneePhone: assignee.phone || null,
    },
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
    return res.json({ data: serialize({ ...order, company }) });
  }

  async signPublic(req: Request, res: Response) {
    const signature = typeof req.body.signature === "string" ? req.body.signature.trim() : "";
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(signature)) {
      return res.status(400).json({ error: "A valid signature is required" });
    }
    if (signature.length > 6_000_000) {
      return res.status(413).json({ error: "Signature image is too large" });
    }

    const existing = await prisma.workOrder.findUnique({ where: { publicToken: req.params.publicToken } });
    if (!existing) return res.status(404).json({ error: "Work order not found" });

    if (existing.status !== "approved") {
      const signedAt = new Date();
      await prisma.workOrder.updateMany({
        where: { id: existing.id, status: "pending" },
        data: {
          status: "approved",
          approvedAt: signedAt,
          assigneeSignature: signature,
          assigneeSignedAt: signedAt,
        },
      });
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
    return res.json({ data: serialize({ ...order, company }) });
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
    return res.json({ data: orders.map(serialize) });
  }

  async get(req: Request, res: Response) {
    const order = await prisma.workOrder.findUnique({ where: { id: req.params.id }, include: includeWorkOrder });
    if (!order) return res.status(404).json({ error: "Work order not found" });
    if (!await canAccessCompany(req, order.companyId)) return res.status(403).json({ error: "Access denied" });
    return res.json({ data: serialize(order) });
  }

  async create(req: Request, res: Response) {
    try {
      const checked = validatePayload(req.body);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const payload = req.body;
      if (!await canAccessCompany(req, payload.companyId)) return res.status(403).json({ error: "Access denied" });
      const { snapshot, companySignature } = await resolveProjectAndAssignee(payload.companyId, payload);

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
            terms: payload.terms || null,
            managerSignature: companySignature,
            managerSignedAt: companySignature ? new Date() : null,
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
      return res.status(201).json({ data: serialize(order) });
    } catch (error) {
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return res.status(404).json({ error: "Project not found" });
      if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") return res.status(404).json({ error: "Employee or subcontractor not found" });
      console.error("[workOrder.create]", error);
      return res.status(500).json({ error: "Unable to create work order" });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: "Work order not found" });
      if (!await canAccessCompany(req, existing.companyId)) return res.status(403).json({ error: "Access denied" });
      const payload = { ...req.body, companyId: existing.companyId };
      const checked = validatePayload(payload);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const { snapshot, companySignature } = await resolveProjectAndAssignee(existing.companyId, payload);
      const order = await prisma.$transaction(async (tx) => {
        await tx.workOrderItem.deleteMany({ where: { workOrderId: existing.id } });
        return tx.workOrder.update({
          where: { id: existing.id },
          data: {
            projectId: payload.projectId, title: payload.title.trim(), scope: String(payload.scope || "").trim(),
            startDate: checked.startDate!, endDate: checked.endDate!, assigneeType: payload.assigneeType,
            assigneeId: payload.assigneeId, ...snapshot, terms: payload.terms || null,
            managerSignature: companySignature || existing.managerSignature,
            managerSignedAt: (companySignature || existing.managerSignature) ? (existing.managerSignedAt || new Date()) : null,
            items: { create: checked.items!.map((item: any, position: number) => ({
              type: item.type === "material" ? "material" : "service", name: item.name.trim(),
              description: item.description?.trim() || null, quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
              unitPrice: Number(item.unitPrice) >= 0 ? Number(item.unitPrice) : 0, position,
            })) },
          },
          include: includeWorkOrder,
        });
      });
      return res.json({ data: serialize(order) });
    } catch (error) {
      console.error("[workOrder.update]", error);
      return res.status(500).json({ error: "Unable to update work order" });
    }
  }

  async remove(req: Request, res: Response) {
    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Work order not found" });
    if (!await canAccessCompany(req, existing.companyId)) return res.status(403).json({ error: "Access denied" });
    await prisma.workOrder.delete({ where: { id: existing.id } });
    return res.status(204).send();
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
      const recipient = String(req.body.to || order.assigneeEmail || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return res.status(400).json({ error: "A valid recipient email is required" });
      const companyLogo = order.company.avatar ? await getPresignedUrl(order.company.avatar).catch(() => "") : "";
      const content = pdf.buffer.toString("base64");
      try {
        await sendEmail({
          to: recipient,
          subject: `Work Order #${order.number} from ${order.company.name}`,
          html: workOrderEmail({ recipientName: order.assigneeName, companyName: order.company.name, companyLogo,
            number: order.number, projectName: order.projectName, startDate: order.startDate, endDate: order.endDate,
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
        return res.json({ success: true, recipient });
      } catch (error) {
        await prisma.workOrderEmailLog.create({ data: { workOrderId: order.id, recipient, status: "error", errorMessage: error instanceof Error ? error.message : "Unknown error" } });
        throw error;
      }
    } catch (error) {
      console.error("[workOrder.send]", error);
      return res.status(500).json({ error: "Unable to send work order" });
    } finally { /* multer memory storage requires no temporary-file cleanup */ }
  }
}
