import express from "express";
import { subcontractorAccessRoutes } from "../../src/routes/subcontractorAccessRoutes";
jest.mock("../../src/middlewares/checkToken", () => ({ checkToken: jest.fn((_req, res) => res.status(401).json({ error: "EMPLOYEE_AUTH_REQUIRED" })) }));
jest.mock("../../src/middlewares/checkSubcontractorToken", () => ({ checkSubcontractorToken: jest.fn((_req, res) => res.status(401).json({ error: "EXTERNAL_AUTH_REQUIRED" })) }));
jest.mock("../../src/utils/prisma", () => ({ prisma: {} }));
jest.mock("../../src/services/SubcontractorAccessService", () => ({
  SubcontractorAccessService: jest.fn().mockImplementation(() => ({ previewInvite: jest.fn().mockResolvedValue({ hasAccount: false }), accept: jest.fn().mockResolvedValue({ accepted: true }) })),
  externalServiceError: jest.fn(() => ({ status: 500, code: "TEST_FAILURE" })),
}));
const request = require("supertest");
const app = express(); app.use(express.json()); app.use(subcontractorAccessRoutes);
beforeEach(() => { delete process.env.SUBCONTRACTOR_ACCESS_ENABLED; });
it("defaults to disabled without entering any employee or external authentication flow", async () => {
  const response = await request(app).get("/subcontractors/legacy-id/app-access");
  expect(response.status).toBe(503);
  expect(response.body.error).toBe("SUBCONTRACTOR_ACCESS_DISABLED");
  expect(response.headers["cache-control"]).toBe("no-store");
});
it("requires employee authentication for management", async () => {
  process.env.SUBCONTRACTOR_ACCESS_ENABLED = "true";
  const response = await request(app).post("/subcontractors/legacy-id/app-access/invites").send({});
  expect(response.status).toBe(401); expect(response.body.error).toBe("EMPLOYEE_AUTH_REQUIRED");
});
it("allows public invitation preview without an employee session", async () => {
  process.env.SUBCONTRACTOR_ACCESS_ENABLED = "true";
  const response = await request(app).post("/subcontractor-auth/invites/preview").send({ token: "a".repeat(64) });
  expect(response.status).toBe(200); expect(response.body.hasAccount).toBe(false);
});
it("requires external authentication for context selection", async () => {
  process.env.SUBCONTRACTOR_ACCESS_ENABLED = "true";
  const response = await request(app).post("/subcontractor-auth/context").send({ accessId: "access" });
  expect(response.status).toBe(401); expect(response.body.error).toBe("EXTERNAL_AUTH_REQUIRED");
});
it("bounds public credential attempts", async () => {
  process.env.SUBCONTRACTOR_ACCESS_ENABLED = "true";
  // Same source shares a budget across public auth endpoints.
  let response: any;
  for (let attempt = 0; attempt < 31; attempt++) response = await request(app).post("/subcontractor-auth/invites/preview").send({ token: "a".repeat(64) });
  expect(response.status).toBe(429); expect(response.headers["retry-after"]).toBe("900");
});
