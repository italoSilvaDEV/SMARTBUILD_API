import type { Response } from "express";

const prismaMock: any = {
  bidRequest: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  bidRequestRecipient: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  bidProposalItem: { deleteMany: jest.fn() },
  subcontractor: { findMany: jest.fn() },
  user: { findFirst: jest.fn() },
  $transaction: jest.fn(async (operation: any) =>
    Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
  ),
};

jest.mock("../../src/utils/prisma", () => ({ prisma: prismaMock }));
jest.mock("../../src/utils/sendEmail", () => ({ sendEmail: jest.fn() }));
jest.mock("../../src/templateEmail/bidRequest", () => ({ bidRequestEmail: jest.fn(() => "") }));
jest.mock("../../src/utils/S3/getPresignedUrl", () => ({ getPresignedUrl: jest.fn(async () => "") }));
jest.mock("../../src/utils/S3/stagedUpload", () => ({
  deleteS3ObjectQuietly: jest.fn(),
  getStagedObjectBuffer: jest.fn(),
  verifyStagedUploadReference: jest.fn(),
}));
jest.mock("../../src/services/bidRequests/externalProposalExtraction", () => ({
  extractExternalProposalFromDocument: jest.fn(),
}));

import { BidRequestController } from "../../src/controllers/bidRequests/BidRequestController";
import { sendEmail } from "../../src/utils/sendEmail";

function response() {
  const result: Partial<Response> = {};
  result.status = jest.fn().mockReturnValue(result);
  result.json = jest.fn().mockReturnValue(result);
  return result as Response;
}

const item = {
  id: "item-1",
  name: "Roofing",
  description: null,
  quantity: 1,
  suggestedValue: 100,
  position: 0,
};

const baseBid = {
  id: "bid-1",
  number: 1001,
  companyId: "company-1",
  projectId: "project-1",
  projectName: "Project",
  projectAddress: "123 Main St",
  projectNumber: "1001",
  title: "Roof",
  scope: "Roof scope",
  status: "pending",
  responseDeadline: new Date("2099-09-10T23:59:59.999Z"),
  approvedRecipientId: null,
  customMessage: null,
  items: [item],
  recipients: [],
  attachments: [],
  company: { name: "SmartBuild", avatar: null },
};

