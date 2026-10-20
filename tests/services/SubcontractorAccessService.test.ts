import bcrypt from "bcrypt";
import { SubcontractorAccessService } from "../../src/services/SubcontractorAccessService";
import { hashInviteToken, verifyExternalSession } from "../../src/utils/subcontractorIdentity";

jest.mock("../../src/utils/prisma", () => {
  const model = () => ({ findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() });
  const db: any = { user: model(), subcontractor: model(), subcontractorAccount: model(), subcontractorAccess: model(), subcontractorInvite: model(), participant: model() };
  db.$transaction = jest.fn((action) => action(db));
  return { prisma: db };
});
jest.mock("../../src/utils/sendEmail", () => ({ sendEmail: jest.fn() }));
jest.mock("bcrypt", () => ({ __esModule: true, default: { compare: jest.fn(), hash: jest.fn() } }));
const { prisma: db } = require("../../src/utils/prisma");
const { sendEmail } = require("../../src/utils/sendEmail");
const service = new SubcontractorAccessService();
const token = "a".repeat(64);
const makeInvite = () => ({ id: "invite", subcontractorId: "legacy-sub-id", name: "Carlos", email: "carlos@example.test", tokenHash: hashInviteToken(token),
  status: "pending", expiresAt: new Date(Date.now() + 86400000), invitedById: "manager", updatedAt: new Date(0),
  subcontractor: { name: "ABC Painting", company: { name: "Company A", isActive: true } } });
const makeOffice = (name = "Owner", descriptions: string[] = [], company_id: string | null = "company-a") =>
  ({ name, company_id, userPermissions: descriptions.map((description) => ({ permission: { description } })) });
function manager(office = makeOffice()) {
  db.subcontractor.findUnique.mockResolvedValue({ id: "legacy-sub-id", name: "ABC Painting", company_id: "company-a", company: {
    id: "company-a", name: "Company A", isActive: true, Plan: { permissionGroup: { GroupPermissionsList: ["Subcontractors", "User Management"].map((description) => ({ Permissions: { description } })) } },
  } });
  db.user.findUnique.mockResolvedValue({ isDisabled: false, company_id: null, office: makeOffice("Worker", [], "other"), companies: [{ office }] });
}
beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation((action: any) => action(db));
  db.subcontractorInvite.updateMany.mockResolvedValue({ count: 1 });
  db.participant.upsert.mockResolvedValue({ id: "participant" });
  db.subcontractorAccess.upsert.mockResolvedValue({ id: "access" });
  db.subcontractorAccess.update.mockResolvedValue({});
  process.env.SUBCONTRACTOR_WEB_URL = "https://web.example.test";
  process.env.SENDGRID_KEY = "test-only-not-a-real-key";
  process.env.SECRET_JWT = "test-only-secret";
  (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
});

describe("company authorization", () => {
  it("uses the selected company's office instead of the global legacy office", async () => {
    manager();
    await expect(service.authorizeManager("manager", "legacy-sub-id")).resolves.toMatchObject({ id: "legacy-sub-id" });
  });
  it("rejects an administrator who does not belong to the subcontractor's company", async () => {
    manager();
    db.user.findUnique.mockResolvedValue({ isDisabled: false, company_id: "other", office: makeOffice("Owner", [], "other"), companies: [] });
    await expect(service.list("intruder", "legacy-sub-id")).rejects.toMatchObject({ status: 403 });
    expect(db.subcontractorInvite.findMany).not.toHaveBeenCalled();
  });
  it("does not inherit the plan's permissions for an empty external-access management role", async () => {
    manager(makeOffice("Worker"));
    await expect(service.authorizeManager("worker", "legacy-sub-id")).rejects.toMatchObject({ status: 403 });
  });
  it("requires both explicit management permissions and the plan entitlement", async () => {
    manager(makeOffice("Coordinator", ["Subcontractors", "User Management"]));
    await expect(service.authorizeManager("manager", "legacy-sub-id")).resolves.toBeTruthy();
    manager(makeOffice("Coordinator", ["Subcontractors"]));
    await expect(service.authorizeManager("manager", "legacy-sub-id")).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a mismatched company office even if named Owner", async () => {
    manager(makeOffice("Owner", [], "other"));
    await expect(service.authorizeManager("manager", "legacy-sub-id")).rejects.toMatchObject({ status: 403 });
  });
});

