import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import {
  appendBreakPolicyHistory,
  BreakPolicyMode,
  buildLegacySnapshot,
  buildPolicySnapshot,
  normalizeBreakPolicyRules,
  normalizeBreakPolicyWeekdays,
  toEffectiveDate,
} from "../../utils/breakPolicies";

const companyUserWhere = (companyId: string) => ({
  OR: [{ company_id: companyId }, { companies: { some: { companyId } } }],
});

const isAdministrativeOffice = (name?: string | null) =>
  ["owner", "administrator"].includes(String(name || "").trim().toLowerCase());

const BULK_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

function userHistoryStart(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

async function hasCompanyAccess(request: Request, companyId: string, requireAdmin = false) {
  const requesterId = (request as any).userId as string | undefined;
  if (!requesterId) return false;
  const user = await prisma.user.findUnique({
    where: { id: requesterId },
    select: {
      company_id: true,
      office: { select: { name: true } },
      companies: {
        where: { companyId },
        select: { office: { select: { name: true } } },
      },
    },
  });
  if (!user) return false;

  const officeName = user.companies[0]?.office?.name || (user.company_id === companyId ? user.office?.name : null);
  return officeName ? (!requireAdmin || isAdministrativeOffice(officeName)) : false;
}

function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "BREAK_POLICY_REQUEST_FAILED";
  const validationErrors = new Set([
    "INVALID_BREAK_POLICY_RULES",
    "DUPLICATE_BREAK_POLICY_THRESHOLD",
    "INVALID_BREAK_POLICY_WEEKDAYS",
    "INVALID_EFFECTIVE_DATE",
    "PAST_EFFECTIVE_DATE",
    "INVALID_BREAK_POLICY_MODE",
  ]);
  if (validationErrors.has(message)) return response.status(400).json({ error: message });
  console.error("Break policy request failed:", error);
  return response.status(500).json({ error: "Unable to process break policy" });
}

