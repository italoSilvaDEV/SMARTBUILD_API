import { Request, Response } from "express";
import { AxiosError, AxiosInstance } from "axios";
import { prisma } from "../../../utils/prisma";
import { qboClientForAccount } from "../util/http/qboClientFactory";
import { jsonSafe } from "../customer/quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";
import { isDuplicateNameError } from "../util/uniqueDisplayName";

const BATCH_SIZE_TRY = 30;
const BATCH_SIZE_FALLBACK = 10;
const BATCH_PAUSE_MS = 1500;
const MAX_RETRIES = 3;
const JOBS_PAGE_SIZE = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ProjectWithClient = {
  id: string;
  contract_number: number | null;
  client_id: string | null;
  quickbooksCustomerId: string | null;
  quickbooksSyncToken: string | null;
  quickbooksUpdatedAt: Date | null;
  client: {
    id: string;
    idQuickbooks: string | null;
  } | null;
};

type ProjectCandidate = {
  key: string;
  projectName: string;
  qboParentCustomerId: string;
  project: ProjectWithClient;
};

type ProjectCounters = {
  created: number;
  linkedExisting: number;
  skipped: number;
  failed: number;
  skippedWithoutClient: number;
  skippedWithoutSyncedClient: number;
  alreadyLinked: number;
  batchesAtTried: number;
  batchesAtFallback: number;
  totalBatches: number;
  duplicateRetries: number;
};

function buildProjectDisplayName(project: { contract_number?: number | null; id: string }) {
  const base = project.contract_number
    ? `Project ${project.contract_number}`
    : `Project ${project.id.slice(0, 8)}`;

  return base.slice(0, 100);
}

function parseQboUpdatedAt(customer: any) {
  return customer?.MetaData?.LastUpdatedTime
    ? new Date(customer.MetaData.LastUpdatedTime)
    : null;
}

function buildProjectLogDetails(params: {
  project: ProjectWithClient;
  projectName: string;
  qboParentCustomerId?: string | null;
  qboProjectCustomerId?: string | null;
  error?: any;
  reason?: string;
}) {
  return jsonSafe({
    projectId: params.project.id,
    projectName: params.projectName,
    clientId: params.project.client_id ?? null,
    qboParentCustomerId: params.qboParentCustomerId ?? null,
    qboProjectCustomerId:
      params.qboProjectCustomerId ?? params.project.quickbooksCustomerId ?? null,
    reason: params.reason ?? null,
    error: params.error ?? null,
  });
}

function buildProjectKey(parentCustomerId: string, projectName: string) {
  return `${parentCustomerId}::${projectName.trim().toLowerCase()}`;
}

function retryAfterMsFromErr(err: AxiosError) {
  const retryAfter = err.response?.headers?.["retry-after"];
  const asNumber = Number(retryAfter);

  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber * 1000;
  }

  return 5000;
}

function isBatchTooLargeError(err: any): boolean {
  const parts: string[] = [];
  if (err?.message) parts.push(String(err.message));
  if (err?.response?.data?.Fault?.Error) {
    for (const item of err.response.data.Fault.Error) {
      if (item?.Detail) parts.push(String(item.Detail));
      if (item?.Message) parts.push(String(item.Message));
    }
  }

  const text = parts.join(" | ").toLowerCase();
  return /too many|max(imum)? (operations|items)|batch item limit|exceeded/.test(text);
}

async function runBatchWithRetry(
  api: AxiosInstance,
  batchItems: any[],
  attempt = 1
): Promise<any> {
  try {
    const { data } = await api.post("/batch", {
      BatchItemRequest: batchItems,
    });
    return data;
  } catch (error: any) {
    const status = error?.response?.status;

    if ((status === 429 || status === 503) && attempt <= MAX_RETRIES) {
      const waitMs = retryAfterMsFromErr(error);
      await sleep(waitMs);
      return runBatchWithRetry(api, batchItems, attempt + 1);
    }

    throw error;
  }
}

