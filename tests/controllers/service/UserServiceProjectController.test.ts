import { Request, Response } from "express";
import { UserServiceProjectController } from "../../../src/controllers/service/UserServiceProjectController";
import { prisma } from "../../../src/utils/prisma";
import { userCanViewFinancials } from "../../../src/utils/financialAccess";

jest.mock("../../../src/utils/prisma", () => {
  const mockedPrisma: any = {
    serviceProject: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    userServiceProject: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    costProject: {
      findMany: jest.fn(),
    },
  };

  mockedPrisma.$transaction = jest.fn(async (callback) => callback(mockedPrisma));
  return { prisma: mockedPrisma };
});

jest.mock("../../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn(),
}));

jest.mock("../../../src/helpers/featureToggle", () => ({
  isMultiCompanyEnabled: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../../src/utils/financialAccess", () => ({
  userCanViewFinancials: jest.fn(),
}));

describe("UserServiceProjectController", () => {
  const controller = new UserServiceProjectController();
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it("soft-removes deselected workers without deleting their assignment or attendance", async () => {
    (prisma.serviceProject.findUnique as jest.Mock).mockResolvedValue({
      id: "service-1",
      status: "Scheduled",
    });
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: "user-1" }]);
    (prisma.userServiceProject.findMany as jest.Mock).mockResolvedValue([
      { user_id: "user-1" },
      { user_id: "user-2" },
    ]);
    (prisma.userServiceProject.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await controller.create(
      {
        body: {
          service_project_id: "service-1",
          user_ids: ["user-1"],
        },
      } as Request,
      res as Response
    );

    expect(prisma.userServiceProject.updateMany).toHaveBeenCalledWith({
      where: {
        service_project_id: "service-1",
        user_id: { in: ["user-2"] },
        removed_at: null,
      },
      data: { removed_at: expect.any(Date) },
    });
    expect((prisma.userServiceProject as any).delete).toBeUndefined();
    expect((prisma.userServiceProject as any).deleteMany).toBeUndefined();
    expect((prisma as any).userAttendance).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Service team updated successfully.",
      addedUserIds: [],
      removedUserIds: ["user-2"],
    });
  });

  it("reactivates the same historical assignment instead of creating a duplicate", async () => {
    (prisma.serviceProject.findUnique as jest.Mock).mockResolvedValue({
      id: "service-1",
      status: "Scheduled",
    });
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: "user-1" }]);
    (prisma.userServiceProject.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userServiceProject.findFirst as jest.Mock).mockResolvedValue({
      id: "link-with-history",
      removed_at: new Date(),
    });
    (prisma.userServiceProject.update as jest.Mock).mockResolvedValue({
      id: "link-with-history",
    });

    await controller.create(
      {
        body: {
          service_project_id: "service-1",
          user_ids: ["user-1"],
        },
      } as Request,
      res as Response
    );

    expect(prisma.userServiceProject.update).toHaveBeenCalledWith({
      where: { id: "link-with-history" },
      data: {
        removed_at: null,
        assigned_at: expect.any(Date),
      },
    });
    expect(prisma.userServiceProject.create).not.toHaveBeenCalled();
  });

  it("soft-removes a direct link even when it has historical records", async () => {
    (prisma.userServiceProject.findUnique as jest.Mock).mockResolvedValue({
      id: "link-1",
      removed_at: null,
    });
    (prisma.userServiceProject.update as jest.Mock).mockResolvedValue({
      id: "link-1",
    });

    await controller.deleteLink(
      { params: { id: "link-1" } } as unknown as Request,
      res as Response
    );

    expect(prisma.userServiceProject.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { removed_at: expect.any(Date) },
    });
    expect((prisma.userServiceProject as any).delete).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("limits users without financial access to costs they submitted", async () => {
    (prisma.serviceProject.findUnique as jest.Mock).mockResolvedValue({
      company_id: "company-1",
      Project: { company_id: "company-1" },
    });
    (userCanViewFinancials as jest.Mock).mockResolvedValue(false);
    (prisma.costProject.findMany as jest.Mock).mockResolvedValue([]);

    await controller.getCostsByServiceProject(
      {
        params: { serviceProjectId: "service-1" },
        userId: "worker-1",
      } as unknown as Request,
      res as Response
    );

    expect(userCanViewFinancials).toHaveBeenCalledWith(
      "worker-1",
      "company-1"
    );
    expect(prisma.costProject.findMany).toHaveBeenCalledWith({
      where: {
        serviceProjectId: "service-1",
        userId: "worker-1",
      },
      include: {
        invoiceCostProject: true,
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("keeps the existing cost response for financial users", async () => {
    (prisma.serviceProject.findUnique as jest.Mock).mockResolvedValue({
      company_id: "company-1",
      Project: { company_id: "company-1" },
    });
    (userCanViewFinancials as jest.Mock).mockResolvedValue(true);
    (prisma.costProject.findMany as jest.Mock).mockResolvedValue([
      {
        id: "cost-1",
        material_name: "Lumber",
        price: 12.5,
        amout: 3,
        invoiceCostProject: null,
      },
    ]);

    await controller.getCostsByServiceProject(
      {
        params: { serviceProjectId: "service-1" },
        userId: "admin-1",
      } as unknown as Request,
      res as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(prisma.costProject.findMany).toHaveBeenCalledWith({
      where: {
        serviceProjectId: "service-1",
      },
      include: {
        invoiceCostProject: true,
      },
    });
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "cost-1",
        title: "Lumber",
        price: "12.50",
        quantity: 3,
        invoice: null,
      },
    ]);
  });
});
