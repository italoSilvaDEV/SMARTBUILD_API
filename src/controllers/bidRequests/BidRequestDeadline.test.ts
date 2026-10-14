import { BidRequestController } from "./BidRequestController";
import { prisma } from "../../utils/prisma";

jest.mock("../../utils/prisma", () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    bidRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
    bidRequestRecipient: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  user: { findFirst: jest.Mock };
  bidRequest: { findUnique: jest.Mock; updateMany: jest.Mock };
  bidRequestRecipient: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const pastDeadline = new Date("2026-10-01T23:59:59.999Z");
const recipient = {
  id: "recipient-1",
  status: "expired",
  subcontractorId: "subcontractor-1",
  subcontractorName: "Subcontractor",
  subcontractorEmail: "subcontractor@example.com",
  items: [],
};
const record = {
  id: "bid-1",
  companyId: "company-1",
  status: "finalized",
  responseDeadline: pastDeadline,
  finalizedAt: pastDeadline,
  canceledAt: null,
  approvedRecipientId: null,
  approvedWorkOrderId: null,
  recipients: [recipient],
};

function responseMock() {
  const response = { status: jest.fn(), json: jest.fn() } as any;
  response.status.mockReturnValue(response);
  return response;
}

function request(body: Record<string, unknown> = {}) {
  return {
    params: { id: record.id },
    body: { responseDeadline: "2099-01-01", notifyRecipientIds: [], ...body },
    userId: "admin-1",
  } as any;
}

describe("BidRequestController.changeDeadline", () => {
  const controller = new BidRequestController();

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findFirst.mockResolvedValue({ id: "admin-1" });
    db.bidRequest.findUnique.mockResolvedValue(record);
  });

  test("reopens a deadline-finalized request and restores only expired recipients", async () => {
    const updateRequest = jest.fn().mockResolvedValue({ count: 1 });
    const updateRecipients = jest.fn().mockResolvedValue({ count: 1 });
    const createAudit = jest.fn().mockResolvedValue({ id: "audit-1" });
    db.$transaction.mockImplementation(async (callback: any) => callback({
      bidRequest: { updateMany: updateRequest },
      bidRequestRecipient: { updateMany: updateRecipients },
      audit: { create: createAudit },
    }));
    db.bidRequest.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        status: "pending",
        finalizedAt: null,
        responseDeadline: new Date("2099-01-01T23:59:59.999Z"),
        recipients: [{ ...recipient, status: "pending" }],
        items: [],
        attachments: [],
        company: { name: "Company", avatar: null },
      });
    const response = responseMock();

    await controller.changeDeadline(request({ reason: "More time needed" }), response);

    expect(updateRequest).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending", finalizedAt: null }),
    }));
    expect(updateRecipients).toHaveBeenCalledWith({
      where: { bidRequestId: record.id, status: "expired" },
      data: { status: "pending" },
    });
    expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "admin-1" }),
    }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending" }),
    }));
  });

  test.each([
    ["already open", { status: "pending" }],
    ["canceled", { status: "canceled", canceledAt: pastDeadline }],
    ["awarded", { approvedRecipientId: "recipient-1", approvedWorkOrderId: "work-order-1" }],
    ["finalized before the deadline", { responseDeadline: new Date("2099-01-01T23:59:59.999Z") }],
  ])("blocks %s requests without changing data", async (_name, patch) => {
    db.bidRequest.findUnique.mockResolvedValue({ ...record, ...patch });
    const response = responseMock();

    await controller.changeDeadline(request(), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test.each(["2026-02-30", "2026-10-01", "2099-01-01T23:59:59.999Z"])(
    "rejects invalid or elapsed deadline %s without changing data",
    async (responseDeadline) => {
      const response = responseMock();

      await controller.changeDeadline(request({ responseDeadline }), response);

      expect(response.status).toHaveBeenCalledWith(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  test("rejects stale updates when the request changed concurrently", async () => {
    db.$transaction.mockImplementation(async (callback: any) => callback({
      bidRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    }));
    const response = responseMock();

    await controller.changeDeadline(request(), response);

    expect(response.status).toHaveBeenCalledWith(409);
  });

  test("automatic reopening also restores expired recipients", async () => {
    const updateRequest = jest.fn().mockResolvedValue({ count: 1 });
    const updateRecipients = jest.fn().mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation(async (callback: any) => callback({
      bidRequest: { updateMany: updateRequest },
      bidRequestRecipient: { updateMany: updateRecipients },
    }));
    db.bidRequest.updateMany.mockResolvedValue({ count: 0 });
    db.bidRequestRecipient.updateMany.mockResolvedValue({ count: 0 });
    db.bidRequest.findUnique.mockResolvedValue({
      ...record,
      status: "pending",
      responseDeadline: new Date("2099-01-01T23:59:59.999Z"),
      recipients: [{ ...recipient, status: "pending" }],
      items: [],
      attachments: [],
      company: { name: "Company", avatar: null },
    });
    const response = responseMock();

    await controller.get(request(), response);

    expect(updateRequest).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "pending", finalizedAt: null },
    }));
    expect(updateRecipients).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "expired" }),
      data: { status: "pending" },
    }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending" }),
    }));
  });
});
