import { PlanInviteStatus, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { OWNER_FULL_ACCESS_DATA } from "../../utils/ownerFullAccess";
import { createPlanInviteCode } from "../../utils/planInviteCode";
import { prisma } from "../../utils/prisma";
import {
  issueRegistrationToken,
  verifyPlanInviteToken,
} from "../../utils/publicAccessTokens";

const publicPlanSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  validityType: true,
  validityDuration: true,
  allowedEmployees: true,
  isActive: true,
  isCampaign: true,
  isInviteOnly: true,
} satisfies Prisma.PlanSelect;

const inviteInclude = {
  plan: { select: publicPlanSelect },
  usedByCompany: { select: { id: true, name: true } },
} satisfies Prisma.PlanInviteInclude;

function serializeInvite(
  invite: Prisma.PlanInviteGetPayload<{ include: typeof inviteInclude }>,
) {
  return {
    id: invite.id,
    planId: invite.planId,
    status: invite.status,
    createdAt: invite.createdAt,
    usedAt: invite.usedAt,
    revokedAt: invite.revokedAt,
    usedByCompany: invite.usedByCompany,
    plan: invite.plan,
    code: invite.status === PlanInviteStatus.ACTIVE ? invite.code : null,
  };
}

function resolveInviteWhere(value: string): Prisma.PlanInviteWhereUniqueInput | null {
  if (!value.includes(".")) {
    return { code: value };
  }

  try {
    return { id: verifyPlanInviteToken(value).inviteId };
  } catch {
    return null;
  }
}