async function fetchAllProjectJobs(api: AxiosInstance) {
  const jobs: any[] = [];
  let startPosition = 1;

  while (true) {
    const sql = `select * from Customer where Job = true startposition ${startPosition} maxresults ${JOBS_PAGE_SIZE}`;
    const { data } = await api.get("/query", {
      params: { query: sql },
    });

    const pageJobs = data?.QueryResponse?.Customer ?? [];
    jobs.push(...pageJobs);

    if (pageJobs.length < JOBS_PAGE_SIZE) {
      break;
    }

    startPosition += JOBS_PAGE_SIZE;
  }

  return jobs;
}

function buildJobsMap(jobs: any[]) {
  const jobsMap = new Map<string, any>();

  for (const job of jobs) {
    const parentCustomerId = job?.ParentRef?.value;
    const displayName = job?.DisplayName;

    if (!parentCustomerId || !displayName) {
      continue;
    }

    jobsMap.set(buildProjectKey(parentCustomerId, displayName), job);
  }

  return jobsMap;
}

async function persistProjectLink(params: {
  project: ProjectWithClient;
  projectName: string;
  companyId: string;
  syncExecutionId?: string;
  qboParentCustomerId: string;
  qboCustomer: any;
  action: "Created" | "LinkedExisting";
  reason?: string;
}) {
  await prisma.project.update({
    where: { id: params.project.id },
    data: {
      quickbooksCustomerId: params.qboCustomer?.Id ?? null,
      quickbooksSyncToken: params.qboCustomer?.SyncToken ?? null,
      quickbooksUpdatedAt: parseQboUpdatedAt(params.qboCustomer),
    },
  });

  await createSyncLog({
    entity: "Project",
    action: params.action,
    entityId: params.project.id,
    companyId: params.companyId,
    details: buildProjectLogDetails({
      project: params.project,
      projectName: params.projectName,
      qboParentCustomerId: params.qboParentCustomerId,
      qboProjectCustomerId: params.qboCustomer?.Id ?? null,
      reason: params.reason,
    }),
    syncExecutionId: params.syncExecutionId,
  });
}

async function failProjectSync(params: {
  project: ProjectWithClient;
  projectName: string;
  companyId: string;
  syncExecutionId?: string;
  qboParentCustomerId: string;
  error: any;
  reason?: string;
}) {
  await createSyncLog({
    entity: "Project",
    action: "Failed",
    entityId: params.project.id,
    companyId: params.companyId,
    details: buildProjectLogDetails({
      project: params.project,
      projectName: params.projectName,
      qboParentCustomerId: params.qboParentCustomerId,
      reason: params.reason,
      error: params.error?.response?.data || params.error?.message || params.error,
    }),
    syncExecutionId: params.syncExecutionId,
  });
}

async function linkSiblingProjects(params: {
  siblings: ProjectCandidate[];
  qboCustomer: any;
  companyId: string;
  syncExecutionId?: string;
  reason: string;
}) {
  for (const sibling of params.siblings) {
    await persistProjectLink({
      project: sibling.project,
      projectName: sibling.projectName,
      companyId: params.companyId,
      syncExecutionId: params.syncExecutionId,
      qboParentCustomerId: sibling.qboParentCustomerId,
      qboCustomer: params.qboCustomer,
      action: "LinkedExisting",
      reason: params.reason,
    });
  }
}

async function failSiblingProjects(params: {
  siblings: ProjectCandidate[];
  companyId: string;
  syncExecutionId?: string;
  error: any;
  reason: string;
}) {
  for (const sibling of params.siblings) {
    await failProjectSync({
      project: sibling.project,
      projectName: sibling.projectName,
      companyId: params.companyId,
      syncExecutionId: params.syncExecutionId,
      qboParentCustomerId: sibling.qboParentCustomerId,
      error: params.error,
      reason: params.reason,
    });
  }
}

