import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { sendEmail } from "../utils/sendEmail";
import { SocketService } from './SocketService';
import { resolveEffectivePermissions } from "../utils/planPermissions";
import {
  createInviteToken, hashInviteToken, inviteWebUrl, issueExternalSession,
  normalizeExternalEmail, SubcontractorAccessError, validateExternalPassword,
} from "../utils/subcontractorIdentity";

const fail = (status: number, code: string): never => { throw new SubcontractorAccessError(status, code); };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const accountSelect = { id: true, email: true, name: true, isDisabled: true, sessionVersion: true, participant: { select: { id: true } } } as const;

export class SubcontractorAccessService {
  async authorizeManager(userId: string | undefined, subcontractorId: string) {
    if (!userId) return fail(401, "UNAUTHORIZED");
    const subcontractor = await prisma.subcontractor.findUnique({
      where: { id: subcontractorId },
      select: { id: true, name: true, company_id: true, company: { select: {
        id: true, name: true, isActive: true,
        Plan: { select: { permissionGroup: { select: { GroupPermissionsList: { select: { Permissions: { select: { description: true } } } } } } } },
      } } },
    });
    if (!subcontractor?.company?.isActive) return fail(404, "SUBCONTRACTOR_UNAVAILABLE");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isDisabled: true, company_id: true, office: { include: { userPermissions: { include: { permission: true } } } },
        companies: { where: { companyId: subcontractor.company.id }, select: { office: { include: { userPermissions: { include: { permission: true } } } } } } },
    });
    if (!user || user.isDisabled) return fail(403, "ACCESS_DENIED");
    const membership = user.companies[0];
    // The explicit company membership is authoritative, as in company login.
    // Legacy company creation reused Office rows across companies, so the
    // Office's company_id is not a reliable membership/authorization boundary.
    // Never fall back to a global role when a company membership exists.
    const office = membership ? membership.office : (user.company_id === subcontractor.company.id ? user.office : null);
    if (!office) return fail(403, "ACCESS_DENIED");
    const role = office.name.trim().toLowerCase();
    const explicit = office.userPermissions.map((entry) => entry.permission.description);
    const plan = subcontractor.company.Plan?.permissionGroup?.GroupPermissionsList.map((entry) => entry.Permissions.description) || [];
    const permissions = explicit.length ? resolveEffectivePermissions(plan, explicit, office.name) : [];
    if (!["owner", "administrator"].includes(role) && !(permissions.includes("Subcontractors") && permissions.includes("User Management"))) {
      return fail(403, "ACCESS_DENIED");
    }
    return subcontractor;
  }

  async list(userId: string | undefined, subcontractorId: string) {
    await this.authorizeManager(userId, subcontractorId);
    const [accesses, invites] = await Promise.all([
      prisma.subcontractorAccess.findMany({ where: { subcontractorId }, orderBy: { createdAt: "desc" }, select: {
        id: true, status: true, createdAt: true, revokedAt: true,
        account: { select: { id: true, email: true, name: true, isDisabled: true } },
      } }),
      prisma.subcontractorInvite.findMany({ where: { subcontractorId }, orderBy: { createdAt: "desc" }, select: {
        id: true, email: true, name: true, status: true, deliveryStatus: true, expiresAt: true, createdAt: true,
      } }),
    ]);
    return { accesses, invites: invites.map((invite) => ({ ...invite,
      status: invite.status === "pending" && invite.expiresAt <= new Date() ? "expired" : invite.status,
    })) };
  }

  async invite(userId: string | undefined, subcontractorId: string, input: { email?: unknown; name?: unknown }) {
    const subcontractor = await this.authorizeManager(userId, subcontractorId);
    const email = normalizeExternalEmail(input.email);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 191) return fail(400, "INVALID_NAME");
    const { token, tokenHash } = createInviteToken();
    const url = inviteWebUrl(token);
    if (!process.env.SENDGRID_KEY) return fail(503, "INVITE_DELIVERY_NOT_CONFIGURED");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 86400000);
    const invitation = await prisma.$transaction(async (tx) => {
      const active = await tx.subcontractorAccess.findFirst({ where: { subcontractorId, status: "active", account: { email } }, select: { id: true } });
      if (active) return fail(409, "ACCESS_ALREADY_ACTIVE");
      const existing = await tx.subcontractorInvite.findUnique({ where: { subcontractorId_email: { subcontractorId, email } } });
      if (existing && existing.status === "pending" && existing.deliveryStatus !== "failed" && now.getTime() - existing.updatedAt.getTime() < 60000) {
        return fail(429, "INVITE_RECENTLY_SENT");
      }
      const data = { name, tokenHash, invitedById: userId!, expiresAt, status: "pending", deliveryStatus: "pending", acceptedAt: null };
      if (existing) {
        const updated = await tx.subcontractorInvite.updateMany({ where: { id: existing.id, tokenHash: existing.tokenHash, updatedAt: existing.updatedAt }, data });
        if (updated.count !== 1) return fail(409, "INVITE_CHANGED");
        return { id: existing.id };
      }
      return tx.subcontractorInvite.create({ data: { ...data, subcontractorId, email }, select: { id: true } });
    });
    try {
      await sendEmail({ to: email, companyId: subcontractor.company!.id, throwOnError: true,
        subject: `${subcontractor.company!.name} invited you to SmartBuild`,
        html: `<p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(subcontractor.company!.name)} invited you to access SmartBuild as a representative of ${escapeHtml(subcontractor.name)}.</p><p><a href="${escapeHtml(url)}">Accept invitation</a></p><p>This invitation expires in 7 days. If you did not expect it, you can ignore it.</p>`,
        text: `Hello ${name}. ${subcontractor.company!.name} invited you to represent ${subcontractor.name} on SmartBuild. Accept within 7 days: ${url}`,
      });
    } catch {
      await prisma.subcontractorInvite.updateMany({ where: { id: invitation.id, tokenHash, status: "pending" }, data: { deliveryStatus: "failed" } });
      return fail(502, "INVITE_DELIVERY_FAILED");
    }
    await prisma.subcontractorInvite.updateMany({ where: { id: invitation.id, tokenHash }, data: { deliveryStatus: "sent" } });
    return { id: invitation.id, expiresAt, deliveryStatus: "sent" };
  }

  async revokeInvite(userId: string | undefined, subcontractorId: string, inviteId: string) {
    await this.authorizeManager(userId, subcontractorId);
    const result = await prisma.subcontractorInvite.updateMany({ where: { id: inviteId, subcontractorId, status: "pending" }, data: { status: "revoked" } });
    if (!result.count) return fail(404, "INVITE_UNAVAILABLE");
  }

  async revokeAccess(userId: string | undefined, subcontractorId: string, accessId: string) {
    await this.authorizeManager(userId, subcontractorId);
    await prisma.$transaction(async (tx) => {
      const access = await tx.subcontractorAccess.findFirst({ where: { id: accessId, subcontractorId }, include: { account: { select: { email: true } } } });
      if (!access) return fail(404, "ACCESS_UNAVAILABLE");
      await tx.subcontractorAccess.update({ where: { id: access.id }, data: {
        status: "revoked", version: { increment: 1 }, revokedById: userId!, revokedAt: new Date(),
        expoPushToken: null, pushTokenExpiresAt: null, pushTokenLeaseId: null,
      } });
      await tx.subcontractorInvite.updateMany({ where: { subcontractorId, email: access.account.email, status: "pending" }, data: { status: "revoked" } });
    });
    SocketService.disconnectExternalAccess(accessId);
  }

  async inspectInvite(token: unknown) {
    const invite = await prisma.subcontractorInvite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: {
      subcontractor: { select: { name: true, company: { select: { name: true, isActive: true } } } },
    } });
    if (!invite || invite.status !== "pending" || invite.expiresAt <= new Date() || !invite.subcontractor.company?.isActive) return fail(410, "INVITE_UNAVAILABLE");
    return invite;
  }

  async previewInvite(token: unknown) {
    const invite = await this.inspectInvite(token);
    const account = await prisma.subcontractorAccount.findUnique({ where: { email: invite.email }, select: { id: true } });
    return { email: invite.email, name: invite.name, companyName: invite.subcontractor.company!.name,
      subcontractorName: invite.subcontractor.name, expiresAt: invite.expiresAt, hasAccount: Boolean(account) };
  }

  async accept(token: unknown, passwordInput: unknown) {
    const invite = await this.inspectInvite(token);
    const existing = await prisma.subcontractorAccount.findUnique({ where: { email: invite.email } });
    const password = validateExternalPassword(passwordInput, !existing);
    if (existing && (existing.isDisabled || !(await bcrypt.compare(password, existing.passwordHash)))) return fail(401, "INVALID_CREDENTIALS");
    const passwordHash = existing ? null : await bcrypt.hash(password, 12);
    return prisma.$transaction(async (tx) => {
      // Compare-and-swap consumes the capability exactly once, including concurrent accepts/revocations/resends.
      const consumed = await tx.subcontractorInvite.updateMany({ where: {
        id: invite.id, tokenHash: invite.tokenHash, status: "pending", expiresAt: { gt: new Date() },
        subcontractor: { company: { isActive: true } },
      }, data: { status: "accepted", acceptedAt: new Date() } });
      if (consumed.count !== 1) return fail(410, "INVITE_UNAVAILABLE");
      const account = existing
        ? await tx.subcontractorAccount.findUnique({ where: { id: existing.id } })
        : await tx.subcontractorAccount.create({ data: { email: invite.email, name: invite.name, passwordHash: passwordHash! } });
      if (!account || account.isDisabled || (existing && account.sessionVersion !== existing.sessionVersion)) return fail(403, "ACCESS_DENIED");
      await tx.participant.upsert({ where: { subcontractorAccountId: account.id },
        create: { type: "subcontractor", subcontractorAccountId: account.id }, update: {},
      });
      await tx.subcontractorAccess.upsert({ where: { accountId_subcontractorId: { accountId: account.id, subcontractorId: invite.subcontractorId } },
        create: { accountId: account.id, subcontractorId: invite.subcontractorId, grantedById: invite.invitedById },
        update: { status: "active", version: { increment: 1 }, revokedAt: null, revokedById: null, grantedById: invite.invitedById },
      });
      return { accepted: true, companyName: invite.subcontractor.company!.name, subcontractorName: invite.subcontractor.name };
    });
  }

  async contexts(accountId: string) {
    return prisma.subcontractorAccess.findMany({ where: { accountId, status: "active", subcontractor: { company: { isActive: true } } },
      select: { id: true, version: true, subcontractor: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } },
    });
  }

  async login(emailInput: unknown, passwordInput: unknown) {
    const email = normalizeExternalEmail(emailInput);
    const password = validateExternalPassword(passwordInput, false);
    const account = await prisma.subcontractorAccount.findUnique({ where: { email }, select: { ...accountSelect, passwordHash: true } });
    // Always run bcrypt to avoid an account-existence timing shortcut.
    const valid = await bcrypt.compare(password, account?.passwordHash || "$2b$12$C6UzMDM.H6dfI/f/IKcEe.6lr9QaNMFfNsYx8VJRcHj6Jt7F5QvTa");
    if (!account || !valid || account.isDisabled) return fail(401, "INVALID_CREDENTIALS");
    const contexts = await this.contexts(account.id);
    if (!contexts.length) return fail(403, "NO_ACTIVE_ACCESS");
    return { token: issueExternalSession(account), account: { id: account.id, name: account.name, email: account.email, participantId: account.participant?.id }, contexts };
  }
}

export function externalServiceError(error: unknown) {
  if (error instanceof SubcontractorAccessError) return { status: error.status, code: error.code };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return { status: 409, code: "ACCESS_CHANGED_RETRY" };
  return { status: 500, code: "SUBCONTRACTOR_ACCESS_FAILED" };
}
