import { NextFunction, Request, Response } from "express";
import { TrackingConfigMasterActor } from "../services/TrackingConfigService";
import { prisma } from "../utils/prisma";

function isMasterOfficeName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "master";
}

export async function requireMaster(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isDisabled: true,
        company_id: true,
        office: { select: { name: true, company_id: true } },
        companies: { select: { companyId: true } },
      },
    });
    const isMaster =
      !!user &&
      !user.isDisabled &&
      isMasterOfficeName(user.office.name) &&
      user.office.company_id == null &&
      user.company_id == null &&
      user.companies.length === 0;

    if (!user || !isMaster) {
      return res.status(403).json({ error: "Master access is required" });
    }

    const actor: TrackingConfigMasterActor = {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    (req as any).masterActor = actor;
    return next();
  } catch (error) {
    console.error("[requireMaster] Failed to authorize Master user:", error);
    return res.status(500).json({ error: "Unable to verify Master access" });
  }
}
