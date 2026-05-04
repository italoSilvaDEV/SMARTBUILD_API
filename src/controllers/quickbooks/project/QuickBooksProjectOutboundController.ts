import { Request, Response } from "express";
import { AxiosError, AxiosInstance } from "axios";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { getQbClientOrThrow } from "../util/QuickBooksClientUtil";
import { qboClientForAccount } from "../util/http/qboClientFactory";
import { deepEqual, jsonSafe } from "../customer/quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";
import { isDuplicateNameError } from "../util/uniqueDisplayName";
import { extractCustomer } from "../webhook/QuickBooksWebhookWorker";
import {
  buildProjectDisplayName,
  buildProjectKey,
  buildProjectLogDetails,
  buildProjectPayloadForQbo,
  normalizeLocalProjectForQbo,
  normalizeQboProjectForCompare,
  parseQboUpdatedAt,
  PROJECT_SYNC_ENTITY,
} from "./quickbooksProjectHelpers";

const BATCH_SIZE_TRY = 30;
const BATCH_SIZE_FALLBACK = 10;
const BATCH_PAUSE_MS = 1500;
const MAX_RETRIES = 3;
const JOBS_PAGE_SIZE = 1000;
const QBO_COOLDOWN_MS = 5000;
const MIN_DELTA_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100,
});

