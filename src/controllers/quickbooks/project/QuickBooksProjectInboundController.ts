import { Request, Response } from "express";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { getQbClientOrThrow } from "../util/QuickBooksClientUtil";
import {
  PROJECT_SYNC_ENTITY,
  upsertProjectFromQBO,
} from "./quickbooksProjectHelpers";

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100,
});

export class QuickBooksProjectInboundController {
  async syncProjects(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: "User ID não fornecido" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID não fornecido" });
    }

    try {
      const syncPref = await prisma.syncPreferences.findFirst({
        where: {
          companyId,
          userId,
          typesEntity: PROJECT_SYNC_ENTITY,
          typeSync: { in: ["QuickBooksToSmartBuild", "bidirectional"] },
          isDisable: false,
        },
      });

      if (!syncPref) {
        return res.status(403).json({
          error:
            "Sync not allowed: Make sure projects are configured to fetch from QuickBooks to SmartBuild.",
        });
      }

      const qb = await getQbClientOrThrow(userId, companyId);
      const result: any = await limiter.schedule(
        () =>
          new Promise((resolve, reject) => {
            qb.findCustomers({ fetchAll: true, Job: true }, (err: any, data: any) => {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            });
          })
      );

      const allJobs = (result?.QueryResponse?.Customer ?? []).filter(
        (customer: any) => customer?.Job === true
      );

      const counters = {
        inserted: 0,
        updated: 0,
        linkedExisting: 0,
        skipped: 0,
        conflicts: 0,
      };

      for (const qbJob of allJobs) {
        const upsertResult = await upsertProjectFromQBO({
          companyId,
          qbCustomer: qbJob,
          syncExecutionId,
          source: "sync",
        });

        if (upsertResult.action === "Inserted") counters.inserted++;
        if (upsertResult.action === "Updated") counters.updated++;
        if (upsertResult.action === "LinkedExisting") counters.linkedExisting++;
        if (upsertResult.action === "Skipped") counters.skipped++;
        if (upsertResult.action === "Conflict") counters.conflicts++;
      }

      return res.status(200).json({
        message: "Project synchronization from QuickBooks completed",
        synced: counters.inserted + counters.updated + counters.linkedExisting,
        totalJobs: allJobs.length,
        ...counters,
      });
    } catch (error: any) {
      console.error("Erro na sincronização de projects:", error);
      return res.status(500).json({
        error: "Erro interno na sincronização de projects",
        details: error?.Fault || error?.message || "Erro desconhecido",
        debugInfo: {
          environment: process.env.QUICKBOOKS_ENVIRONMENT || "sandbox",
        },
      });
    }
  }
}
