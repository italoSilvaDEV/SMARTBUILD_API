import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { buildEstimateFinancialFields } from "../../../utils/estimateDiscount";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";
import { jsonSafe } from "../customer/quickbooksHelpers";
import {
  buildUnsupportedTypesEntityError,
  isTypesEntitySupportedByPrismaClient,
} from "../syncPreference/syncPreferenceUtils";
import { getQbClientWithAccountOrThrow } from "../util/QuickBooksClientUtil";
import { qboClientForAccount } from "../util/http/qboClientFactory";
import { resolveProjectStatusFromImportedEstimate } from "../util/QuickBooksProjectStatusUtil";

const MINOR_VERSION = 40;
const PAGE_SIZE = 1000;

type ImportedProjectLink = {
  qboProjectId: string;
  projectId: string;
  contractNumber: number | null;
};

type FetchedQuickBooksEstimate = {
  qboEstimate: any;
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

function collectProjectRefValues(estimate: any): string[] {
  const refs = new Set<string>();
  const addRef = (value: unknown) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (normalized) refs.add(normalized);
  };

  addRef(estimate?.ProjectRef?.value);
  addRef(estimate?.CustomerRef?.value);

  const lines = Array.isArray(estimate?.Line) ? estimate.Line : [];
  for (const line of lines) {
    addRef(line?.ProjectRef?.value);
    addRef(line?.SalesItemLineDetail?.ProjectRef?.value);
  }

  return Array.from(refs);
}

function mapQboEstimateStatus(qboEstimate: any): string {
  const status = String(qboEstimate?.TxnStatus || "").trim().toLowerCase();

  // SmartBuild currently works best with a 3-state estimate model:
  // pending, approved, canceled. In QBO, converted/closed estimates are
  // positive terminal states, so we intentionally bucket them as approved.
  if (["accepted", "closed", "converted"].includes(status)) return "approved";
  if (["rejected", "declined", "void", "voided"].includes(status)) return "canceled";

  return "pending";
}

async function syncImportedEstimateProjectStatus(projectId: string, estimateStatus: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      status_project: true,
    },
  });

  if (!project) return;
  const nextStatus = resolveProjectStatusFromImportedEstimate(
    project.status_project,
    estimateStatus
  );
  if (!nextStatus) return;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status_project: nextStatus,
    },
  });
}

function buildEstimateNumber(qboEstimate: any): string {
  const docNumber = String(qboEstimate?.DocNumber || "").trim();
  const qboId = String(qboEstimate?.Id || "").trim();

  return `QBO-${docNumber || qboId}`;
}