export class PlanInviteController {
  async getForPlan(req: Request, res: Response) {
    try {
      const { planId } = req.params;
      const plan = await prisma.plan.findUnique({
        where: { id: planId },
        select: { id: true },
      });

      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const invites = await prisma.planInvite.findMany({
        where: { planId },
        include: inviteInclude,
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const activeInvite = invites.find(
        (invite) => invite.status === PlanInviteStatus.ACTIVE,
      );

      return res.status(200).json({
        activeInvite: activeInvite ? serializeInvite(activeInvite) : null,
        history: invites
          .filter((invite) => invite.id !== activeInvite?.id)
          .map(serializeInvite),
      });
    } catch (error) {
      console.error("[PlanInvite] Failed to load invitations:", error);
      return res.status(500).json({ message: "Unable to load plan invitations" });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { planId } = req.params;
      const userId = (req as any).userId as string;
      const plan = await prisma.plan.findUnique({
        where: { id: planId },
        select: publicPlanSelect,
      });

      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (!plan.isActive) {
        return res.status(400).json({
          message: "Inactive plans cannot generate invitations",
        });
      }

      const invite = await prisma.planInvite.create({
        data: {
          code: createPlanInviteCode(),
          planId,
          activePlanKey: planId,
          createdByUserId: userId,
        },
        include: inviteInclude,
      });

      return res.status(201).json(serializeInvite(invite));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return res.status(409).json({
          message: "This plan already has an active invitation",
        });
      }

      console.error("[PlanInvite] Failed to create invitation:", error);
      return res.status(500).json({ message: "Unable to create plan invitation" });
    }
  }

  async revoke(req: Request, res: Response) {
    try {
      const { planId } = req.params;
      const result = await prisma.planInvite.updateMany({
        where: {
          planId,
          status: PlanInviteStatus.ACTIVE,
          activePlanKey: planId,
        },
        data: {
          status: PlanInviteStatus.REVOKED,
          activePlanKey: null,
          revokedAt: new Date(),
        },
      });

      if (result.count === 0) {
        return res.status(404).json({ message: "No active invitation found" });
      }

      return res.status(200).json({ message: "Invitation revoked" });
    } catch (error) {
      console.error("[PlanInvite] Failed to revoke invitation:", error);
      return res.status(500).json({ message: "Unable to revoke plan invitation" });
    }
  }

  async getPublic(req: Request, res: Response) {
    const code = String(req.params.code || "").trim();
    const inviteWhere = resolveInviteWhere(code);
    if (!inviteWhere) {
      return res.status(404).json({ message: "Invitation not found", code: "INVALID" });
    }

    try {
      const invite = await prisma.planInvite.findUnique({
        where: inviteWhere,
        include: inviteInclude,
      });

      if (!invite) {
        return res.status(404).json({ message: "Invitation not found", code: "INVALID" });
      }
      if (invite.status === PlanInviteStatus.USED) {
        return res.status(410).json({ message: "This invitation has already been used", code: "USED" });
      }
      if (invite.status === PlanInviteStatus.REVOKED) {
        return res.status(410).json({ message: "This invitation was revoked", code: "REVOKED" });
      }
      if (!invite.plan.isActive) {
        return res.status(410).json({ message: "This invitation is no longer available", code: "UNAVAILABLE" });
      }

      return res.status(200).json({
        plan: invite.plan,
        createdAt: invite.createdAt,
      });
    } catch (error) {
      console.error("[PlanInvite] Failed to validate public invitation:", error);
      return res.status(500).json({ message: "Unable to validate invitation" });
    }
  }

  async redeem(req: Request, res: Response) {
    const code = String(req.params.code || "").trim();
    const inviteWhere = resolveInviteWhere(code);
    if (!inviteWhere) {
      return res.status(404).json({ message: "Invitation not found", code: "INVALID" });
    }

    const companyName = String(req.body?.company_name || "").trim();
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!companyName || !name || !email || !password) {
      return res.status(400).json({ message: "All registration fields are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must contain at least 6 characters" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await prisma.$transaction(
        async (tx) => {
          const invite = await tx.planInvite.findUnique({
            where: inviteWhere,
            include: { plan: { select: publicPlanSelect } },
          });

          if (!invite || invite.status !== PlanInviteStatus.ACTIVE) {
            throw new Error("INVITE_ALREADY_USED");
          }
          if (!invite.plan.isActive) {
            throw new Error("INVITE_UNAVAILABLE");
          }

          const claimed = await tx.planInvite.updateMany({
            where: {
              id: invite.id,
              status: PlanInviteStatus.ACTIVE,
              activePlanKey: invite.planId,
            },
            data: {
              status: PlanInviteStatus.USED,
              activePlanKey: null,
              usedAt: new Date(),
            },
          });
          if (claimed.count !== 1) {
            throw new Error("INVITE_ALREADY_USED");
          }

          const existingUser = await tx.user.findUnique({ where: { email } });
          if (existingUser) {
            throw new Error("EMAIL_ALREADY_REGISTERED");
          }

          const company = await tx.company.create({ data: { name: companyName } });
          const ownerOffice = await tx.office.create({
            data: { name: "Owner", company_id: company.id },
          });
          const user = await tx.user.create({
            data: {
              name,
              email,
              phone: req.body?.phone || null,
              password: hashedPassword,
              document: null,
              city_and_state: null,
              rules: JSON.stringify(req.body?.rules) || {},
              office_id: ownerOffice.id,
              profession: null,
              company_id: company.id,
              onBoardingCompleted: false,
              ...OWNER_FULL_ACCESS_DATA,
            },
          });

          await tx.userCompany.create({
            data: {
              userId: user.id,
              companyId: company.id,
              office_id: ownerOffice.id,
            },
          });
          await tx.planInvite.update({
            where: { id: invite.id },
            data: { usedByCompanyId: company.id },
          });

          return { companyId: company.id, userId: user.id, plan: invite.plan };
        },
        { maxWait: 5000, timeout: 20000 },
      );

      return res.status(201).json({
        id: result.companyId,
        plan: result.plan,
        registrationToken: issueRegistrationToken(result.companyId, result.userId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message === "INVITE_ALREADY_USED") {
        return res.status(409).json({ message: "This invitation has already been used", code: "USED" });
      }
      if (message === "INVITE_UNAVAILABLE") {
        return res.status(410).json({ message: "This invitation is no longer available", code: "UNAVAILABLE" });
      }
      if (
        message === "EMAIL_ALREADY_REGISTERED" ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        return res.status(409).json({ message: "Email has already been registered in the system", code: "EMAIL_EXISTS" });
      }

      console.error("[PlanInvite] Failed to redeem invitation:", error);
      return res.status(500).json({ message: "Unable to create account from invitation" });
    }
  }
}
