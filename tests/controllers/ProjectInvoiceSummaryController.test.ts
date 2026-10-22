import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ProjectInvoiceSummaryController } from "../../src/controllers/invoice/ProjectInvoiceSummaryController";
import { prisma } from "../../src/utils/prisma";
import { userHasFullAccess } from "../../src/utils/ownerFullAccess";

jest.mock("../../src/utils/prisma", () => ({ prisma: {
  project: { findUnique: jest.fn() },
  user: { findFirst: jest.fn() },
  invoice: { findMany: jest.fn() },
} }));
jest.mock("../../src/utils/ownerFullAccess", () => ({ userHasFullAccess: jest.fn() }));

const invoice = (amount: number | string, overrides: Record<string, unknown> = {}) => ({
  projectId: "project-1", cancel_invoice_edit: null as boolean | null,
  user_id: "user-1", project_manager_id: null as string | null,
  status: "paid", invoiceType: "custom", totalAmount: new Prisma.Decimal(amount),
  paymentApplications: [] as { amountApplied: Prisma.Decimal }[], ...overrides,
});

describe("project invoice summary", () => {
  let rows: ReturnType<typeof invoice>[];
  let req: Request;
  let res: Response;
  const controller = new ProjectInvoiceSummaryController();

  beforeEach(() => {
    jest.clearAllMocks();
    rows = [];
    req = { userId: "user-1", params: { projectId: "project-1" }, query: {} } as unknown as Request;
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ company_id: "company-1", project_manager_id: "manager" });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: "user-1" });
    (userHasFullAccess as jest.Mock).mockResolvedValue(true);
    (prisma.invoice.findMany as jest.Mock).mockImplementation(async ({ where, take, skip }) => {
      const eligible = rows.filter(row => row.projectId === where.projectId &&
        where.OR.some((condition: any) => row.cancel_invoice_edit === condition.cancel_invoice_edit) &&
        (!where.AND || where.AND[0].OR.some((condition: any) =>
          Object.entries(condition).every(([key, value]) => (row as any)[key] === value))));
      return eligible.slice(skip || 0, take === undefined ? undefined : (skip || 0) + take);
    });
  });

  async function summary() {
    await controller.handle(req, res);
    expect(res.status).not.toHaveBeenCalled();
    return (res.json as jest.Mock).mock.calls.at(-1)[0];
  }

  it("keeps receipts unchanged when pending invoices are created and deleted (10 -> 11 -> 12)", async () => {
    rows = [25000, 25000, 25000, 25000, 25000, 15000, 15000, 10041.40, 40000, 40000].map(amount => invoice(amount));
    expect(await summary()).toEqual({ total: 10, paid: 10, receivedAmount: 245041.40, remainingAmount: 0 });
    rows.unshift(invoice(4269, { status: "pending" }));
    expect(await summary()).toEqual({ total: 11, paid: 10, receivedAmount: 245041.40, remainingAmount: 4269 });
    rows.unshift(invoice(15000, { status: "open" }));
    expect(await summary()).toEqual({ total: 12, paid: 10, receivedAmount: 245041.40, remainingAmount: 19269 });
    rows.splice(0, 2);
    expect(await summary()).toEqual({ total: 10, paid: 10, receivedAmount: 245041.40, remainingAmount: 0 });
  });

  it("has no 10/1000 invoice cap and ignores list filters and pagination parameters", async () => {
    rows = Array.from({ length: 1205 }, () => invoice("0.10"));
    req.query = { page: "2", limit: "10", itemsPerPage: "1", searchTerm: "not found", status: "pending" };
    expect(await summary()).toEqual({ total: 1205, paid: 1205, receivedAmount: 120.5, remainingAmount: 0 });
    const query = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
    expect(query).not.toHaveProperty("take");
    expect(query).not.toHaveProperty("skip");
    expect(query).not.toHaveProperty("include");
    expect(Object.keys(query.select).sort()).toEqual([
      "balanceRemaining", "invoiceType", "payment", "paymentApplications", "status",
      "surchargePaymentLocal", "totalAmount", "totalAmountPaid", "totalAmountPaidQbo",
    ]);
    rows = Array.from({ length: 1205 }, () => invoice("0.10", { status: "open" }));
    expect(await summary()).toEqual({ total: 1205, paid: 0, receivedAmount: 0, remainingAmount: 120.5 });
  });

  it("counts QBO partial payments once without counting the invoice as fully paid", async () => {
    const payments = [new Prisma.Decimal("0.10"), new Prisma.Decimal("0.20")].map(amountApplied => ({ amountApplied }));
    rows = [
      invoice(100, { invoiceType: "quickbooks", status: "partial", paymentApplications: payments }),
      invoice(50, { invoiceType: "quickbooks", paymentApplications: [{ amountApplied: new Prisma.Decimal(50) }] }),
      invoice(20, { invoiceType: "stripe", status: "PAID" }),
      invoice(10, { status: "partial", payment: { amount: new Prisma.Decimal("0.30") } }),
      invoice(100, { invoiceType: "quickbooks", status: "partial", balanceRemaining: new Prisma.Decimal(100) }),
    ];
    expect(await summary()).toEqual({ total: 5, paid: 2, receivedAmount: 70.3, remainingAmount: 209.4 });
  });

  it("preserves status rules and excludes replaced invoices and other projects", async () => {
    rows = [invoice(12, { cancel_invoice_edit: false }), invoice(8),
      invoice(500, { cancel_invoice_edit: true }), invoice(500, { projectId: "other" }),
      ...["draft", "open", "pending", "void", "canceled", "uncollectible"].map(status => invoice(100, { status })),
    ];
    expect(await summary()).toEqual({ total: 8, paid: 2, receivedAmount: 20, remainingAmount: 300 });
  });

  it("handles empty projects and reflects actual payment or paid-invoice deletion", async () => {
    expect(await summary()).toEqual({ total: 0, paid: 0, receivedAmount: 0, remainingAmount: 0 });
    rows = [invoice(15, { status: "open" })];
    expect(await summary()).toEqual({ total: 1, paid: 0, receivedAmount: 0, remainingAmount: 15 });
    rows[0].status = "paid";
    expect(await summary()).toEqual({ total: 1, paid: 1, receivedAmount: 15, remainingAmount: 0 });
    rows = [];
    expect(await summary()).toEqual({ total: 0, paid: 0, receivedAmount: 0, remainingAmount: 0 });
  });

  it("updates outstanding after partial payment, cancellation and final payment", async () => {
    rows = [invoice(100, { status: "open" }), invoice(25, { status: "open" })];
    expect((await summary()).remainingAmount).toBe(125);
    rows[0] = invoice(100, { status: "partial", payment: { amount: new Prisma.Decimal(40) } });
    expect((await summary()).remainingAmount).toBe(85);
    rows[1].status = "canceled";
    expect((await summary()).remainingAmount).toBe(60);
    rows[0].status = "paid";
    expect(await summary()).toEqual({ total: 2, paid: 1, receivedAmount: 100, remainingAmount: 0 });
  });

  it("does not offset open debt with another invoice's overpayment", async () => {
    rows = [invoice(100, { status: "partial", balanceRemaining: new Prisma.Decimal(-50) }),
      invoice(30, { status: "open" })];
    expect((await summary()).remainingAmount).toBe(30);
  });

  it("reports incomplete partial balances as unavailable without hiding known receipts", async () => {
    rows = [invoice(50), invoice(100, { status: "partial" }), invoice(25, { status: "open" })];
    expect(await summary()).toEqual({ total: 3, paid: 1, receivedAmount: 50, remainingAmount: null });
  });

  it("restricts all totals to invoices created by or managed by a restricted user", async () => {
    (userHasFullAccess as jest.Mock).mockResolvedValue(false);
    rows = [invoice(10), invoice(20, { user_id: "other", project_manager_id: "user-1" }), invoice(999, { user_id: "other" })];
    expect(await summary()).toEqual({ total: 2, paid: 2, receivedAmount: 30, remainingAmount: 0 });
    rows.push(invoice(40, { status: "open" }), invoice(999, { status: "open", user_id: "other" }));
    expect(await summary()).toEqual({ total: 3, paid: 2, receivedAmount: 30, remainingAmount: 40 });
    expect(userHasFullAccess).toHaveBeenCalledWith("user-1", "invoiceEditAll", "company-1");
  });

  it("allows a project manager to see all project invoices", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ company_id: "company-1", project_manager_id: "user-1" });
    (userHasFullAccess as jest.Mock).mockResolvedValue(false);
    rows = [invoice(99, { user_id: "other" })];
    expect(await summary()).toEqual({ total: 1, paid: 1, receivedAmount: 99, remainingAmount: 0 });
  });

  it("checks both direct company membership and multi-company membership", async () => {
    await summary();
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: {
      id: "user-1", OR: [{ company_id: "company-1" }, { companies: { some: { companyId: "company-1" } } }],
    }, select: { id: true } });
  });

  it.each(["unauthenticated", "missing-project", "other-company"])("rejects %s before reading invoices", async scenario => {
    if (scenario === "unauthenticated") delete (req as any).userId;
    if (scenario === "missing-project") (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    if (scenario === "other-company") (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    req.query = { userId: "owner", companyId: "company-1" };
    await controller.handle(req, res);
    expect(res.status).toHaveBeenCalledWith(scenario === "unauthenticated" ? 401 : scenario === "missing-project" ? 404 : 403);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("returns an error rather than a zero summary when the database fails", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      (prisma.invoice.findMany as jest.Mock).mockRejectedValue(new Error("database unavailable"));
      await controller.handle(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch invoice summary" });
    } finally { log.mockRestore(); }
  });
});
