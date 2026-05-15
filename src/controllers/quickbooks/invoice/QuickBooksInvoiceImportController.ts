import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";
import { jsonSafe } from "../customer/quickbooksHelpers";
import {
  buildUnsupportedTypesEntityError,
  isTypesEntitySupportedByPrismaClient,
} from "../syncPreference/syncPreferenceUtils";
import { getQbClientWithAccountOrThrow } from "../util/QuickBooksClientUtil";
import { qboClientForAccount } from "../util/http/qboClientFactory";

const MINOR_VERSION = 40;
const PAGE_SIZE = 1000;

type ImportedProjectLink = {
  qboProjectId: string;
  projectId: string;
  contractNumber: number | null;
};

type FetchedQuickBooksInvoice = {
  qboInvoice: any;
  project: ImportedProjectLink;
};

function normalizeQboRows<T = any>(queryResponse: any, entityName: string): T[] {
  const payload = queryResponse?.[entityName];

  if (Array.isArray(payload)) return payload;
  if (payload) return [payload];

  return [];
}

async function runQboQuery(
  api: ReturnType<typeof qboClientForAccount>,
  query: string
) {
  const { data } = await api.get("/query", {
    params: { query, minorversion: MINOR_VERSION },
  });

  return data;
}

function escapeQboString(value: string): string {
  return value.replace(/'/g, "\\'");
}

function decimalishToNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toString" in (value as any)) {
    const parsed = Number((value as any).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function qboDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanQboItemName(value: unknown, fallback: string): string {
  const rawName = typeof value === "string" ? value.trim() : "";
  const name = rawName || fallback;
  const withoutCategory = name.includes(":") ? name.split(":").pop() : name;

  return String(withoutCategory || fallback).trim().slice(0, 191);
}

function getQboInvoiceId(qboInvoice: any): string {
  return String(qboInvoice?.Id || "").trim();
}

function getQboInvoiceCustomerRef(qboInvoice: any): string | null {
  const value = qboInvoice?.CustomerRef?.value;
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function buildInvoiceNumber(qboInvoice: any): string {
  const docNumber = String(qboInvoice?.DocNumber || "").trim();
  const qboId = getQboInvoiceId(qboInvoice);

  return `QBO-${docNumber || qboId}`;
}

function buildInvoiceDescription(qboInvoice: any): string | null {
  return textOrNull(qboInvoice?.CustomerMemo?.value || qboInvoice?.CustomerMemo || qboInvoice?.PrivateNote);
}

function deriveQboInvoiceStatus(qboInvoice: any): "void" | "paid" | "partial" | "open" {
  const txnStatus = String(qboInvoice?.TxnStatus || "").trim().toLowerCase();
  if (txnStatus === "voided" || txnStatus === "void") return "void";

  const totalAmt = decimalishToNumber(qboInvoice?.TotalAmt);
  const balance = decimalishToNumber(qboInvoice?.Balance);

  if (totalAmt > 0 && balance === 0) return "paid";
  if (balance > 0 && balance < totalAmt) return "partial";

  return "open";
}

function buildInvoiceItems(qboInvoice: any) {
  const lines = Array.isArray(qboInvoice?.Line) ? qboInvoice.Line : [];
  const salesLines = lines.filter((line: any) => line?.DetailType === "SalesItemLineDetail");

  const items = salesLines
    .map((line: any, index: number) => {
      const detail = line?.SalesItemLineDetail || {};
      const amount = decimalishToNumber(line?.Amount);
      const quantity = decimalishToNumber(detail?.Qty) || 1;
      const price = decimalishToNumber(detail?.UnitPrice) || amount / quantity || amount;
      const itemName =
        detail?.ItemRef?.name ||
        line?.Description ||
        `Invoice Line ${index + 1}`;

      return {
        name: cleanQboItemName(itemName, `Invoice Line ${index + 1}`),
        description: textOrNull(line?.Description),
        quantity,
        price,
        totalAmount: amount,
        qboQuantity: quantity,
        qboPrice: price,
      };
    })
    .filter((line: any) => line.totalAmount > 0 || line.price > 0);

  if (items.length > 0) return items;

  const total = decimalishToNumber(qboInvoice?.TotalAmt);

  return [
    {
      name: `Invoice ${qboInvoice?.DocNumber || qboInvoice?.Id || ""}`.trim(),
      description: buildInvoiceDescription(qboInvoice),
      quantity: 1,
      price: total,
      totalAmount: total,
      qboQuantity: 1,
      qboPrice: total,
    },
  ];
}

async function getImportedProjectLinks(companyId: string): Promise<ImportedProjectLink[]> {
  const markers = await (prisma as any).projectPastes.findMany({
    where: {
      companyId,
      name: {
        startsWith: "QBO_PROJECT:",
      },
    },
    select: {
      name: true,
      projectId: true,
      project: {
        select: {
          contract_number: true,
        },
      },
    },
  });

  return markers
    .map((marker: any) => {
      const qboProjectId = String(marker.name || "").replace("QBO_PROJECT:", "").trim();
      if (!qboProjectId || !marker.projectId) return null;

      return {
        qboProjectId,
        projectId: marker.projectId,
        contractNumber: marker.project?.contract_number ?? null,
      };
    })
    .filter(Boolean) as ImportedProjectLink[];
}

async function fetchQuickBooksInvoicesForProjects(
  api: ReturnType<typeof qboClientForAccount>,
  projectLinks: ImportedProjectLink[]
) {
  const invoices: FetchedQuickBooksInvoice[] = [];
  const queries: string[] = [];
  const seenInvoiceIds = new Set<string>();

  for (const project of projectLinks) {
    let startPosition = 1;

    while (true) {
      const query = `SELECT * FROM Invoice WHERE CustomerRef = '${escapeQboString(
        project.qboProjectId
      )}' STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
      queries.push(query);
      const data = await runQboQuery(api, query);
      const rows = normalizeQboRows(data?.QueryResponse, "Invoice");

      for (const qboInvoice of rows) {
        const qboInvoiceId = getQboInvoiceId(qboInvoice);
        const uniqueKey = qboInvoiceId || `${project.qboProjectId}:${invoices.length}`;

        if (seenInvoiceIds.has(uniqueKey)) continue;

        seenInvoiceIds.add(uniqueKey);
        invoices.push({ qboInvoice, project });
      }

      if (rows.length < PAGE_SIZE) break;
      startPosition += PAGE_SIZE;
    }
  }

  return { invoices, queries };
}

async function createOrUpdateInvoiceFromQbo(params: {
  qboInvoice: any;
  project: ImportedProjectLink;
  companyId: string;
  userId: string;
  syncExecutionId?: string;
}) {
  const { qboInvoice, project, companyId, userId, syncExecutionId } = params;
  const qboId = getQboInvoiceId(qboInvoice);
  const qboCustomerRef = getQboInvoiceCustomerRef(qboInvoice);
  const totalAmount = decimalishToNumber(qboInvoice?.TotalAmt);
  const balanceRemaining = decimalishToNumber(qboInvoice?.Balance);
  const totalAmountPaidQbo = Math.max(0, totalAmount - balanceRemaining);
  const invoiceItems = buildInvoiceItems(qboInvoice);
  const qbUpdatedAt = qboDate(qboInvoice?.MetaData?.LastUpdatedTime);

  let existing = await (prisma as any).invoice.findFirst({
    where: {
      companyId,
      OR: [
        { idQuickbookContabio: qboId },
        { idQuickBooksRef: qboId },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const invoiceData = {
    externalInvoiceId: buildInvoiceNumber(qboInvoice),
    invoiceType: "quickbooks",
    invoiceUrl: qboInvoice?.InvoiceLink || null,
    externalDocNumber: qboInvoice?.DocNumber ? String(qboInvoice.DocNumber) : null,
    idQuickbookContabio: qboId,
    idQuickBooksRef: qboId,
    docNumberQuickBooksContabio: qboInvoice?.DocNumber ? String(qboInvoice.DocNumber) : null,
    qboCustomerRef,
    status: deriveQboInvoiceStatus(qboInvoice),
    totalAmount,
    balanceRemaining,
    totalAmountPaidQbo,
    dueDate: qboDate(qboInvoice?.DueDate) || null,
    description: buildInvoiceDescription(qboInvoice),
    projectId: project.projectId,
    companyId,
    user_id: userId,
    showPaymentMethods: true,
    type_invoicebase: "project",
    multi_emails: textOrNull(qboInvoice?.BillEmail?.Address),
    isStandaloneInvoice: false,
    createdAt: qboDate(qboInvoice?.MetaData?.CreateTime) || qboDate(qboInvoice?.TxnDate) || new Date(),
  };

  if (existing) {
    const updated = await (prisma as any).$transaction(async (tx: any) => {
      await tx.invoice.update({
        where: { id: existing.id },
        data: {
          ...invoiceData,
          createdAt: existing.createdAt,
        },
      });

      await tx.invoiceItem.deleteMany({
        where: { invoiceId: existing.id },
      });

      if (invoiceItems.length > 0) {
        await tx.invoiceItem.createMany({
          data: invoiceItems.map((item: any) => ({
            ...item,
            invoiceId: existing.id,
          })),
        });
      }

      return tx.invoice.findUnique({
        where: { id: existing.id },
        include: { InvoiceItems: true },
      });
    });

    await createSyncLog({
      entity: "invoices",
      action: "Updated",
      entityId: updated.id,
      companyId,
      details: jsonSafe({ qboInvoiceId: qboId, qboCustomerRef, qboInvoice, localInvoice: updated }),
      syncExecutionId,
    });

    return { action: "updated" as const, invoice: updated };
  }

  const created = await (prisma as any).invoice.create({
    data: {
      ...invoiceData,
      InvoiceItems: {
        create: invoiceItems,
      },
    },
    include: { InvoiceItems: true },
  });

  await createSyncLog({
    entity: "invoices",
    action: "Inserted",
    entityId: created.id,
    companyId,
    details: jsonSafe({ qboInvoiceId: qboId, qboCustomerRef, qboInvoice, localInvoice: created }),
    syncExecutionId,
  });

  return { action: "created" as const, invoice: created };
}

export async function importQuickBooksInvoiceToSmartBuild(params: {
  qboInvoice: any;
  companyId: string;
  userId: string;
  syncExecutionId?: string;
}) {
  const { qboInvoice, companyId, userId, syncExecutionId } = params;
  const qboId = getQboInvoiceId(qboInvoice);
  const qboCustomerRef = getQboInvoiceCustomerRef(qboInvoice);

  if (!qboCustomerRef) {
    await createSyncLog({
      entity: "invoices",
      action: "Skipped",
      entityId: qboId || "unknown",
      companyId,
      details: jsonSafe({
        reason: "QBO invoice has no CustomerRef",
        qboInvoice,
      }),
      syncExecutionId,
    });

    return { action: "unmatched" as const, qboInvoiceId: qboId, qboCustomerRef: null };
  }

  const projectLinks = await getImportedProjectLinks(companyId);
  const project = projectLinks.find((link) => link.qboProjectId === qboCustomerRef);

  if (!project) {
    await createSyncLog({
      entity: "invoices",
      action: "Skipped",
      entityId: qboId || "unknown",
      companyId,
      details: jsonSafe({
        reason: "QBO invoice CustomerRef is not an imported QuickBooks project",
        qboCustomerRef,
        marker: `QBO_PROJECT:${qboCustomerRef}`,
        qboInvoice,
      }),
      syncExecutionId,
    });

    return {
      action: "unmatched" as const,
      qboInvoiceId: qboId,
      qboCustomerRef,
    };
  }

  const result = await createOrUpdateInvoiceFromQbo({
    qboInvoice,
    project,
    companyId,
    userId,
    syncExecutionId,
  });

  return {
    action: result.action,
    qboInvoiceId: qboId,
    localInvoiceId: result.invoice?.id,
    localProjectId: project.projectId,
    qboProjectId: project.qboProjectId,
    qboCustomerRef,
    number: result.invoice?.externalInvoiceId,
  };
}

export class QuickBooksInvoiceImportController {
  async importInvoicesToSmartBuild(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    if (!isTypesEntitySupportedByPrismaClient("invoices")) {
      const error = buildUnsupportedTypesEntityError("invoices");
      return res.status(409).json({
        error: "QuickBooks sync setup is not ready",
        details: error.message,
        code: (error as any).code,
        typesEntity: "invoices",
      });
    }

    try {
      const syncPref = await (prisma as any).syncPreferences.findFirst({
        where: {
          companyId,
          userId,
          typesEntity: "invoices",
          typeSync: { in: ["QuickBooksToSmartBuild", "bidirectional"] },
          isDisable: false,
        },
      });

      if (!syncPref) {
        return res.status(403).json({
          error:
            "Sync not allowed: Make sure it is configured to fetch invoices from QuickBooks to SmartBuild.",
        });
      }

      const { account } = await getQbClientWithAccountOrThrow(userId, companyId);
      const api = qboClientForAccount(account.id);
      const projectLinks = await getImportedProjectLinks(companyId);

      if (projectLinks.length === 0) {
        return res.status(200).json({
          ok: true,
          message: "No imported QuickBooks projects found to attach invoices.",
          synced: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          unmatched: 0,
          projectLinks: 0,
        });
      }

      const { invoices: qboInvoices, queries } = await fetchQuickBooksInvoicesForProjects(
        api,
        projectLinks
      );
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let unmatched = 0;
      const results: any[] = [];

      for (const fetchedInvoice of qboInvoices) {
        const result = await importQuickBooksInvoiceToSmartBuild({
          qboInvoice: fetchedInvoice.qboInvoice,
          companyId,
          userId,
          syncExecutionId,
        });

        if (result.action === "created") created++;
        if (result.action === "updated") updated++;
        if ((result.action as string) === "skipped") skipped++;
        if (result.action === "unmatched") unmatched++;

        results.push(result);
      }

      const synced = created + updated;

      return res.status(200).json({
        ok: true,
        message: `Synced ${synced} QuickBooks invoice(s) into SmartBuild.`,
        synced,
        created,
        updated,
        skipped,
        unmatched,
        totalQboInvoices: qboInvoices.length,
        projectLinks: projectLinks.length,
        queryMode: "rest-invoice-by-project-customerref",
        queries,
        results,
      });
    } catch (error: any) {
      console.error("QuickBooks Invoices import error:", error?.response?.data || error);
      return res.status(error?.response?.status || 500).json({
        error: "Failed to import QuickBooks invoices into SmartBuild",
        details: error?.response?.data || error?.message || "Unknown error",
      });
    }
  }

  async syncInvoicesQboToSmartBuild(req: Request, res: Response) {
    return this.importInvoicesToSmartBuild(req, res);
  }
}