type ProjectWithClient = {
  id: string;
  contract_number: number | null;
  client_id: string | null;
  quickbooksCustomerId: string | null;
  quickbooksSyncToken: string | null;
  quickbooksUpdatedAt: Date | null;
  status_project: string;
  price: any;
  amountPaid: any;
  balanceDue: any;
  start_date: string | null;
  deadline: string | null;
  date_update: Date;
  location: string | null;
  lat: string | null;
  log: string | null;
  radius: number | null;
  client: {
    id: string;
    idQuickbooks: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    city_and_state: string | null;
    location: string | null;
  } | null;
  workContext: {
    label: string | null;
    Name: string | null;
    Email: string | null;
    phone: string | null;
    street: string | null;
    district: string | null;
    zip_code: string | null;
    city_and_state: string | null;
    state: string | null;
    number: string | null;
    complement: string | null;
    location: string | null;
    addressOffice: string | null;
    notes: string | null;
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
  updated: number;
  skipped: number;
  failed: number;
  conflicts: number;
  orphaned: number;
  noOpSkipped: number;
  coolingSkipped: number;
  staleLocalSkipped: number;
  skippedWithoutClient: number;
  skippedWithoutSyncedClient: number;
  alreadyLinked: number;
  batchesAtTried: number;
  batchesAtFallback: number;
  totalBatches: number;
  duplicateRetries: number;
};

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
    entity: PROJECT_SYNC_ENTITY,
    action: params.action,
    entityId: params.project.id,
    companyId: params.companyId,
    details: buildProjectLogDetails({
      projectId: params.project.id,
      projectName: params.projectName,
      clientId: params.project.client_id,
      qboParentCustomerId: params.qboParentCustomerId,
      qboProjectCustomerId: params.qboCustomer?.Id ?? null,
      contractNumber: params.project.contract_number,
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
    entity: PROJECT_SYNC_ENTITY,
    action: "Failed",
    entityId: params.project.id,
    companyId: params.companyId,
    details: buildProjectLogDetails({
      projectId: params.project.id,
      projectName: params.projectName,
      clientId: params.project.client_id,
      qboParentCustomerId: params.qboParentCustomerId,
      qboProjectCustomerId: params.project.quickbooksCustomerId,
      contractNumber: params.project.contract_number,
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
      Customer: buildProjectPayloadForQbo(candidate.project),
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

        const duplicateError = new Error(
          "Duplicate name reported by QuickBooks, but no matching job was found afterward"
        );

        counters.failed++;
        await failProjectSync({
          project: candidate.project,
          projectName: candidate.projectName,
          companyId,
          syncExecutionId,
          qboParentCustomerId: candidate.qboParentCustomerId,
          error: duplicateError,
        });

        if (siblings.length > 0) {
          counters.failed += siblings.length;
          await failSiblingProjects({
            siblings,
            companyId,
            syncExecutionId,
            error: duplicateError,
            reason: "Primary project duplicate could not be resolved in QuickBooks",
          });
        }
      }
    }

    await sleep(BATCH_PAUSE_MS);
  }
}

async function syncLinkedProjectsToQBO(params: {
  qb: any;
  projects: ProjectWithClient[];
  companyId: string;
  syncExecutionId?: string;
  counters: ProjectCounters;
}) {
  const { qb, projects, companyId, syncExecutionId, counters } = params;

  for (const project of projects) {
    const projectName = buildProjectDisplayName(project);
    const qboParentCustomerId = project.client?.idQuickbooks ?? null;

    if (!project.quickbooksCustomerId || !qboParentCustomerId) {
      counters.skipped++;
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: "Skipped",
        entityId: project.id,
        companyId,
        details: buildProjectLogDetails({
          projectId: project.id,
          projectName,
          clientId: project.client_id,
          qboParentCustomerId,
          qboProjectCustomerId: project.quickbooksCustomerId,
          contractNumber: project.contract_number,
          reason: "Project is linked but parent customer is not synced",
        }),
        syncExecutionId,
      });
      continue;
    }

    const now = new Date();
    const lastRemote = project.quickbooksUpdatedAt ?? new Date(0);
    const stillCooling =
      project.quickbooksUpdatedAt &&
      now.getTime() - lastRemote.getTime() < QBO_COOLDOWN_MS;

    if (stillCooling) {
      counters.skipped++;
      counters.coolingSkipped++;
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: "Skipped",
        entityId: project.id,
        companyId,
        details: buildProjectLogDetails({
          projectId: project.id,
          projectName,
          clientId: project.client_id,
          qboParentCustomerId,
          qboProjectCustomerId: project.quickbooksCustomerId,
          contractNumber: project.contract_number,
          reason: `CoolingOff (${QBO_COOLDOWN_MS}ms) after last QBO mirror`,
        }),
        syncExecutionId,
      });
      continue;
    }

    const localNewer =
      project.date_update.getTime() - lastRemote.getTime() > MIN_DELTA_MS;

    if (!localNewer) {
      counters.skipped++;
      counters.staleLocalSkipped++;
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: "Skipped",
        entityId: project.id,
        companyId,
        details: buildProjectLogDetails({
          projectId: project.id,
          projectName,
          clientId: project.client_id,
          qboParentCustomerId,
          qboProjectCustomerId: project.quickbooksCustomerId,
          contractNumber: project.contract_number,
          reason: "Local project is not newer than the last QBO mirror",
        }),
        syncExecutionId,
      });
      continue;
    }

    try {
      const current: any = await limiter.schedule(
        () =>
          new Promise((resolve, reject) => {
            qb.getCustomer(project.quickbooksCustomerId, (err: any, data: any) =>
              err ? reject(err) : resolve(data)
            );
          })
      );

      const qbProject = extractCustomer(current);
      if (!qbProject) {
        counters.skipped++;
        counters.orphaned++;
        await createSyncLog({
          entity: PROJECT_SYNC_ENTITY,
          action: "OrphanDetected",
          entityId: project.id,
          companyId,
          details: buildProjectLogDetails({
            projectId: project.id,
            projectName,
            clientId: project.client_id,
            qboParentCustomerId,
            qboProjectCustomerId: project.quickbooksCustomerId,
            contractNumber: project.contract_number,
            reason: "QBO job not found for quickbooksCustomerId",
          }),
          syncExecutionId,
        });
        continue;
      }

      const qbUpdatedAt = parseQboUpdatedAt(qbProject);
      if (
        qbUpdatedAt &&
        project.quickbooksUpdatedAt &&
        qbUpdatedAt > project.quickbooksUpdatedAt &&
        project.date_update <= qbUpdatedAt
      ) {
        counters.conflicts++;
        await createSyncLog({
          entity: PROJECT_SYNC_ENTITY,
          action: "Conflict",
          entityId: project.id,
          companyId,
          details: buildProjectLogDetails({
            projectId: project.id,
            projectName,
            clientId: project.client_id,
            qboParentCustomerId,
            qboProjectCustomerId: project.quickbooksCustomerId,
            contractNumber: project.contract_number,
            reason: "QBO job is newer than local changes, skipping push",
          }),
          syncExecutionId,
        });
        continue;
      }

      const normalizedLocal = normalizeLocalProjectForQbo(project);
      const normalizedQbo = normalizeQboProjectForCompare(qbProject);

      if (deepEqual(normalizedLocal, normalizedQbo)) {
        counters.skipped++;
        counters.noOpSkipped++;
        await createSyncLog({
          entity: PROJECT_SYNC_ENTITY,
          action: "Skipped",
          entityId: project.id,
          companyId,
          details: buildProjectLogDetails({
            projectId: project.id,
            projectName,
            clientId: project.client_id,
            qboParentCustomerId,
            qboProjectCustomerId: project.quickbooksCustomerId,
            contractNumber: project.contract_number,
            reason: "No-op (same content)",
          }),
          syncExecutionId,
        });
        continue;
      }

      const projectPayload = buildProjectPayloadForQbo(project);
      const updatePayload = {
        Id: qbProject.Id,
        SyncToken: qbProject.SyncToken,
        sparse: true,
        ...projectPayload,
      };

      const updated: any = await limiter.schedule(
        () =>
          new Promise((resolve, reject) => {
            qb.updateCustomer(updatePayload, (err: any, data: any) =>
              err ? reject(err) : resolve(data)
            );
          })
      );

      const updatedCustomer = extractCustomer(updated) ?? updated?.Customer ?? updated;
      const updatedLast = parseQboUpdatedAt(updatedCustomer) ?? new Date();

      await prisma.project.update({
        where: { id: project.id },
        data: {
          quickbooksSyncToken: updatedCustomer?.SyncToken ?? project.quickbooksSyncToken,
          quickbooksUpdatedAt: updatedLast,
        },
      });

      counters.updated++;
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: "UpdatedInQBO",
        entityId: project.id,
        companyId,
        details: jsonSafe({
          projectId: project.id,
          projectName,
          clientId: project.client_id,
          qboParentCustomerId,
          qboProjectCustomerId: project.quickbooksCustomerId,
          contractNumber: project.contract_number,
          before: normalizedQbo,
          pushed: normalizedLocal,
          result: {
            Id: updatedCustomer?.Id,
            SyncToken: updatedCustomer?.SyncToken,
            lastUpdated: updatedLast,
          },
        }),
        syncExecutionId,
      });
    } catch (error: any) {
      counters.failed++;
      await createSyncLog({
        entity: PROJECT_SYNC_ENTITY,
        action: "ErrorPushToQBO",
        entityId: project.id,
        companyId,
        details: buildProjectLogDetails({
          projectId: project.id,
          projectName,
          clientId: project.client_id,
          qboParentCustomerId,
          qboProjectCustomerId: project.quickbooksCustomerId,
          contractNumber: project.contract_number,
          error: error?.message || error,
        }),
        syncExecutionId,
      });
    }
  }
}

