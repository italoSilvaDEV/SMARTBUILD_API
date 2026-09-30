import express from "express";
const request = require("supertest");
import { prisma } from "../utils/prisma";
import { userCanViewFinancials } from "../utils/financialAccess";
import { accountsPayableRoutes } from "./accountsPayableRoutes";

jest.mock("../middlewares/checkToken", () => ({
  checkToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).userId = "user-a";
    next();
  },
}));
jest.mock("../utils/financialAccess", () => ({ userCanViewFinancials: jest.fn() }));
jest.mock("../utils/prisma", () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    accountPayable: { findMany: jest.fn() },
  },
}));

const app = express();
app.use(express.json());
app.use("/company/:companyId/accounts-payable", accountsPayableRoutes);

beforeEach(() => jest.clearAllMocks());

describe("accounts payable routes", () => {
  it("denies users without financial access to the URL company", async () => {
    (userCanViewFinancials as jest.Mock).mockResolvedValue(false);
    const response = await request(app).get("/company/company-a/accounts-payable");
    expect(response.status).toBe(403);
    expect(userCanViewFinancials).toHaveBeenCalledWith("user-a", "company-a");
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
  });

  it("returns only the requested company's bills after access is granted", async () => {
    (userCanViewFinancials as jest.Mock).mockResolvedValue(true);
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: "company-a" });
    (prisma.accountPayable.findMany as jest.Mock).mockResolvedValue([]);
    const response = await request(app).get("/company/company-a/accounts-payable");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(prisma.accountPayable.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "company-a" },
    }));
  });
});