function cleanQboServiceName(value: unknown, fallback: string): string {
  const rawName = typeof value === "string" ? value.trim() : "";
  const name = rawName || fallback;
  const withoutCategory = name.includes(":") ? name.split(":").pop() : name;

  return String(withoutCategory || fallback).trim().slice(0, 191);
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildEstimateDescription(qboEstimate: any): string | null {
  return textOrNull(qboEstimate?.CustomerMemo?.value || qboEstimate?.CustomerMemo);
}

function buildEstimateTerms(qboEstimate: any): string | null {
  return textOrNull(qboEstimate?.PrivateNote);
}

function getQboEstimateTaxTotal(qboEstimate: any): number {
  return decimalishToNumber(qboEstimate?.TxnTaxDetail?.TotalTax);
}

function getQboEstimateDiscountTotal(qboEstimate: any): number {
  const lines = Array.isArray(qboEstimate?.Line) ? qboEstimate.Line : [];
  const discountLinesTotal = lines
    .filter((line: any) => line?.DetailType === "DiscountLineDetail")
    .reduce((sum: number, line: any) => sum + decimalishToNumber(line?.Amount), 0);

  return discountLinesTotal || decimalishToNumber(qboEstimate?.DiscountAmt);
}

function buildEstimateServiceLines(qboEstimate: any) {
  const lines = Array.isArray(qboEstimate?.Line) ? qboEstimate.Line : [];
  const salesLines = lines.filter((line: any) => line?.DetailType === "SalesItemLineDetail");

  const serviceLines = salesLines
    .map((line: any, index: number) => {
      const detail = line?.SalesItemLineDetail || {};
      const amount = decimalishToNumber(line?.Amount);
      const quantityRaw = decimalishToNumber(detail?.Qty) || 1;
      const quantity = Math.max(1, Math.round(quantityRaw));
      const unitPrice = decimalishToNumber(detail?.UnitPrice) || amount / quantityRaw || amount;
      const itemName =
        detail?.ItemRef?.name ||
        line?.Description ||
        `Estimate Line ${index + 1}`;
      const lineDescription = textOrNull(line?.Description);

      return {
        name: cleanQboServiceName(itemName, `Estimate Line ${index + 1}`),
        description: lineDescription,
        quantity,
        unitPrice,
        lineTotal: amount,
        originalUnitPrice: unitPrice,
        originalLineTotal: amount,
        notes: lineDescription,
        hours: quantityRaw,
        price: unitPrice,
        start_date: textOrNull(qboEstimate?.TxnDate),
        deadline: textOrNull(qboEstimate?.ExpirationDate),
      };
    })
    .filter((line: any) => line.lineTotal > 0 || line.unitPrice > 0);

  if (serviceLines.length > 0) return serviceLines;

  const total = decimalishToNumber(qboEstimate?.TotalAmt);

  return [
    {
      name: `Estimate ${qboEstimate?.DocNumber || qboEstimate?.Id || ""}`.trim(),
      description: buildEstimateDescription(qboEstimate),
      quantity: 1,
      unitPrice: total,
      lineTotal: total,
      originalUnitPrice: total,
      originalLineTotal: total,
      notes: buildEstimateDescription(qboEstimate),
      hours: 1,
      price: total,
      start_date: textOrNull(qboEstimate?.TxnDate),
      deadline: textOrNull(qboEstimate?.ExpirationDate),
    },
  ];
}

function buildEstimateFinancials(qboEstimate: any, serviceLines: Array<{ lineTotal: number }>) {
  const qboTotal = decimalishToNumber(qboEstimate?.TotalAmt);
  const qboTaxTotal = getQboEstimateTaxTotal(qboEstimate);
  const qboDiscountAmount = getQboEstimateDiscountTotal(qboEstimate);
  const subtotal = serviceLines.reduce((sum, line) => sum + decimalishToNumber(line.lineTotal), 0) || qboTotal;
  const preTaxTotal = qboTotal > 0 ? Math.max(qboTotal - qboTaxTotal, 0) : 0;
  const inferredDiscountAmount =
    !qboDiscountAmount && subtotal > preTaxTotal && preTaxTotal > 0
      ? Number((subtotal - preTaxTotal).toFixed(2))
      : 0;
  const discountAmount = qboDiscountAmount || inferredDiscountAmount;
  const finalAmount = qboTotal > 0 ? qboTotal : Math.max(subtotal - discountAmount + qboTaxTotal, 0);
  const fields = buildEstimateFinancialFields({
    subtotal,
    amountPaid: 0,
    discountType: discountAmount > 0 ? "fixed" : null,
    discountValue: discountAmount > 0 ? discountAmount : null,
  });

  return {
    ...fields,
    totalAmount: finalAmount,
    finalAmount,
    balanceDue: finalAmount,
  };
}

function resolveEstimateProject(
  qboEstimate: any,
  projectByQboId: Map<string, ImportedProjectLink>
) {
  const refs = collectProjectRefValues(qboEstimate);

  for (const ref of refs) {
    const project = projectByQboId.get(ref);
    if (project) return project;
  }

  return null;
}

async function getImportedProjectLinks(companyId: string): Promise<ImportedProjectLink[]> {
  const markers = await prisma.projectPastes.findMany({
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
    .map((marker) => {
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

async function fetchQuickBooksEstimatesForProjects(
  api: ReturnType<typeof qboClientForAccount>,
  projectLinks: ImportedProjectLink[]
) {
  const estimates: FetchedQuickBooksEstimate[] = [];
  const queries: string[] = [];
  const seenEstimateIds = new Set<string>();

  for (const project of projectLinks) {
    let startPosition = 1;

    while (true) {
      const query = `SELECT * FROM Estimate WHERE CustomerRef = '${escapeQboString(
        project.qboProjectId
      )}' STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
      queries.push(query);
      const data = await runQboQuery(api, query);
      const rows = normalizeQboRows(data?.QueryResponse, "Estimate");

      for (const qboEstimate of rows) {
        const qboEstimateId = String(qboEstimate?.Id || "").trim();
        const uniqueKey = qboEstimateId || `${project.qboProjectId}:${estimates.length}`;

        if (seenEstimateIds.has(uniqueKey)) continue;

        seenEstimateIds.add(uniqueKey);
        estimates.push({ qboEstimate, project });
      }

      if (rows.length < PAGE_SIZE) break;
      startPosition += PAGE_SIZE;
    }
  }

  return { estimates, queries };
}

async function createOrUpdateEstimateFromQbo(params: {
  qboEstimate: any;
  project: ImportedProjectLink;
  companyId: string;
  userId: string;
  syncExecutionId?: string;
}) {
  const { qboEstimate, project, companyId, userId, syncExecutionId } = params;
  const qboId = String(qboEstimate?.Id || "").trim();
  const qbUpdatedAt = qboDate(qboEstimate?.MetaData?.LastUpdatedTime) || null;
  const status = mapQboEstimateStatus(qboEstimate);
  const serviceLines = buildEstimateServiceLines(qboEstimate);
  const financials = buildEstimateFinancials(qboEstimate, serviceLines);
  const number = buildEstimateNumber(qboEstimate);
  const existing = await (prisma as any).estimate.findFirst({
    where: {
      projectId: project.projectId,
      idQuickbooks: qboId,
    },
    orderBy: [
      { quickbooksUpdatedAt: "desc" },
      { date_update: "desc" },
    ],
  });

  if (existing?.quickbooksUpdatedAt && qbUpdatedAt && qbUpdatedAt <= existing.quickbooksUpdatedAt) {
    await createSyncLog({
      entity: "estimates",
      action: "Skipped",
      entityId: existing.id,
      companyId,
      details: jsonSafe({
        reason: "QBO estimate not newer than local mirror",
        qboEstimateId: qboId,
        qbUpdatedAt,
        lastSeenRemote: existing.quickbooksUpdatedAt,
      }),
      syncExecutionId,
    });

    return { action: "skipped" as const, estimate: existing };
  }

  const dateCreation =
    qboDate(qboEstimate?.TxnDate) ||
    qboDate(qboEstimate?.MetaData?.CreateTime) ||
    new Date();
  const email = qboEstimate?.BillEmail?.Address || null;
  const estimateData = {
    number,
    approvedAt: status === "approved" ? qbUpdatedAt || dateCreation : dateCreation,
    totalAmount: financials.totalAmount,
    balanceDue: financials.balanceDue,
    amountPaid: 0,
    discountType: financials.discountType,
    discountValue: financials.discountValue,
    discountAmount: financials.discountAmount,
    finalAmount: financials.finalAmount,
    description: buildEstimateDescription(qboEstimate),
    terms: buildEstimateTerms(qboEstimate),
    status,
    type_estimate: "estimateProject",
    assignatureRequired: false,
    multi_emails: email,
    isStandaloneEstimate: false,
    date_creation: dateCreation,
    idQuickbooks: qboId,
    quickbooksSyncToken: qboEstimate?.SyncToken ? String(qboEstimate.SyncToken) : null,
    quickbooksUpdatedAt: qbUpdatedAt,
    quickbooksRaw: jsonSafe(qboEstimate),
    project: {
      connect: {
        id: project.projectId,
      },
    },
  };

  if (existing) {
    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const { project: _projectRelation, ...estimateUpdateData } = estimateData;
      const estimate = await tx.estimate.update({
        where: { id: existing.id },
        data: estimateUpdateData,
      });

      await tx.estimateServiceProject.deleteMany({
        where: { estimateId: existing.id },
      });

      await tx.estimateServiceProject.createMany({
        data: serviceLines.map((line: any) => ({
          ...line,
          estimateId: existing.id,
        })),
      });

      return estimate;
    });

    await createSyncLog({
      entity: "estimates",
      action: "Updated",
      entityId: updated.id,
      companyId,
      details: jsonSafe({ qboEstimateId: qboId, qboEstimate, localEstimate: updated }),
      syncExecutionId,
    });

    await syncImportedEstimateProjectStatus(project.projectId, status);

    return { action: "updated" as const, estimate: updated };
  }

  const numberCollision = await (prisma as any).estimate.findFirst({
    where: {
      projectId: project.projectId,
      number,
    },
    select: {
      id: true,
      idQuickbooks: true,
    },
  });

  if (numberCollision && numberCollision.idQuickbooks !== qboId) {
    await createSyncLog({
      entity: "estimates",
      action: "Skipped",
      entityId: numberCollision.id,
      companyId,
      details: jsonSafe({
        reason: "Local estimate number collision",
        number,
        qboEstimateId: qboId,
      }),
      syncExecutionId,
    });

    return { action: "skipped" as const, estimate: numberCollision };
  }

  const created = await (prisma as any).$transaction(async (tx: any) => {
    const estimate = await tx.estimate.create({
      data: {
        ...estimateData,
        serviceProjects: {
          create: serviceLines,
        },
      },
    });

    return estimate;
  });

  await createSyncLog({
    entity: "estimates",
    action: "Inserted",
    entityId: created.id,
    companyId,
    details: jsonSafe({ qboEstimateId: qboId, qboEstimate, localEstimate: created, userId }),
    syncExecutionId,
  });

  await syncImportedEstimateProjectStatus(project.projectId, status);

  return { action: "created" as const, estimate: created };
}

export async function importQuickBooksEstimateToSmartBuild(params: {
  qboEstimate: any;
  companyId: string;
  userId: string;
  syncExecutionId?: string;
}) {
  const { qboEstimate, companyId, userId, syncExecutionId } = params;
  const qboId = String(qboEstimate?.Id || "").trim();
  const projectLinks = await getImportedProjectLinks(companyId);
  const projectByQboId = new Map(projectLinks.map((project) => [project.qboProjectId, project]));
  const project = resolveEstimateProject(qboEstimate, projectByQboId);

  if (!project) {
    await createSyncLog({
      entity: "estimates",
      action: "Skipped",
      entityId: qboId || "unknown",
      companyId,
      details: jsonSafe({
        reason: "QBO estimate is not linked to an imported QuickBooks project",
        refs: collectProjectRefValues(qboEstimate),
        qboEstimate,
      }),
      syncExecutionId,
    });

    return {
      action: "unmatched" as const,
      qboEstimateId: qboId,
      refs: collectProjectRefValues(qboEstimate),
    };
  }

  const result = await createOrUpdateEstimateFromQbo({
    qboEstimate,
    project,
    companyId,
    userId,
    syncExecutionId,
  });

  return {
    action: result.action,
    qboEstimateId: qboId,
    localEstimateId: result.estimate?.id,
    localProjectId: project.projectId,
    qboProjectId: project.qboProjectId,
    number: result.estimate?.number,
  };
}

export class QuickBooksEstimateController {
  async importEstimatesToSmartBuild(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: "User ID not provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not provided" });
    }

    if (!isTypesEntitySupportedByPrismaClient("estimates")) {
      const error = buildUnsupportedTypesEntityError("estimates");
      return res.status(409).json({
        error: "QuickBooks sync setup is not ready",
        details: error.message,
        code: (error as any).code,
        typesEntity: "estimates",
      });
    }

    try {
      const syncPref = await prisma.syncPreferences.findFirst({
        where: {
          companyId,
          userId,
          typesEntity: "estimates" as any,
          typeSync: { in: ["QuickBooksToSmartBuild", "bidirectional"] },
          isDisable: false,
        },
      });

      if (!syncPref) {
        return res.status(403).json({
          error:
            "Sync not allowed: Make sure it is configured to fetch estimates from QuickBooks to SmartBuild.",
        });
      }

      const { account } = await getQbClientWithAccountOrThrow(userId, companyId);
      const api = qboClientForAccount(account.id);
      const projectLinks = await getImportedProjectLinks(companyId);

      if (projectLinks.length === 0) {
        return res.status(200).json({
          ok: true,
          message: "No imported QuickBooks projects found to attach estimates.",
          synced: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          unmatched: 0,
          projectLinks: 0,
        });
      }

      const projectByQboId = new Map(projectLinks.map((project) => [project.qboProjectId, project]));
      const { estimates: qboEstimates, queries } = await fetchQuickBooksEstimatesForProjects(
        api,
        projectLinks
      );
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let unmatched = 0;
      const results: any[] = [];

      for (const fetchedEstimate of qboEstimates) {
        const qboEstimate = fetchedEstimate.qboEstimate;
        const qboId = String(qboEstimate?.Id || "").trim();
        const project = resolveEstimateProject(qboEstimate, projectByQboId) || fetchedEstimate.project;

        if (!project) {
          unmatched++;
          await createSyncLog({
            entity: "estimates",
            action: "Skipped",
            entityId: qboId || "unknown",
            companyId,
            details: jsonSafe({
              reason: "QBO estimate is not linked to an imported QuickBooks project",
              refs: collectProjectRefValues(qboEstimate),
              qboEstimate,
            }),
            syncExecutionId,
          });
          continue;
        }

        const result = await importQuickBooksEstimateToSmartBuild({
          qboEstimate,
          companyId,
          userId,
          syncExecutionId,
        });

        if (result.action === "created") created++;
        if (result.action === "updated") updated++;
        if (result.action === "skipped") skipped++;
        if (result.action === "unmatched") unmatched++;

        results.push(result);
      }

      const synced = created + updated;

      return res.status(200).json({
        ok: true,
        message: `Synced ${synced} QuickBooks estimate(s) into SmartBuild.`,
        synced,
        created,
        updated,
        skipped,
        unmatched,
        totalQboEstimates: qboEstimates.length,
        projectLinks: projectLinks.length,
        queryMode: "rest-estimate-by-project-customerref",
        queries,
        results,
      });
    } catch (error: any) {
      console.error("QuickBooks Estimates import error:", error?.response?.data || error);
      return res.status(error?.response?.status || 500).json({
        error: "Failed to import QuickBooks estimates into SmartBuild",
        details: error?.response?.data || error?.message || "Unknown error",
      });
    }
  }

  async syncEstimatesQboToSmartBuild(req: Request, res: Response) {
    return this.importEstimatesToSmartBuild(req, res);
  }
}