export class QuickBooksProjectOutboundController {
  async syncProjectsToQBO(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: "User ID não fornecido" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID não fornecido" });
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
      const qb = await getQbClientOrThrow(userId, companyId);

      const projects = await prisma.project.findMany({
        where: { company_id: companyId },
        select: {
          id: true,
          contract_number: true,
          client_id: true,
          quickbooksCustomerId: true,
          quickbooksSyncToken: true,
          quickbooksUpdatedAt: true,
          status_project: true,
          price: true,
          amountPaid: true,
          balanceDue: true,
          start_date: true,
          deadline: true,
          date_update: true,
          location: true,
          lat: true,
          log: true,
          radius: true,
          client: {
            select: {
              id: true,
              idQuickbooks: true,
              name: true,
              email: true,
              phone: true,
              city_and_state: true,
              location: true,
            },
          },
          workContext: {
            select: {
              label: true,
              Name: true,
              Email: true,
              phone: true,
              street: true,
              district: true,
              zip_code: true,
              city_and_state: true,
              state: true,
              number: true,
              complement: true,
              location: true,
              addressOffice: true,
              notes: true,
            },
          },
        },
        orderBy: { date_creation: "asc" },
      });

      const counters: ProjectCounters = {
        created: 0,
        linkedExisting: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        conflicts: 0,
        orphaned: 0,
        noOpSkipped: 0,
        coolingSkipped: 0,
        staleLocalSkipped: 0,
        skippedWithoutClient: 0,
        skippedWithoutSyncedClient: 0,
        alreadyLinked: 0,
        batchesAtTried: 0,
        batchesAtFallback: 0,
        totalBatches: 0,
        duplicateRetries: 0,
      };

      const eligibleCandidates: ProjectCandidate[] = [];
      const updateCandidates: ProjectWithClient[] = [];

      for (const project of projects) {
        const projectName = buildProjectDisplayName(project);
        const qboParentCustomerId = project.client?.idQuickbooks ?? null;

        if (!project.client_id || !project.client) {
          counters.skipped++;
          counters.skippedWithoutClient++;
          await createSyncLog({
            entity: PROJECT_SYNC_ENTITY,
            action: "Skipped",
            entityId: project.id,
            companyId,
            details: buildProjectLogDetails({
              projectId: project.id,
              projectName,
              contractNumber: project.contract_number,
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
            entity: PROJECT_SYNC_ENTITY,
            action: "Skipped",
            entityId: project.id,
            companyId,
            details: buildProjectLogDetails({
              projectId: project.id,
              projectName,
              clientId: project.client_id,
              contractNumber: project.contract_number,
              reason: "Client is not synced with QuickBooks",
            }),
            syncExecutionId,
          });
          continue;
        }

        if (project.quickbooksCustomerId) {
          counters.alreadyLinked++;
          updateCandidates.push(project);
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

      if (updateCandidates.length > 0) {
        await syncLinkedProjectsToQBO({
          qb,
          projects: updateCandidates,
          companyId,
          syncExecutionId,
          counters,
        });
      }

      return res.status(200).json({
        message:
          counters.created > 0 ||
          counters.linkedExisting > 0 ||
          counters.updated > 0
            ? "Project sync to QuickBooks finished"
            : counters.skippedWithoutSyncedClient > 0
              ? "No eligible projects were exported. Sync customers first so each project has a parent QuickBooks customer."
              : "Project sync to QuickBooks finished",
        created: counters.created,
        linkedExisting: counters.linkedExisting,
        updated: counters.updated,
        alreadyLinked: counters.alreadyLinked,
        skipped: counters.skipped,
        failed: counters.failed,
        conflicts: counters.conflicts,
        orphaned: counters.orphaned,
        noOpSkipped: counters.noOpSkipped,
        coolingSkipped: counters.coolingSkipped,
        staleLocalSkipped: counters.staleLocalSkipped,
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
