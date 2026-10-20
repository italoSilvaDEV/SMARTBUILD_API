import fs from "fs";
import path from "path";
import Jwt from "jsonwebtoken";
import { createInviteToken, externalAccessEnabled, hashInviteToken, inviteWebUrl, issueExternalSession, normalizeExternalEmail, verifyExternalSession } from "../../src/utils/subcontractorIdentity";
beforeEach(() => { process.env.SECRET_JWT = "test-secret"; delete process.env.SUBCONTRACTOR_ACCESS_ENABLED; });
it("uses random high-entropy tokens and deterministic non-reversible storage hashes", () => {
  const first = createInviteToken(); const second = createInviteToken();
  expect(first.token).toMatch(/^[a-f0-9]{64}$/); expect(first.token).not.toBe(second.token);
  expect(first.tokenHash).toBe(hashInviteToken(first.token)); expect(first.tokenHash).not.toBe(first.token);
  expect(() => hashInviteToken("bad")).toThrow("INVITE_UNAVAILABLE");
});
it("defaults the feature to off", () => { expect(externalAccessEnabled()).toBe(false); });
it("normalizes external login addresses without touching business emails", () => {
  expect(normalizeExternalEmail(" Carlos@Example.test ")).toBe("carlos@example.test");
  expect(() => normalizeExternalEmail({ email: "a@example.test" })).toThrow("INVALID_EMAIL");
});
it("requires a configured secure web origin and puts capabilities in the fragment", () => {
  process.env.SUBCONTRACTOR_WEB_URL = "http://external.example.test";
  expect(() => inviteWebUrl("token")).toThrow("INVITE_DELIVERY_NOT_CONFIGURED");
  process.env.SUBCONTRACTOR_WEB_URL = "https://web.example.test/ignored";
  expect(inviteWebUrl("token")).toBe("https://web.example.test/subcontractor-invite#token=token");
});
it("binds external JWTs to their own type, audience, issuer and context version", () => {
  const token = issueExternalSession({ id: "account", sessionVersion: 2 }, { id: "access", version: 3 });
  expect(verifyExternalSession(token)).toMatchObject({ type: "subcontractor_session", sub: "account", sessionVersion: 2, accessId: "access", accessVersion: 3 });
  const wrongAudience = Jwt.sign({ type: "subcontractor_session", sub: "account", sessionVersion: 2 }, process.env.SECRET_JWT!, { audience: "employee", issuer: "smartbuild" });
  expect(() => verifyExternalSession(wrongAudience)).toThrow();
});
it("keeps the SQL migration additive and constrained to new tables", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261019120000_add_subcontractor_app_access/migration.sql"), "utf8");
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  expect(withoutComments).not.toMatch(/\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE|RENAME)\s+(TABLE|FROM|INTO|`)/i);
  const tables = [...withoutComments.matchAll(/ALTER TABLE `([^`]+)`/g)].map((match) => match[1]);
  expect(tables.every((table) => ["participants", "subcontractor_accesses", "subcontractor_invites"].includes(table))).toBe(true);
  expect(withoutComments.match(/CREATE TABLE/g)).toHaveLength(4);
  expect(withoutComments).not.toContain("participants_identity_check");
  expect(withoutComments).toContain("subcontractor_access_status_check");
});

it('keeps collaboration migration additive without changing User or legacy author columns',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../prisma/migrations/20261020150000_add_subcontractor_collaboration/migration.sql'),'utf8').replace(/--[^\n]*/g,'');
 expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE|RENAME)\s+(TABLE|FROM|INTO|`)/i);
 expect(sql).not.toMatch(/ALTER TABLE `(User|chat_messages|chat_members)`|MODIFY COLUMN|CHANGE COLUMN|CHECK\s*\(/i);
 expect(sql.match(/CREATE TABLE/g)).toHaveLength(4);
 expect(sql).toContain('ADD COLUMN `externalAuthorId` VARCHAR(191) NULL');
 expect(sql).toContain('ADD COLUMN `externalAccessId` VARCHAR(191) NULL');
});