async function ensureUniqueName(companyId: string, name: string, ignoredId?: string) {
  const policies = await prisma.breakPolicy.findMany({
    where: { companyId, ...(ignoredId ? { id: { not: ignoredId } } : {}) },
    select: { name: true },
  });
  if (policies.some((policy) => policy.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new Error("BREAK_POLICY_NAME_ALREADY_EXISTS");
  }
}

function policyJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class BreakPolicyController {
  list = async (request: Request, response: Response) => {
    const { companyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId))) return response.status(403).json({ error: "Access denied" });
    const policies = await prisma.breakPolicy.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { isDefault: "desc" }, { name: "asc" }],
      include: { _count: { select: { assignments: true } } },
    });
    return response.json(policies);
  };

  create = async (request: Request, response: Response) => {
    const { companyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId, true))) return response.status(403).json({ error: "Administrator access required" });
    try {
      const name = String(request.body?.name || "").trim();
      if (!name || name.length > 120) return response.status(400).json({ error: "INVALID_BREAK_POLICY_NAME" });
      await ensureUniqueName(companyId, name);
      const rules = normalizeBreakPolicyRules(request.body?.rules);
      const weekdays = normalizeBreakPolicyWeekdays(request.body?.weekdays);
      const isDefault = request.body?.isDefault === true;
      const requesterId = (request as any).userId as string;

      const policy = await prisma.$transaction(async (tx) => {
        if (isDefault) await tx.breakPolicy.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
        const created = await tx.breakPolicy.create({
          data: { companyId, name, rules: rules as any, weekdays: weekdays as any, isDefault, createdById: requesterId, updatedById: requesterId },
        });
        await tx.breakPolicyAudit.create({
          data: { companyId, policyId: created.id, action: "created", snapshot: policyJson(created), changedById: requesterId },
        });
        return created;
      });
      return response.status(201).json(policy);
    } catch (error) {
      if (error instanceof Error && error.message === "BREAK_POLICY_NAME_ALREADY_EXISTS") return response.status(409).json({ error: error.message });
      return sendError(response, error);
    }
  };

  update = async (request: Request, response: Response) => {
    const { companyId, policyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId, true))) return response.status(403).json({ error: "Administrator access required" });
    try {
      const current = await prisma.breakPolicy.findFirst({ where: { id: policyId, companyId } });
      if (!current) return response.status(404).json({ error: "Break policy not found" });
      if (!current.isActive) return response.status(409).json({ error: "Archived policies cannot be edited" });
      const name = String(request.body?.name ?? current.name).trim();
      if (!name || name.length > 120) return response.status(400).json({ error: "INVALID_BREAK_POLICY_NAME" });
      await ensureUniqueName(companyId, name, policyId);
      const rules = normalizeBreakPolicyRules(request.body?.rules ?? current.rules);
      const weekdays = normalizeBreakPolicyWeekdays(request.body?.weekdays ?? current.weekdays);
      const effectiveFrom = toEffectiveDate(request.body?.effectiveFrom);
      const requesterId = (request as any).userId as string;
      const linkedAssignments = await prisma.userBreakPolicyAssignment.findMany({
        where: { policyId, companyId },
        select: { id: true, mode: true, history: true },
      });
      const nextPolicy = { id: policyId, name, rules, weekdays };

      const updated = await prisma.$transaction(async (tx) => {
        const policy = await tx.breakPolicy.update({
          where: { id: policyId },
          data: { name, rules: rules as any, weekdays: weekdays as any, updatedById: requesterId },
        });
        for (const assignment of linkedAssignments) {
          const mode = assignment.mode === "company" ? "company" : "specific";
          const snapshot = buildPolicySnapshot(nextPolicy, mode, effectiveFrom);
          await tx.userBreakPolicyAssignment.update({
            where: { id: assignment.id },
            data: { history: appendBreakPolicyHistory(assignment.history, snapshot) as any, updatedById: requesterId },
          });
        }
        await tx.breakPolicyAudit.create({
          data: { companyId, policyId, action: "updated", snapshot: policyJson({ before: current, after: policy, effectiveFrom }), changedById: requesterId },
        });
        return policy;
      }, BULK_TRANSACTION_OPTIONS);
      return response.json(updated);
    } catch (error) {
      if (error instanceof Error && error.message === "BREAK_POLICY_NAME_ALREADY_EXISTS") return response.status(409).json({ error: error.message });
      return sendError(response, error);
    }
  };

  setDefault = async (request: Request, response: Response) => {
    const { companyId, policyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId, true))) return response.status(403).json({ error: "Administrator access required" });
    try {
      const policy = await prisma.breakPolicy.findFirst({ where: { id: policyId, companyId, isActive: true } });
      if (!policy) return response.status(404).json({ error: "Active break policy not found" });
      const requesterId = (request as any).userId as string;
      if (request.body?.isDefault === false) {
        if (request.body?.confirmation !== "REMOVE_COMPANY_DEFAULT") {
          return response.status(400).json({ error: "Explicit confirmation is required" });
        }
        const result = await prisma.$transaction(async (tx) => {
          const updated = await tx.breakPolicy.updateMany({
            where: { id: policyId, companyId, isDefault: true },
            data: { isDefault: false, updatedById: requesterId },
          });
          if (updated.count > 0) {
            await tx.breakPolicyAudit.create({
              data: {
                companyId,
                policyId,
                action: "removed_default",
                snapshot: policyJson({ policy, preservedAssignments: true }),
                changedById: requesterId,
              },
            });
          }
          return updated.count;
        });
        return response.json({ success: true, changed: result > 0, affectedUsers: 0 });
      }
      const applyToExisting = request.body?.applyToExisting === true;
      if (applyToExisting && request.body?.confirmation !== "APPLY_TO_EXISTING_EMPLOYEES") {
        return response.status(400).json({ error: "Explicit confirmation is required" });
      }
      const effectiveFrom = toEffectiveDate(request.body?.effectiveFrom);
      const employees = applyToExisting ? await prisma.user.findMany({
        where: companyUserWhere(companyId),
        select: {
          id: true,
          date_creation: true,
          defaultBreakMinutes: true,
          breakPolicyAssignments: { where: { companyId }, take: 1, select: { history: true } },
        },
      }) : [];

      await prisma.$transaction(async (tx) => {
        await tx.breakPolicy.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
        await tx.breakPolicy.update({ where: { id: policyId }, data: { isDefault: true, updatedById: requesterId } });
        for (const employee of employees) {
          const snapshot = buildPolicySnapshot(policy, "company", effectiveFrom);
          const existingHistory = employee.breakPolicyAssignments[0]?.history;
          const baseline = Array.isArray(existingHistory) && existingHistory.length > 0
            ? existingHistory
            : [buildLegacySnapshot(employee.defaultBreakMinutes, userHistoryStart(employee.date_creation))];
          const history = appendBreakPolicyHistory(baseline, snapshot);
          await tx.userBreakPolicyAssignment.upsert({
            where: { userId_companyId: { userId: employee.id, companyId } },
            create: { userId: employee.id, companyId, policyId, mode: "company", history: history as any, updatedById: requesterId },
            update: { policyId, mode: "company", history: history as any, updatedById: requesterId },
          });
        }
        await tx.breakPolicyAudit.create({
          data: {
            companyId,
            policyId,
            action: applyToExisting ? "set_default_and_applied" : "set_default",
            snapshot: policyJson({ policy, effectiveFrom, affectedUsers: employees.length }),
            changedById: requesterId,
          },
        });
      }, BULK_TRANSACTION_OPTIONS);
      return response.json({ success: true, affectedUsers: employees.length });
    } catch (error) {
      return sendError(response, error);
    }
  };

  setActive = async (request: Request, response: Response) => {
    const { companyId, policyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId, true))) return response.status(403).json({ error: "Administrator access required" });
    const isActive = request.body?.isActive === true;
    const policy = await prisma.breakPolicy.findFirst({ where: { id: policyId, companyId } });
    if (!policy) return response.status(404).json({ error: "Break policy not found" });
    if (!isActive && policy.isDefault) return response.status(409).json({ error: "Choose another default policy before archiving this one" });
    const requesterId = (request as any).userId as string;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.breakPolicy.update({ where: { id: policyId }, data: { isActive, updatedById: requesterId } });
      await tx.breakPolicyAudit.create({
        data: { companyId, policyId, action: isActive ? "restored" : "archived", snapshot: policyJson(result), changedById: requesterId },
      });
      return result;
    });
    return response.json(updated);
  };

  assign = async (request: Request, response: Response) => {
    const { companyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId, true))) return response.status(403).json({ error: "Administrator access required" });
    try {
      const userIds = [...new Set(Array.isArray(request.body?.userIds) ? request.body.userIds.map(String) : [])] as string[];
      if (userIds.length === 0 || userIds.length > 500) return response.status(400).json({ error: "INVALID_USER_SELECTION" });
      const mode = String(request.body?.mode || "") as BreakPolicyMode;
      if (!["legacy", "company", "specific"].includes(mode)) throw new Error("INVALID_BREAK_POLICY_MODE");
      const effectiveFrom = toEffectiveDate(request.body?.effectiveFrom);
      const requestedLegacyMinutes = request.body?.legacyDefaultBreakMinutes;
      const normalizedLegacyMinutes = requestedLegacyMinutes === undefined
        ? null
        : Math.max(0, Math.min(720, Math.round(Number(requestedLegacyMinutes) || 0)));
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, ...companyUserWhere(companyId) },
        select: {
          id: true,
          date_creation: true,
          defaultBreakMinutes: true,
          breakPolicyAssignments: { where: { companyId }, take: 1, select: { history: true, policyId: true, mode: true } },
        },
      });
      if (users.length !== userIds.length) return response.status(400).json({ error: "One or more users do not belong to this company" });

      let policy: any = null;
      if (mode === "company") policy = await prisma.breakPolicy.findFirst({ where: { companyId, isDefault: true, isActive: true } });
      if (mode === "specific") {
        const requestedPolicyId = String(request.body?.policyId || "");
        policy = await prisma.breakPolicy.findFirst({ where: { id: requestedPolicyId, companyId, isActive: true } });
        if (!policy) {
          const unchangedArchivedAssignment = users.every((user) => {
            const assignment = user.breakPolicyAssignments[0];
            return assignment?.mode === "specific" && assignment.policyId === requestedPolicyId;
          });
          if (unchangedArchivedAssignment) return response.json({ success: true, affectedUsers: 0 });
        }
      }
      if (mode !== "legacy" && !policy) return response.status(400).json({ error: "Active break policy not found" });

      const requesterId = (request as any).userId as string;
      await prisma.$transaction(async (tx) => {
        for (const user of users) {
          const snapshot = mode === "legacy"
            ? buildLegacySnapshot(normalizedLegacyMinutes ?? user.defaultBreakMinutes, effectiveFrom)
            : buildPolicySnapshot(policy, mode, effectiveFrom);
          const existingHistory = user.breakPolicyAssignments[0]?.history;
          const baseline = Array.isArray(existingHistory) && existingHistory.length > 0
            ? existingHistory
            : [buildLegacySnapshot(user.defaultBreakMinutes, userHistoryStart(user.date_creation))];
          const history = appendBreakPolicyHistory(baseline, snapshot);
          await tx.userBreakPolicyAssignment.upsert({
            where: { userId_companyId: { userId: user.id, companyId } },
            create: { userId: user.id, companyId, policyId: policy?.id || null, mode, history: history as any, updatedById: requesterId },
            update: { policyId: policy?.id || null, mode, history: history as any, updatedById: requesterId },
          });
          if (mode === "legacy" && normalizedLegacyMinutes !== null) {
            await tx.user.update({
              where: { id: user.id },
              data: { defaultBreakMinutes: normalizedLegacyMinutes },
            });
          }
        }
        await tx.breakPolicyAudit.create({
          data: {
            companyId,
            policyId: policy?.id || null,
            action: "assigned",
            snapshot: policyJson({ mode, policyId: policy?.id || null, effectiveFrom, userIds }),
            changedById: requesterId,
          },
        });
      }, BULK_TRANSACTION_OPTIONS);
      return response.json({ success: true, affectedUsers: users.length });
    } catch (error) {
      return sendError(response, error);
    }
  };

  audits = async (request: Request, response: Response) => {
    const { companyId } = request.params;
    if (!(await hasCompanyAccess(request, companyId, true))) return response.status(403).json({ error: "Administrator access required" });
    const audits = await prisma.breakPolicyAudit.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 100 });
    return response.json(audits);
  };
}