describe("invitation and legacy preservation", () => {
  it("stores only a hash, sends a fragment link, and never creates a User or rewrites the subcontractor", async () => {
    manager();
    db.subcontractorInvite.create.mockResolvedValue({ id: "invite" });
    await service.invite("manager", "legacy-sub-id", { name: "Carlos <script>", email: " CARLOS@example.test " });
    const data = db.subcontractorInvite.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ subcontractorId: "legacy-sub-id", email: "carlos@example.test" });
    const mail = sendEmail.mock.calls[0][0];
    const rawToken = /#token=([a-f0-9]{64})/.exec(mail.text)![1];
    expect(data.tokenHash).toBe(hashInviteToken(rawToken));
    expect(JSON.stringify(data)).not.toContain(rawToken);
    expect(mail.html).toContain("&lt;script&gt;");
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.subcontractor.update).not.toHaveBeenCalled();
    expect(db.subcontractorAccount.create).not.toHaveBeenCalled();
  });
  it("reports delivery failures and preserves a retryable invitation", async () => {
    manager(); db.subcontractorInvite.create.mockResolvedValue({ id: "invite" });
    sendEmail.mockRejectedValue(new Error("provider failure"));
    await expect(service.invite("manager", "legacy-sub-id", { name: "Carlos", email: "carlos@example.test" })).rejects.toMatchObject({ code: "INVITE_DELIVERY_FAILED" });
    expect(db.subcontractorInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { deliveryStatus: "failed" } }));
  });
  it("does not create an invitation if delivery is unconfigured", async () => {
    manager(); delete process.env.SENDGRID_KEY;
    await expect(service.invite("manager", "legacy-sub-id", { name: "Carlos", email: "carlos@example.test" })).rejects.toMatchObject({ status: 503 });
    expect(db.subcontractorInvite.create).not.toHaveBeenCalled();
  });
  it("rotates an existing invitation rather than creating another subcontractor", async () => {
    manager(); db.subcontractorInvite.findUnique.mockResolvedValue(makeInvite());
    await service.invite("manager", "legacy-sub-id", { name: "Carlos", email: "carlos@example.test" });
    expect(db.subcontractorInvite.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "invite", tokenHash: hashInviteToken(token) }, data: { status: "pending" } });
    expect(db.subcontractorInvite.updateMany.mock.calls[0][0].data.tokenHash).not.toBe(hashInviteToken(token));
    expect(db.subcontractor.create).not.toHaveBeenCalled();
  });
  it("does not expose invite token hashes in management responses", async () => {
    manager(); db.subcontractorAccess.findMany.mockResolvedValue([]); db.subcontractorInvite.findMany.mockResolvedValue([]);
    await service.list("manager", "legacy-sub-id");
    expect(db.subcontractorInvite.findMany.mock.calls[0][0].select).not.toHaveProperty("tokenHash");
  });
});