describe("Bid Request recipient management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.bidRequest.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.bidRequestRecipient.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1" });
  });

  it("adds a new recipient without sending and copies the request items", async () => {
    const subcontractor = { id: "sub-1", name: "Roof Co", email: "roof@example.com" };
    const recipient = {
      id: "recipient-1",
      bidRequestId: baseBid.id,
      subcontractorId: subcontractor.id,
      subcontractorName: subcontractor.name,
      subcontractorEmail: subcontractor.email,
      status: "pending",
      submissionSource: "portal",
      items: [],
    };
    prismaMock.bidRequest.findUnique
      .mockResolvedValueOnce(baseBid)
      .mockResolvedValueOnce({ ...baseBid, recipients: [recipient] });
    prismaMock.subcontractor.findMany.mockResolvedValue([subcontractor]);
    prismaMock.bidRequestRecipient.create.mockResolvedValue(recipient);
    const res = response();

    await new BidRequestController().addRecipients(
      {
        params: { id: baseBid.id },
        body: { subcontractorIds: [subcontractor.id], sendNow: false },
        userId: "user-1",
      } as any,
      res,
    );

    expect(prismaMock.bidRequestRecipient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bidRequestId: baseBid.id,
        subcontractorId: subcontractor.id,
        items: {
          create: [expect.objectContaining({ name: item.name, unitPrice: item.suggestedValue })],
        },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects a duplicate recipient", async () => {
    prismaMock.bidRequest.findUnique.mockResolvedValue({
      ...baseBid,
      recipients: [{ subcontractorId: "sub-1" }],
    });
    const res = response();

    await new BidRequestController().addRecipients(
      {
        params: { id: baseBid.id },
        body: { subcontractorIds: ["sub-1"], sendNow: false },
        userId: "user-1",
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prismaMock.bidRequestRecipient.create).not.toHaveBeenCalled();
  });

  it("lets an admin enter an unanswered proposal", async () => {
    const recipient = {
      id: "recipient-1",
      status: "pending",
      externalDocumentKey: null,
      bidRequest: baseBid,
    };
    prismaMock.bidRequestRecipient.findFirst.mockResolvedValue(recipient);
    prismaMock.bidRequestRecipient.update.mockResolvedValue({});
    prismaMock.bidProposalItem.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.bidRequest.findUnique.mockResolvedValue({
      ...baseBid,
      recipients: [],
    });
    const res = response();

    await new BidRequestController().enterRecipientProposal(
      {
        params: { id: baseBid.id, recipientId: recipient.id },
        body: {
          notes: "Received by phone",
          items: [{ name: "Roofing", description: "", quantity: 1, unitPrice: 125 }],
        },
        userId: "user-1",
      } as any,
      res,
    );

    expect(prismaMock.bidRequestRecipient.update).toHaveBeenCalledWith({
      where: { id: recipient.id },
      data: expect.objectContaining({
        status: "submitted",
        submissionSource: "admin_manual",
        enteredById: "user-1",
      }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Object) }));
  });

  it("does not overwrite a proposal that was already submitted", async () => {
    prismaMock.bidRequestRecipient.findFirst.mockResolvedValue({
      id: "recipient-1",
      status: "submitted",
      bidRequest: baseBid,
    });
    const res = response();

    await new BidRequestController().enterRecipientProposal(
      {
        params: { id: baseBid.id, recipientId: "recipient-1" },
        body: { items: [{ name: "Roofing", quantity: 1, unitPrice: 125 }] },
        userId: "user-1",
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prismaMock.bidRequestRecipient.update).not.toHaveBeenCalled();
  });

  it("tracks successful and failed deliveries per recipient", async () => {
    const recipients = [
      {
        id: "recipient-1",
        subcontractorId: "sub-1",
        subcontractorName: "Roof Co",
        subcontractorEmail: "roof@example.com",
        publicToken: "token-1",
        status: "pending",
        invitedAt: null,
      },
      {
        id: "recipient-2",
        subcontractorId: "sub-2",
        subcontractorName: "Floor Co",
        subcontractorEmail: "floor@example.com",
        publicToken: "token-2",
        status: "pending",
        invitedAt: null,
      },
    ];
    prismaMock.bidRequest.findUnique.mockResolvedValue({ ...baseBid, recipients });
    prismaMock.bidRequestRecipient.update.mockResolvedValue({});
    prismaMock.bidRequest.update.mockResolvedValue({});
    (sendEmail as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("SMTP unavailable"));
    const res = response();

    await new BidRequestController().send(
      {
        params: { id: baseBid.id },
        body: { recipientIds: recipients.map((item) => item.id) },
        userId: "user-1",
      } as any,
      res,
    );

    expect(prismaMock.bidRequestRecipient.update).toHaveBeenCalledWith({
      where: { id: "recipient-1" },
      data: expect.objectContaining({
        deliveryStatus: "sent",
        sendCount: { increment: 1 },
      }),
    });
    expect(prismaMock.bidRequestRecipient.update).toHaveBeenCalledWith({
      where: { id: "recipient-2" },
      data: { deliveryStatus: "failed" },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      sent: 1,
      failed: [{ recipient: "floor@example.com", error: "SMTP unavailable" }],
    });
  });

  it("keeps the Bid Request open after the last public response", async () => {
    prismaMock.bidRequestRecipient.findUnique.mockResolvedValue({
      id: "recipient-1",
      bidRequestId: baseBid.id,
      status: "pending",
      bidRequest: baseBid,
    });
    prismaMock.bidProposalItem.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.bidRequestRecipient.update.mockResolvedValue({});
    const res = response();

    await new BidRequestController().submitPublic(
      {
        params: { publicToken: "token-1" },
        body: { items: [{ name: "Roofing", quantity: 1, unitPrice: 125 }] },
      } as any,
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(prismaMock.bidRequest.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: baseBid.id }),
        data: expect.objectContaining({ status: "finalized" }),
      }),
    );
  });
});
