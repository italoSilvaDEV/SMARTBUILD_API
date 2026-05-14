import { prisma } from "../../../utils/prisma";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";
import { jsonSafe } from "../customer/quickbooksHelpers";
import { qboClientForAccount } from "../util/http/qboClientFactory";

type QboApi = ReturnType<typeof qboClientForAccount>;

const ESTIMATE_OUTBOUND_SYNC_TYPES = ["SmartBuildToQuickBooks", "bidirectional"];
const estimateOutboundInFlight = new Map<string, Promise<any>>();

function round2(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function cleanText(value: unknown, maxLength = 4000): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeQboQueryString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function formatQboDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function firstEmail(value: unknown): string | undefined {
  const email = String(value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .find(Boolean);

  return email || undefined;
}

function normalizeDocNumber(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  return raw.startsWith("QBO-") ? raw.slice(4) : raw;
}

function mapSmartBuildEstimateStatusToQbo(status: unknown): "Pending" | "Accepted" | "Rejected" {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved") return "Accepted";
  if (normalized === "canceled" || normalized === "rejected") return "Rejected";
  return "Pending";
}

async function qboQuery<T = any>(api: QboApi, query: string, entity: string): Promise<T[]> {
  const { data } = await api.get("/query", { params: { query } });
  const payload = data?.QueryResponse?.[entity];
  if (Array.isArray(payload)) return payload;
  if (payload) return [payload];
  return [];
}

async function findGenericServiceItem(api: QboApi): Promise<{ id: string; name: string }> {
  const preferredNames = ["Services", "Service", "SmartBuild Service"];

  for (const name of preferredNames) {
    const existing = await qboQuery<any>(
      api,
      `SELECT * FROM Item WHERE Name = '${escapeQboQueryString(name)}' AND Active = true STARTPOSITION 1 MAXRESULTS 1`,
      "Item"
    );

    if (existing[0]?.Id) {
      return { id: String(existing[0].Id), name: String(existing[0].Name || name) };
    }
  }

  const activeServiceItems = await qboQuery<any>(
    api,
    "SELECT * FROM Item WHERE Type = 'Service' AND Active = true STARTPOSITION 1 MAXRESULTS 1",
    "Item"
  );

  if (activeServiceItems[0]?.Id) {
    return {
      id: String(activeServiceItems[0].Id),
      name: String(activeServiceItems[0].Name || "Service"),
    };
  }

  throw new Error("No active generic QuickBooks service item found");
}

async function resolveQuickBooksProjectId(projectId: string, companyId: string): Promise<string | null> {
  const marker = await prisma.projectPastes.findFirst({
    where: {
      projectId,
      companyId,
      name: {
        startsWith: "QBO_PROJECT:",
      },
    },
    select: { name: true },
  });

  const qboProjectId = String(marker?.name || "").replace("QBO_PROJECT:", "").trim();
  return qboProjectId || null;
}

async function buildEstimatePayload(api: QboApi, estimate: any, qboProjectId: string, currentQboEstimate?: any) {
  const genericItemRef = await findGenericServiceItem(api);
  const linesSource = Array.isArray(estimate.serviceProjects) && estimate.serviceProjects.length > 0
    ? estimate.serviceProjects
    : [
        {
          id: "fallback",
          name: `Estimate ${estimate.number || ""}`.trim() || "Estimate",
          description: estimate.description || "",
          quantity: 1,
          unitPrice: estimate.finalAmount ?? estimate.totalAmount ?? 0,
          lineTotal: estimate.finalAmount ?? estimate.totalAmount ?? 0,
          idQuickbooks: null,
        },
      ];

  const lines = [];
  for (const service of linesSource) {
    const quantity = Math.max(1, round2(service.quantity ?? service.hours ?? 1));
    const amount = round2(service.lineTotal ?? Number(service.unitPrice ?? service.price ?? 0) * quantity);
    const unitPrice = quantity > 0 ? round2(amount / quantity) : amount;
    if (amount <= 0 && unitPrice <= 0) continue;

    const serviceName = cleanText(service.name || "Service", 200);
    const serviceDescription = cleanText(service.description || service.notes || "");

    lines.push({
      ...(service.idQuickbooks ? { Id: String(service.idQuickbooks) } : {}),
      DetailType: "SalesItemLineDetail",
      Amount: amount,
      ...(serviceDescription ? { Description: serviceDescription } : {}),
      SalesItemLineDetail: {
        ItemRef: { value: genericItemRef.id, name: genericItemRef.name },
        Qty: quantity,
        UnitPrice: unitPrice,
      },
      _smartbuildServiceId: service.id,
    });
  }

  if (lines.length === 0) {
    throw new Error("Estimate has no valid lines to sync to QuickBooks");
  }

  const expirationDate =
    linesSource
      .map((service: any) => formatQboDate(service.deadline))
      .filter(Boolean)
      .sort()
      .pop() || formatQboDate(estimate.project?.deadline);
  const txnStatus = mapSmartBuildEstimateStatusToQbo(estimate.status);
  const acceptedBy = cleanText(
    estimate.project?.workContext?.Name || estimate.project?.client?.name || "",
    100
  );

  return {
    ...(currentQboEstimate?.Id ? { Id: String(currentQboEstimate.Id) } : {}),
    ...(currentQboEstimate?.SyncToken ? { SyncToken: String(currentQboEstimate.SyncToken) } : {}),
    ...(currentQboEstimate?.Id ? { sparse: false } : {}),
    CustomerRef: { value: qboProjectId },
    TxnStatus: txnStatus,
    ...(txnStatus === "Accepted" && formatQboDate(estimate.approvedAt || estimate.date_update)
      ? { AcceptedDate: formatQboDate(estimate.approvedAt || estimate.date_update) }
      : {}),
    ...(txnStatus === "Accepted" && acceptedBy ? { AcceptedBy: acceptedBy } : {}),
    ...(normalizeDocNumber(estimate.number) ? { DocNumber: normalizeDocNumber(estimate.number) } : {}),
    ...(formatQboDate(estimate.date_creation) ? { TxnDate: formatQboDate(estimate.date_creation) } : {}),
    ...(expirationDate ? { ExpirationDate: expirationDate } : {}),
    ...(firstEmail(estimate.multi_emails || estimate.project?.client?.email)
      ? { BillEmail: { Address: firstEmail(estimate.multi_emails || estimate.project?.client?.email) } }
      : {}),
    Line: lines.map(({ _smartbuildServiceId, ...line }) => line),
    _lineMap: lines.map((line) => ({
      smartbuildServiceId: line._smartbuildServiceId,
      qboLineId: line.Id ? String(line.Id) : null,
    })),
  };
}

function extractQboError(error: any) {
  return error?.response?.data || error?.Fault || error?.message || String(error);
}

async function syncReturnedLineIds(estimateId: string, localLineMap: any[], qboEstimate: any) {
  const qboLines = (Array.isArray(qboEstimate?.Line) ? qboEstimate.Line : [])
    .filter((line: any) => line?.DetailType === "SalesItemLineDetail");

  for (let index = 0; index < localLineMap.length; index += 1) {
    const localLine = localLineMap[index];
    const qboLine =
      (localLine.qboLineId && qboLines.find((line: any) => String(line?.Id) === localLine.qboLineId)) ||
      qboLines[index];

    if (!localLine.smartbuildServiceId || !qboLine?.Id || localLine.smartbuildServiceId === "fallback") {
      continue;
    }

    await prisma.estimateServiceProject.update({
      where: { id: localLine.smartbuildServiceId },
      data: {
        idQuickbooks: String(qboLine.Id),
        quickbooksRaw: jsonSafe(qboLine),
      },
    }).catch(() => null);
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      quickbooksRaw: jsonSafe(qboEstimate),
      quickbooksSyncToken: qboEstimate?.SyncToken ? String(qboEstimate.SyncToken) : null,
      quickbooksUpdatedAt: qboEstimate?.MetaData?.LastUpdatedTime
        ? new Date(qboEstimate.MetaData.LastUpdatedTime)
        : new Date(),
    },
  });
}

