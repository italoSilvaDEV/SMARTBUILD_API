import { deletePaidOtherInvoice, PaidOtherInvoiceDeletionError } from "./deletePaidOtherInvoice";
import { prisma } from "../utils/prisma";
import { deleteFileFromS3 } from "../utils/S3/deleteFileFromS3";

jest.mock("../utils/prisma", () => ({
  prisma: {
    invoice: { findUnique: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn() },
    invoiceDeletionAudit: { create: jest.fn() },
    invoicePaymentTimeLine: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("../utils/S3/deleteFileFromS3", () => ({ deleteFileFromS3: jest.fn() }));

const db = prisma as any;
const deletePdf = deleteFileFromS3 as jest.Mock;

function paidOther(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-1",
    companyId: "company-1",
    projectId: "project-1",
    estimateId: null,
    type_invoicebase: "project",
    project: { company_id: "company-1", project_manager_id: null },
    user_id: "user-1",
    project_manager_id: null,
    invoiceType: "custom",
    status: "paid",
    externalInvoiceId: "1042",
    totalAmount: 250,
    payment: { paymentMethod: "cash", amount: 250, paidAt: new Date("2026-10-01T12:00:00Z") },
    pdfInvoicePaids: { uri: "receipts/1042.pdf" },
    stripeInvoiceId: null,
    stripePaymentIntentId: null,
    idQuickBooksRef: null,
    idQuickbookContabio: null,
    docNumberQuickBooksContabio: null,
    externalDocNumber: null,
    qboCustomerRef: null,
    paymentMethodType: null,
    totalAmountPaid: null,
    totalAmountPaidQbo: null,
    balanceRemaining: null,
    PaymentIntents: [],
    paymentApplications: [],
    ...overrides,
  };
}

describe("deletePaidOtherInvoice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(async (operation: (tx: typeof db) => Promise<unknown>) => operation(db));
    db.invoice.findUnique.mockResolvedValue(paidOther());
    db.user.findUnique.mockResolvedValue({
      company_id: "company-1", invoiceEditAll: false, office: { name: "Employee" }, companies: [],
    });
    db.invoiceDeletionAudit.create.mockResolvedValue({ id: "audit-1" });
    db.invoicePaymentTimeLine.create.mockResolvedValue({ id: "timeline-1" });
    db.invoice.delete.mockResolvedValue({ id: "invoice-1" });
    deletePdf.mockResolvedValue(undefined);
  });

  it("audits and deletes a local paid Other invoice", async () => {
    await deletePaidOtherInvoice("invoice-1", "user-1");

    expect(db.invoiceDeletionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      invoiceId: "invoice-1", companyId: "company-1", deletedById: "user-1",
      paymentMethod: "cash", paymentAmount: 250,
    }) });
    expect(db.invoicePaymentTimeLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      projectId: "project-1", description: expect.stringContaining("payment removed from totals"),
    }) });
    expect(db.invoice.delete).toHaveBeenCalledWith({ where: { id: "invoice-1" } });
    expect(deletePdf).toHaveBeenCalledWith("receipts/1042.pdf");
  });

  it.each([
    { invoiceType: "stripe" },
    { invoiceType: "quickbooks" },
    { stripeInvoiceId: "in_123" },
    { stripePaymentIntentId: "pi_123" },
    { idQuickBooksRef: "qbo-123" },
    { idQuickbookContabio: "qbo-admin-123" },
    { paymentMethodType: "card" },
    { totalAmountPaidQbo: 250 },
    { PaymentIntents: [{ id: "intent-1" }] },
    { paymentApplications: [{ id: "application-1" }] },
  ])("rejects external or non-Other invoices: %j", async (override) => {
    db.invoice.findUnique.mockResolvedValue(paidOther(override));

    await expect(deletePaidOtherInvoice("invoice-1", "user-1"))
      .rejects.toBeInstanceOf(PaidOtherInvoiceDeletionError);
    expect(db.invoiceDeletionAudit.create).not.toHaveBeenCalled();
    expect(db.invoice.delete).not.toHaveBeenCalled();
  });

  it("rejects a user outside the invoice company", async () => {
    db.user.findUnique.mockResolvedValue({
      company_id: "company-2", invoiceEditAll: false, office: { name: "Employee" }, companies: [],
    });

    await expect(deletePaidOtherInvoice("invoice-1", "user-1"))
      .rejects.toMatchObject({ status: 403 });
    expect(db.invoice.delete).not.toHaveBeenCalled();
  });

  it("does not delete if the audit write fails", async () => {
    db.invoiceDeletionAudit.create.mockRejectedValue(new Error("database unavailable"));

    await expect(deletePaidOtherInvoice("invoice-1", "user-1"))
      .rejects.toThrow("database unavailable");
    expect(db.invoice.delete).not.toHaveBeenCalled();
  });

  it("rejects another company member without invoice management access", async () => {
    db.invoice.findUnique.mockResolvedValue(paidOther({ user_id: "another-user" }));

    await expect(deletePaidOtherInvoice("invoice-1", "user-1"))
      .rejects.toMatchObject({ status: 403 });
    expect(db.invoice.delete).not.toHaveBeenCalled();
  });
});
