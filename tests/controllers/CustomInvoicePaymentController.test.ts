import type { Response } from "express";

const prismaMock: any = {
  invoice: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  invoicePayment: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  invoiceTimeline: { create: jest.fn() },
  invoicePaymentTimeLine: { create: jest.fn() },
  invoiceEmailLog: { create: jest.fn() },
  $transaction: jest.fn(async (operation: any) => operation(prismaMock)),
};

const sendEmailMock = jest.fn();
const generatePaidPdfMock = jest.fn();

jest.mock("../../src/utils/prisma", () => ({ prisma: prismaMock }));
jest.mock("../../src/utils/sendEmail", () => ({ sendEmail: sendEmailMock }));
jest.mock("../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn(async () => "https://example.com/logo"),
}));
jest.mock("../../src/services/invoicePaidPdfService", () => ({
  generateAndStorePaidInvoicePdf: generatePaidPdfMock,
}));
jest.mock("../../src/utils/invoicePaymentDate", () => ({
  InvoicePaymentDateError: class InvoicePaymentDateError extends Error {},
  resolveManualPaymentDate: jest.fn(() => ({
    paidAt: new Date("2026-09-04T12:00:00.000Z"),
    formattedDate: "Sep 4, 2026",
  })),
  formatInvoicePaymentDate: jest.fn(() => "Sep 4, 2026"),
}));

import { CustomInvoicePaymentController } from "../../src/controllers/invoice/CustomInvoicePaymentController";

function response() {
  const result: Partial<Response> = {};
  result.status = jest.fn().mockReturnValue(result);
  result.json = jest.fn().mockReturnValue(result);
  return result as Response;
}

function invoice(sendHistory: Array<{ id: string }>) {
  return {
    id: "invoice-1",
    type_invoicebase: "project",
    invoiceType: "custom",
    payment: null,
    externalInvoiceId: "1390",
    updatedAt: new Date("2026-09-04T12:00:00.000Z"),
    totalAmount: 600,
    InvoiceSendHistory: sendHistory,
    project: {
      id: "project-1",
      location: "123 Main St",
      contract_number: 263,
      company: {
        id: "company-1",
        name: "Robbin Services",
        avatar: null,
        email: "contact@robbinservices.com",
        phone: null,
      },
      client: {
        id: "client-1",
        name: "Client",
        email: "client@example.com",
      },
      workContext: {
        id: "context-1",
        Email: "client@example.com",
        Name: "Client",
        location: "123 Main St",
      },
    },
    estimate: null,
  };
}

function request() {
  return {
    params: { invoiceId: "invoice-1" },
    body: {
      paymentMethod: "check",
      notes: "",
      amount: 600,
      paidAtDate: "2026-09-04",
      clientTimezone: "America/New_York",
    },
  } as any;
}

describe("CustomInvoicePaymentController payment confirmations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.invoicePayment.findUnique.mockResolvedValue({ id: "payment-1" });
    prismaMock.invoicePayment.create.mockResolvedValue({ id: "payment-1" });
    prismaMock.invoice.update.mockResolvedValue({});
    prismaMock.invoiceTimeline.create.mockResolvedValue({});
    prismaMock.invoicePaymentTimeLine.create.mockResolvedValue({});
    prismaMock.invoiceEmailLog.create.mockResolvedValue({});
    generatePaidPdfMock.mockResolvedValue({
      attachment: {
        filename: "invoice_1390_paid.pdf",
        content: "base64",
        type: "application/pdf",
      },
    });
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("does not email a payment confirmation when the invoice was never sent", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice([]));
    const res = response();

    await new CustomInvoicePaymentController().createPayment(request(), res);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(generatePaidPdfMock).not.toHaveBeenCalled();
    expect(prismaMock.invoiceEmailLog.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("emails a confirmation after payment when the invoice was previously sent", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice([{ id: "send-1" }]));
    const res = response();

    await new CustomInvoicePaymentController().createPayment(request(), res);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        throwOnError: true,
      }),
    );
    expect(prismaMock.invoiceEmailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient: "client@example.com",
        status: "success",
      }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("records an email error instead of a false success", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice([{ id: "send-1" }]));
    sendEmailMock.mockRejectedValue(new Error("SendGrid rejected message"));
    const res = response();

    await new CustomInvoicePaymentController().createPayment(request(), res);

    expect(prismaMock.invoiceEmailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient: "client@example.com",
        status: "error",
        errorMessage: "SendGrid rejected message",
      }),
    });
    expect(prismaMock.invoiceEmailLog.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "success" }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