async function processProjectCreateBatch(params: {
  api: AxiosInstance;
  batchCandidates: ProjectCandidate[];
  siblingMap: Map<string, ProjectCandidate[]>;
  jobsMap: Map<string, any>;
  companyId: string;
  syncExecutionId?: string;
  counters: ProjectCounters;
  batchSize: number;
}) {
  const {
    api,
    batchCandidates,
    siblingMap,
    jobsMap,
    companyId,
    syncExecutionId,
    counters,
    batchSize,
  } = params;

  for (let i = 0; i < batchCandidates.length; i += batchSize) {
    const slice = batchCandidates.slice(i, i + batchSize);
    const batchItems = slice.map((candidate) => ({
      bId: `p_${candidate.project.id}`,
      operation: "create",
      Customer: {
        DisplayName: candidate.projectName,
        Job: true,
        ParentRef: {
          value: candidate.qboParentCustomerId,
        },
      },
    }));

    let batchResponse: any;

    try {
      batchResponse = await runBatchWithRetry(api, batchItems);
      if (batchSize === BATCH_SIZE_TRY) counters.batchesAtTried++;
      if (batchSize === BATCH_SIZE_FALLBACK) counters.batchesAtFallback++;
      counters.totalBatches++;
    } catch (error: any) {
      if (isBatchTooLargeError(error) && batchSize > BATCH_SIZE_FALLBACK) {
        await processProjectCreateBatch({
          ...params,
          batchCandidates: slice,
          batchSize: BATCH_SIZE_FALLBACK,
        });
        await sleep(BATCH_PAUSE_MS);
        continue;
      }

      for (const candidate of slice) {
        counters.failed++;
        await failProjectSync({
          project: candidate.project,
          projectName: candidate.projectName,
          companyId,
          syncExecutionId,
          qboParentCustomerId: candidate.qboParentCustomerId,
          error,
        });

        const siblings = siblingMap.get(candidate.key) ?? [];
        if (siblings.length > 0) {
          counters.failed += siblings.length;
          await failSiblingProjects({
            siblings,
            companyId,
            syncExecutionId,
            error,
            reason: "Primary project sync failed for this parent/name combination",
          });
        }
      }

      await sleep(BATCH_PAUSE_MS);
      continue;
    }

    const responseItems = batchResponse?.BatchItemResponse ?? [];
    const byProjectId = new Map(slice.map((candidate) => [candidate.project.id, candidate]));
    const duplicateCandidates: ProjectCandidate[] = [];

    for (const item of responseItems) {
      const batchId = String(item?.bId ?? "");
      const projectId = batchId.replace(/^p_/, "");
      const candidate = byProjectId.get(projectId);

      if (!candidate) {
        continue;
      }

      const createdCustomer = item?.Customer;

      if (createdCustomer?.Id) {
        jobsMap.set(candidate.key, createdCustomer);

        await persistProjectLink({
          project: candidate.project,
          projectName: candidate.projectName,
          companyId,
          syncExecutionId,
          qboParentCustomerId: candidate.qboParentCustomerId,
          qboCustomer: createdCustomer,
          action: "Created",
        });

        counters.created++;

        const siblings = siblingMap.get(candidate.key) ?? [];
        if (siblings.length > 0) {
          await linkSiblingProjects({
            siblings,
            qboCustomer: createdCustomer,
            companyId,
            syncExecutionId,
            reason: "Linked to project created in the same batch",
          });
          counters.linkedExisting += siblings.length;
        }

        continue;
      }

      const fault = item?.Fault ?? item?.fault ?? item?.error ?? null;
      if (isDuplicateNameError(fault || item)) {
        duplicateCandidates.push(candidate);
        continue;
      }

      counters.failed++;
      await failProjectSync({
        project: candidate.project,
        projectName: candidate.projectName,
        companyId,
        syncExecutionId,
        qboParentCustomerId: candidate.qboParentCustomerId,
        error: fault || item,
      });

      const siblings = siblingMap.get(candidate.key) ?? [];
      if (siblings.length > 0) {
        counters.failed += siblings.length;
        await failSiblingProjects({
          siblings,
          companyId,
          syncExecutionId,
          error: fault || item,
          reason: "Primary project sync failed for this parent/name combination",
        });
      }
    }

    if (duplicateCandidates.length > 0) {
      counters.duplicateRetries += duplicateCandidates.length;
      const refreshedJobsMap = buildJobsMap(await fetchAllProjectJobs(api));

      for (const candidate of duplicateCandidates) {
        const existingJob = refreshedJobsMap.get(candidate.key);
        const siblings = siblingMap.get(candidate.key) ?? [];

        if (existingJob) {
          jobsMap.set(candidate.key, existingJob);

          await persistProjectLink({
            project: candidate.project,
            projectName: candidate.projectName,
            companyId,
            syncExecutionId,
            qboParentCustomerId: candidate.qboParentCustomerId,
            qboCustomer: existingJob,
            action: "LinkedExisting",
            reason: "Linked after duplicate-name check",
          });
          counters.linkedExisting++;

          if (siblings.length > 0) {
            await linkSiblingProjects({
              siblings,
              qboCustomer: existingJob,
              companyId,
              syncExecutionId,
              reason: "Linked after duplicate-name check",
            });
            counters.linkedExisting += siblings.length;
          }
          continue;
        }

        counters.failed++;
        await failProjectSync({
          project: candidate.project,
          projectName: candidate.projectName,
          companyId,
          syncExecutionId,
          qboParentCustomerId: candidate.qboParentCustomerId,
          error: new Error("Duplicate name reported by QuickBooks, but no matching job was found afterward"),
        });

        if (siblings.length > 0) {
          counters.failed += siblings.length;
          await failSiblingProjects({
            siblings,
            companyId,
            syncExecutionId,
            error: new Error("Duplicate name reported by QuickBooks, but no matching job was found afterward"),
            reason: "Primary project duplicate could not be resolved in QuickBooks",
          });
        }
      }
    }

    await sleep(BATCH_PAUSE_MS);
  }
}

