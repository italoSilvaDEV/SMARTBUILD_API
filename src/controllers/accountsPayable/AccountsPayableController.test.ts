import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { AccountsPayableController } from "./AccountsPayableController";

jest.mock("../../utils/prisma", () => ({
  prisma: {
    accountPayable: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const db = prisma.accountPayable as jest.Mocked<typeof prisma.accountPayable>;
const controller = new AccountsPayableController();

function response() {
  const res = { status: jest.fn(), json: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response;
}

function request(params: Record<string, string>, body: unknown = {}) {
  return { params, body } as Request;
}

beforeEach(() => jest.clearAllMocks());

describe("AccountsPayableController company isolation", () => {
  it("uses the URL company, not a body-provided company, when creating", async () => {
    (db.create as jest.Mock).mockResolvedValue({
      id: "bill-a", companyId: "company-a", name: "Rent", description: "",
      amount: new Prisma.Decimal("100.00"), paidAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const res = response();
    await controller.create(request({ companyId: "company-a" }, {
      companyId: "company-b", name: "Rent", amount: "100.00",
    }), res);
    expect(db.create).toHaveBeenCalledWith({
      data: { companyId: "company-a", name: "Rent", description: "", amount: expect.anything() },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("scopes updates to both ID and company", async () => {
    (db.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const res = response();
    await controller.update(request({ companyId: "company-a", id: "bill-b" }, {
      name: "Rent", amount: "100.00",
    }), res);
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bill-b", companyId: "company-a" },
    }));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("scopes deletes to both ID and company", async () => {
    (db.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    const res = response();
    await controller.remove(request({ companyId: "company-a", id: "bill-b" }), res);
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { id: "bill-b", companyId: "company-a" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("scopes payment lookup and rejects invalid state", async () => {
    const res = response();
    await controller.setPayment(request({ companyId: "company-a", id: "bill-b" }, { paid: "true" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.findFirst).not.toHaveBeenCalled();

    (db.findFirst as jest.Mock).mockResolvedValue(null);
    await controller.setPayment(request({ companyId: "company-a", id: "bill-b" }, { paid: true }), res);
    expect(db.findFirst).toHaveBeenCalledWith({
      where: { id: "bill-b", companyId: "company-a" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
