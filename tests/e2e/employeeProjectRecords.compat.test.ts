import type { Response } from "express";

jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn() },
    workOrder: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn(async (value: string) => value),
}));

jest.mock("../../src/utils/S3/uploadFIleS3", () => ({
  uploadFileToS3_2: jest.fn(),
}));

jest.mock("../../src/services/SocketService", () => ({
  SocketService: { emitToUser: jest.fn() },
}));

jest.mock("../../src/utils/sendEmail", () => ({ sendEmail: jest.fn() }));
jest.mock("../../src/templateEmail/workOrder", () => ({ workOrderEmail: jest.fn() }));
jest.mock("../../src/utils/S3/stagedUpload", () => ({
  deleteS3ObjectQuietly: jest.fn(),
  getStagedObjectBuffer: jest.fn(),
  putS3ObjectBuffer: jest.fn(),
  verifyStagedUploadReference: jest.fn(),
}));
jest.mock("../../src/utils/workOrders/signWorkOrderPdf", () => ({
  signWorkOrderPdf: jest.fn(),
}));

import { TaskController } from "../../src/controllers/tasks/TaskController";
import { WorkOrderController } from "../../src/controllers/workOrders/WorkOrderController";
import { prisma } from "../../src/utils/prisma";
import { getStagedObjectBuffer, putS3ObjectBuffer } from "../../src/utils/S3/stagedUpload";
import { signWorkOrderPdf } from "../../src/utils/workOrders/signWorkOrderPdf";

const prismaMock = prisma as any;

function createResponse() {
  const response: Partial<Response> = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response as Response;
}

describe("employee project records compatibility", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists only project tasks assigned to the authenticated employee", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    const request = { params: { projectId: "project-1" }, userId: "worker-1" } as any;
    const response = createResponse();

    await new TaskController().listMineByProject(request, response);

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: "project-1", assignedUserId: "worker-1" },
    }));
    expect(response.json).toHaveBeenCalledWith([]);
  });

  it("lists only work orders where the employee is assignee or related project manager", async () => {
    prismaMock.workOrder.findMany.mockResolvedValue([]);
    const request = { params: { projectId: "project-1" }, userId: "worker-1" } as any;
    const response = createResponse();

    await new WorkOrderController().listMineByProject(request, response);

    expect(prismaMock.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        projectId: "project-1",
        OR: [
          { assigneeType: "employee", assigneeId: "worker-1" },
          { projectManagers: { some: { userId: "worker-1" } } },
        ],
      },
    }));
    expect(response.json).toHaveBeenCalledWith({ data: [] });
  });

  it("lists all work orders related to the authenticated employee", async () => {
    prismaMock.workOrder.findMany.mockResolvedValue([]);
    const request = { userId: "worker-1" } as any;
    const response = createResponse();

    await new WorkOrderController().listMine(request, response);

    expect(prismaMock.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { assigneeType: "employee", assigneeId: "worker-1" },
          { projectManagers: { some: { userId: "worker-1" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }));
    expect(response.json).toHaveBeenCalledWith({ data: [] });
  });

  it("does not allow a related manager to sign as the assigned employee", async () => {
    prismaMock.workOrder.findFirst.mockResolvedValue(null);
    const request = {
      params: { id: "work-order-1" },
      userId: "manager-1",
      body: { signature: "data:image/png;base64,AAAA" },
    } as any;
    const response = createResponse();

    await new WorkOrderController().signMine(request, response);

    expect(prismaMock.workOrder.findFirst).toHaveBeenCalledWith({
      where: {
        id: "work-order-1",
        assigneeType: "employee",
        assigneeId: "manager-1",
      },
    });
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ error: "Work order not found" });
  });

  it("signs a sent pending work order for its authenticated assignee", async () => {
    const pendingOrder = {
      id: "work-order-1",
      companyId: "company-1",
      projectId: "project-1",
      assigneeType: "employee",
      assigneeId: "worker-1",
      status: "pending",
      sourcePdfKey: "work-orders/source.pdf",
    };
    prismaMock.workOrder.findFirst.mockResolvedValue(pendingOrder);
    prismaMock.workOrder.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({
      ...pendingOrder,
      number: 1030,
      title: "Framing",
      scope: "Install framing",
      projectName: "Project One",
      projectAddress: "1 Main St",
      assigneeName: "Worker One",
      startDate: new Date("2026-07-31T12:00:00.000Z"),
      endDate: new Date("2026-08-02T12:00:00.000Z"),
      status: "approved",
      signedPdfKey: "work-orders/signed.pdf",
      items: [],
      attachments: [],
      projectManagers: [],
      company: { name: "SmartBuild", avatar: null, signature: null },
    });
    (getStagedObjectBuffer as jest.Mock).mockResolvedValue(Buffer.from("source"));
    (signWorkOrderPdf as jest.Mock).mockResolvedValue(Buffer.from("signed"));
    const request = {
      params: { id: "work-order-1" },
      userId: "worker-1",
      body: { signature: "data:image/png;base64,AAAA" },
    } as any;
    const response = createResponse();

    await new WorkOrderController().signMine(request, response);

    expect(signWorkOrderPdf).toHaveBeenCalledWith(
      Buffer.from("source"),
      "data:image/png;base64,AAAA",
      expect.any(Date),
    );
    expect(putS3ObjectBuffer).toHaveBeenCalledWith(expect.objectContaining({
      body: Buffer.from("signed"),
      contentType: "application/pdf",
    }));
    expect(prismaMock.workOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "work-order-1",
        status: "pending",
        assigneeType: "employee",
        assigneeId: "worker-1",
      },
      data: expect.objectContaining({ status: "approved", assigneeSignature: "data:image/png;base64,AAAA" }),
    }));
    expect(response.json).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "approved", canSign: true }) });
  });
});