describe("acceptance", () => {
  beforeEach(() => { db.subcontractorInvite.findUnique.mockResolvedValue(makeInvite()); });
  it.each(["accepted", "revoked"])("rejects an invitation already %s", async (status) => {
    db.subcontractorInvite.findUnique.mockResolvedValue({ ...makeInvite(), status });
    await expect(service.accept(token, "long-password-123")).rejects.toMatchObject({ status: 410 });
    expect(db.subcontractorAccount.create).not.toHaveBeenCalled();
  });
  it("rejects expiry and never creates credentials", async () => {
    db.subcontractorInvite.findUnique.mockResolvedValue({ ...makeInvite(), expiresAt: new Date(0) });
    await expect(service.accept(token, "long-password-123")).rejects.toMatchObject({ status: 410 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("creates an external account and participant while linking the original subcontractor ID", async () => {
    db.subcontractorAccount.create.mockResolvedValue({ id: "external", isDisabled: false, sessionVersion: 1 });
    await service.accept(token, "long-password-123");
    expect(db.subcontractorAccount.create).toHaveBeenCalledWith({ data: { name: "Carlos", email: "carlos@example.test", passwordHash: "hashed-password" } });
    expect(db.participant.upsert.mock.calls[0][0].create).toEqual({ type: "subcontractor", subcontractorAccountId: "external" });
    expect(db.subcontractorAccess.upsert.mock.calls[0][0].create).toMatchObject({ subcontractorId: "legacy-sub-id", accountId: "external" });
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.subcontractor.update).not.toHaveBeenCalled();
  });
  it("requires the existing external password and never replaces it", async () => {
    const account = { id: "existing", passwordHash: "original-hash", isDisabled: false, sessionVersion: 1 };
    db.subcontractorAccount.findUnique.mockResolvedValue(account);
    await service.accept(token, "existing-password");
    expect(bcrypt.compare).toHaveBeenCalledWith("existing-password", "original-hash");
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.subcontractorAccount.create).not.toHaveBeenCalled();
    expect(db.subcontractorAccount.update).not.toHaveBeenCalled();
  });
  it("does not consume the invitation for an incorrect existing password", async () => {
    db.subcontractorAccount.findUnique.mockResolvedValue({ id: "existing", passwordHash: "original", isDisabled: false });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.accept(token, "incorrect-password")).rejects.toMatchObject({ status: 401 });
    expect(db.subcontractorInvite.updateMany).not.toHaveBeenCalled();
  });
  it("stops if a concurrent accept, resend or revocation consumed the token", async () => {
    db.subcontractorInvite.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.accept(token, "long-password-123")).rejects.toMatchObject({ status: 410 });
    expect(db.subcontractorAccount.create).not.toHaveBeenCalled();
    expect(db.subcontractorAccess.upsert).not.toHaveBeenCalled();
  });
  it("rejects bcrypt-truncated multibyte passwords", async () => {
    await expect(service.accept(token, "🔒".repeat(20))).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("revocation", () => {
  it("revokes one scoped access, increments its session version and cancels outstanding invitations", async () => {
    manager(); db.subcontractorAccess.findFirst.mockResolvedValue({ id: "access-a", account: { email: "carlos@example.test" } });
    await service.revokeAccess("manager", "legacy-sub-id", "access-a");
    expect(db.subcontractorAccess.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "access-a", subcontractorId: "legacy-sub-id" } }));
    expect(db.subcontractorAccess.update.mock.calls[0][0]).toMatchObject({ where: { id: "access-a" }, data: { status: "revoked", version: { increment: 1 } } });
    expect(db.subcontractorInvite.updateMany.mock.calls[0][0]).toMatchObject({ where: { subcontractorId: "legacy-sub-id", email: "carlos@example.test", status: "pending" } });
    expect(db.subcontractorAccount.update).not.toHaveBeenCalled();
  });
});

describe("external account login", () => {
  it("returns only active company contexts with a separate account session", async () => {
    db.subcontractorAccount.findUnique.mockResolvedValue({ id: "external", name: "Carlos", email: "carlos@example.test", passwordHash: "external-hash", isDisabled: false, sessionVersion: 1, participant: { id: "participant" } });
    db.subcontractorAccess.findMany.mockResolvedValue([{ id: "access-a", version: 1, subcontractor: { id: "legacy-sub-id", name: "ABC", company: { id: "company-a", name: "A" } } }]);
    const result = await service.login(" Carlos@example.test ", "valid-password");
    expect(result.account).toEqual({ id: "external", name: "Carlos", email: "carlos@example.test", participantId: "participant" });
    expect(result.account).not.toHaveProperty("passwordHash");
    expect(verifyExternalSession(result.token)).toMatchObject({ type: "subcontractor_session", sub: "external" });
    expect(db.subcontractorAccess.findMany.mock.calls[0][0].where).toMatchObject({ accountId: "external", status: "active", subcontractor: { company: { isActive: true } } });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it("does not issue a session when all grants have been revoked", async () => {
    db.subcontractorAccount.findUnique.mockResolvedValue({ id: "external", passwordHash: "external-hash", isDisabled: false });
    db.subcontractorAccess.findMany.mockResolvedValue([]);
    await expect(service.login("carlos@example.test", "valid-password")).rejects.toMatchObject({ code: "NO_ACTIVE_ACCESS" });
  });
  it("uses the same credentials error for a missing account and an incorrect password", async () => {
    db.subcontractorAccount.findUnique.mockResolvedValue(null);
    await expect(service.login("missing@example.test", "valid-password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(bcrypt.compare).toHaveBeenCalled();
    db.subcontractorAccount.findUnique.mockResolvedValue({ id: "external", passwordHash: "external-hash", isDisabled: false });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login("carlos@example.test", "valid-password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});
