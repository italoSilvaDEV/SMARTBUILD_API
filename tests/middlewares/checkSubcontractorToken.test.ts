import Jwt from "jsonwebtoken";
import { checkSubcontractorToken } from "../../src/middlewares/checkSubcontractorToken";
import { issueExternalSession } from "../../src/utils/subcontractorIdentity";
jest.mock("../../src/utils/prisma", () => ({ prisma: {
  subcontractorAccount: { findUnique: jest.fn() }, subcontractorAccess: { findFirst: jest.fn() },
} }));
const { prisma } = require("../../src/utils/prisma");
beforeEach(() => {
  jest.resetAllMocks(); process.env.SECRET_JWT = "test-only-secret";
  prisma.subcontractorAccount.findUnique.mockResolvedValue({ isDisabled: false, sessionVersion: 1 });
  prisma.subcontractorAccess.findFirst.mockResolvedValue({ id: "access-a" });
});
async function run(token: string) {
  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn(); await checkSubcontractorToken(req, res, next); return { req, res, next };
}
it("accepts a scoped external session without establishing an employee identity", async () => {
  const { req, next } = await run(issueExternalSession({ id: "external", sessionVersion: 1 }, { id: "access-a", version: 2 }));
  expect(next).toHaveBeenCalled(); expect(req.userId).toBeUndefined(); expect(req.externalSession.sub).toBe("external");
  expect(prisma.subcontractorAccess.findFirst.mock.calls[0][0].where).toMatchObject({ accountId: "external", id: "access-a", version: 2, status: "active" });
});
it("rejects an employee JWT even when its ID matches an external account", async () => {
  const { res, next } = await run(Jwt.sign({ id: "external" }, process.env.SECRET_JWT!, { expiresIn: "1h" }));
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(401);
  expect(prisma.subcontractorAccount.findUnique).not.toHaveBeenCalled();
});
it("rejects a revoked or superseded context immediately", async () => {
  prisma.subcontractorAccess.findFirst.mockResolvedValue(null);
  const { res, next } = await run(issueExternalSession({ id: "external", sessionVersion: 1 }, { id: "access-a", version: 1 }));
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(403);
});
it("rejects disabled accounts", async () => {
  prisma.subcontractorAccount.findUnique.mockResolvedValue({ isDisabled: true, sessionVersion: 1 });
  const { res } = await run(issueExternalSession({ id: "external", sessionVersion: 1 }));
  expect(res.status).toHaveBeenCalledWith(401);
});
it("rejects globally invalidated account sessions", async () => {
  prisma.subcontractorAccount.findUnique.mockResolvedValue({ isDisabled: false, sessionVersion: 2 });
  const { res } = await run(issueExternalSession({ id: "external", sessionVersion: 1 }));
  expect(res.status).toHaveBeenCalledWith(401);
});
it("fails closed if the database cannot validate access", async () => {
  prisma.subcontractorAccount.findUnique.mockRejectedValue(new Error("database unavailable"));
  const { res, next } = await run(issueExternalSession({ id: "external", sessionVersion: 1 }));
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(503);
});