export async function upsertEstimateToQuickBooksInternal(companyId: string, userId: string, estimateId: string, syncExecutionId?: string) {
  const lockKey = `${companyId}:${estimateId}`;
  const existingRun = estimateOutboundInFlight.get(lockKey);
  if (existingRun) {
    await createSyncLog({
      entity: "estimates",
      action: "SkippedOutbound",
      entityId: estimateId,
      companyId,
      details: jsonSafe({ reason: "Estimate outbound already running", userId }),
      syncExecutionId,
    });
    return { action: "skipped", reason: "outbound_in_progress" };
  }

  const run = upsertEstimateToQuickBooksInternalUnlocked(companyId, userId, estimateId, syncExecutionId);
  estimateOutboundInFlight.set(lockKey, run);

  try {
    return await run;
  } finally {
    if (estimateOutboundInFlight.get(lockKey) === run) {
      estimateOutboundInFlight.delete(lockKey);
    }
  }
}

async function upsertEstimateToQuickBooksInternalUnlocked(companyId: string, userId: string, estimateId: string, syncExecutionId?: string) {
  const syncPreference = await prisma.syncPreferences.findFirst({
    where: {
      companyId,
      userId,
      typesEntity: "estimates" as any,
      typeSync: { in: ESTIMATE_OUTBOUND_SYNC_TYPES as any },
      isDisable: false,
    },
  });

  if (!syncPreference) {
    await createSyncLog({
      entity: "estimates",
      action: "SkippedOutbound",
      entityId: estimateId,
      companyId,
      details: jsonSafe({ reason: "Estimates outbound sync disabled", userId }),
      syncExecutionId,
    });
    return { action: "skipped", reason: "sync_disabled" };
  }

  const account = await prisma.quickBooksAccount.findUnique({
    where: { company_id: companyId },
    select: { id: true, isDisabled: true, needsReauthorization: true },
  });

  if (!account || account.isDisabled || account.needsReauthorization) {
    await createSyncLog({
      entity: "estimates",
      action: "SkippedOutbound",
      entityId: estimateId,
      companyId,
      details: jsonSafe({ reason: "QuickBooks account unavailable", userId }),
      syncExecutionId,
    });
    return { action: "skipped", reason: "account_unavailable" };
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      serviceProjects: { orderBy: { date_creation: "asc" } },
      project: {
        include: {
          client: true,
          workContext: true,
        },
      },
    },
  });

  if (!estimate || estimate.project?.company_id !== companyId) {
    await createSyncLog({
      entity: "estimates",
      action: "SkippedOutbound",
      entityId: estimateId,
      companyId,
      details: jsonSafe({ reason: "Estimate not found for company", userId }),
      syncExecutionId,
    });
    return { action: "skipped", reason: "estimate_not_found" };
  }

  const qboProjectId = await resolveQuickBooksProjectId(estimate.projectId, companyId);
  if (!qboProjectId) {
    await createSyncLog({
      entity: "estimates",
      action: "SkippedOutbound",
      entityId: estimateId,
      companyId,
      details: jsonSafe({ reason: "Project is not linked to QuickBooks", projectId: estimate.projectId, userId }),
      syncExecutionId,
    });
    return { action: "skipped", reason: "project_not_linked" };
  }

  const api = qboClientForAccount(account.id);
  let currentQboEstimate: any = null;
  if (estimate.idQuickbooks) {
    try {
      const { data } = await api.get(`/estimate/${estimate.idQuickbooks}`);
      currentQboEstimate = data?.Estimate || data;
    } catch (error: any) {
      await createSyncLog({
        entity: "estimates",
        action: "OutboundFetchWarning",
        entityId: estimateId,
        companyId,
        details: jsonSafe({ qboEstimateId: estimate.idQuickbooks, message: extractQboError(error) }),
        syncExecutionId,
      });
    }
  }

  const payload = await buildEstimatePayload(api, estimate, qboProjectId, currentQboEstimate);
  const lineMap = payload._lineMap;
  const { _lineMap, ...qboPayload } = payload;

  const { data } = currentQboEstimate?.Id
    ? await api.post("/estimate", qboPayload)
    : await api.post("/estimate", qboPayload);

  const qboEstimate = data?.Estimate || data;
  if (!qboEstimate?.Id) {
    throw new Error("QuickBooks did not return an estimate id");
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      idQuickbooks: String(qboEstimate.Id),
      quickbooksSyncToken: qboEstimate?.SyncToken ? String(qboEstimate.SyncToken) : null,
      quickbooksUpdatedAt: qboEstimate?.MetaData?.LastUpdatedTime
        ? new Date(qboEstimate.MetaData.LastUpdatedTime)
        : new Date(),
      quickbooksRaw: jsonSafe(qboEstimate),
    },
  });
  await syncReturnedLineIds(estimateId, lineMap, qboEstimate);

  const action = currentQboEstimate?.Id ? "UpdatedOutbound" : "CreatedOutbound";
  await createSyncLog({
    entity: "estimates",
    action,
    entityId: estimateId,
    companyId,
    details: jsonSafe({ qboEstimateId: qboEstimate.Id, qboProjectId }),
    syncExecutionId,
  });

  return { action, qboEstimateId: String(qboEstimate.Id) };
}