export class QuickBooksProjectOutboundController {
  async syncProjectsToQBO(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: "User ID nÃ£o fornecido" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID nÃ£o fornecido" });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const account = await prisma.quickBooksAccount.findUnique({
        where: { company_id: companyId },
      });

      if (!account) {
        return res.status(404).json({ error: "QuickBooks account not found" });
      }

      if (account.isDisabled) {
        return res.status(403).json({ error: "QuickBooks account is disabled" });
      }

      const api = qboClientForAccount(account.id);

      const projects = await prisma.project.findMany({
        where: { company_id: companyId },
        select: {
          id: true,
          contract_number: true,
          client_id: true,
          quickbooksCustomerId: true,
          quickbooksSyncToken: true,
          quickbooksUpdatedAt: true,
          client: {
            select: {
              id: true,
              idQuickbooks: true,
            },
          },
        },
        orderBy: { date_creation: "asc" },
      });

      const counters: ProjectCounters = {
        created: 0,
        linkedExisting: 0,
        skipped: 0,
        failed: 0,
        skippedWithoutClient: 0,
        skippedWithoutSyncedClient: 0,
        alreadyLinked: 0,
        batchesAtTried: 0,
        batchesAtFallback: 0,
        totalBatches: 0,
        duplicateRetries: 0,
      };

      const eligibleCandidates: ProjectCandidate[] = [];

      for (const project of projects) {
        const projectName = buildProjectDisplayName(project);
        const qboParentCustomerId = project.client?.idQuickbooks ?? null;

        if (!project.client_id || !project.client) {
          counters.skipped++;
          counters.skippedWithoutClient++;
          await createSyncLog({
            entity: "Project",
            action: "Skipped",
            entityId: project.id,
            companyId,
            details: buildProjectLogDetails({
              project,
              projectName,
              reason: "Project has no client",
            }),
            syncExecutionId,
          });
          continue;
        }

        if (!qboParentCustomerId) {
          counters.skipped++;
          counters.skippedWithoutSyncedClient++;
          await createSyncLog({
            entity: "Project",
            action: "Skipped",
            entityId: project.id,
            companyId,
            details: buildProjectLogDetails({
              project,
              projectName,
              reason: "Client is not synced with QuickBooks",
            }),
            syncExecutionId,
          });
          continue;
        }

        if (project.quickbooksCustomerId) {
          counters.skipped++;
          counters.alreadyLinked++;
          await createSyncLog({
            entity: "Project",
            action: "AlreadyLinked",
            entityId: project.id,
            companyId,
            details: buildProjectLogDetails({
              project,
              projectName,
              qboParentCustomerId,
              qboProjectCustomerId: project.quickbooksCustomerId,
              reason: "Project already linked with QuickBooks",
            }),
            syncExecutionId,
          });
          continue;
        }

        eligibleCandidates.push({
          key: buildProjectKey(qboParentCustomerId, projectName),
          projectName,
          qboParentCustomerId,
          project,
        });
      }

      const jobsMap = buildJobsMap(await fetchAllProjectJobs(api));
      const siblingMap = new Map<string, ProjectCandidate[]>();
      const createCandidates: ProjectCandidate[] = [];
      const queuedByKey = new Set<string>();

      for (const candidate of eligibleCandidates) {
        const existingJob = jobsMap.get(candidate.key);

        if (existingJob) {
          await persistProjectLink({
            project: candidate.project,
            projectName: candidate.projectName,
            companyId,
            syncExecutionId,
            qboParentCustomerId: candidate.qboParentCustomerId,
            qboCustomer: existingJob,
            action: "LinkedExisting",
          });
          counters.linkedExisting++;
          continue;
        }

        if (queuedByKey.has(candidate.key)) {
          const siblings = siblingMap.get(candidate.key) ?? [];
          siblings.push(candidate);
          siblingMap.set(candidate.key, siblings);
          continue;
        }

        queuedByKey.add(candidate.key);
        siblingMap.set(candidate.key, []);
        createCandidates.push(candidate);
      }

      if (createCandidates.length > 0) {
        await processProjectCreateBatch({
          api,
          batchCandidates: createCandidates,
          siblingMap,
          jobsMap,
          companyId,
          syncExecutionId,
          counters,
          batchSize: BATCH_SIZE_TRY,
        });
      }

      return res.status(200).json({
        message:
          counters.created > 0 || counters.linkedExisting > 0
            ? "Project sync to QuickBooks finished"
            : counters.skippedWithoutSyncedClient > 0
              ? "No eligible projects were exported. Sync customers first so each project has a parent QuickBooks customer."
              : "Project sync to QuickBooks finished",
        created: counters.created,
        linkedExisting: counters.linkedExisting,
        alreadyLinked: counters.alreadyLinked,
        skipped: counters.skipped,
        failed: counters.failed,
        skippedWithoutClient: counters.skippedWithoutClient,
        skippedWithoutSyncedClient: counters.skippedWithoutSyncedClient,
        totalProcessed: projects.length,
        batchStats: {
          triedSize: BATCH_SIZE_TRY,
          fallbackSize: BATCH_SIZE_FALLBACK,
          batchesAtTried: counters.batchesAtTried,
          batchesAtFallback: counters.batchesAtFallback,
          totalBatches: counters.totalBatches,
          duplicateRetries: counters.duplicateRetries,
        },
      });
    } catch (error: any) {
      console.error("Erro no sync de projects para o QuickBooks:", error);
      return res.status(500).json({
        error: "Erro interno no sync de projects",
        details: error?.message || "Erro desconhecido",
      });
    }
  }
}