export async function syncLocalEstimatesToQuickBooks(companyId: string, userId: string, syncExecutionId?: string) {
  const estimates = await prisma.estimate.findMany({
    where: {
      type_estimate: "estimateProject",
      project: {
        company_id: companyId,
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      date_update: "asc",
    },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const results: any[] = [];

  for (const estimate of estimates) {
    try {
      const result = await upsertEstimateToQuickBooksInternal(companyId, userId, estimate.id, syncExecutionId);
      results.push({ estimateId: estimate.id, ...result });
      if (result.action === "CreatedOutbound") created += 1;
      else if (result.action === "UpdatedOutbound") updated += 1;
      else skipped += 1;
    } catch (error: any) {
      errors += 1;
      results.push({ estimateId: estimate.id, action: "error", message: extractQboError(error) });
      await createSyncLog({
        entity: "estimates",
        action: "ErrorOutbound",
        entityId: estimate.id,
        companyId,
        details: jsonSafe({ userId, message: extractQboError(error) }),
        syncExecutionId,
      });
    }
  }

  return {
    created,
    updated,
    skipped,
    errors,
    results,
  };
}

export function fireAndForgetUpsertEstimateToQBO(companyId: string | null | undefined, userId: string | null | undefined, estimateId: string | null | undefined) {
  if (!companyId || !userId || !estimateId) return;

  setImmediate(async () => {
    try {
      await upsertEstimateToQuickBooksInternal(companyId, userId, estimateId);
    } catch (error: any) {
      console.error("[fireAndForgetUpsertEstimateToQBO] failed:", error?.message || error);
      await createSyncLog({
        entity: "estimates",
        action: "ErrorOutbound",
        entityId: estimateId,
        companyId,
        details: jsonSafe({ userId, message: extractQboError(error) }),
      });
    }
  });
}
