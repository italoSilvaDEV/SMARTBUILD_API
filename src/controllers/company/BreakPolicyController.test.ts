import { BreakPolicyController } from "./BreakPolicyController";
import { prisma } from "../../utils/prisma";

jest.mock("../../utils/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    breakPolicy: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  breakPolicy: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

function responseMock() {
  const response = { status: jest.fn(), json: jest.fn() } as any;
  response.status.mockReturnValue(response);
  return response;
}

describe("BreakPolicyController.setDefault", () => {
  const controller = new BreakPolicyController();
  const policy = {
    id: "policy-1",
    companyId: "company-1",
    name: "Field team",
    isActive: true,
    isDefault: true,
    rules: [{ afterMinutes: 360, deductMinutes: 30 }],
    weekdays: [1, 2, 3, 4, 5],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.user.findUnique.mockResolvedValue({
      company_id: "company-1",
      office: { name: "Administrator" },
      companies: [],
    });
    mockedPrisma.breakPolicy.findFirst.mockResolvedValue(policy);
  });

  test("requires explicit confirmation before removing the company default", async () => {
    const request = {
      params: { companyId: "company-1", policyId: "policy-1" },
      body: { isDefault: false },
      userId: "admin-1",
    } as any;
    const response = responseMock();

    await controller.setDefault(request, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: "Explicit confirmation is required" });
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  test("removes only the default flag and records that assignments are preserved", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAudit = jest.fn().mockResolvedValue({ id: "audit-1" });
    mockedPrisma.$transaction.mockImplementation(async (callback: any) => callback({
      breakPolicy: { updateMany },
      breakPolicyAudit: { create: createAudit },
    }));
    const request = {
      params: { companyId: "company-1", policyId: "policy-1" },
      body: { isDefault: false, confirmation: "REMOVE_COMPANY_DEFAULT" },
      userId: "admin-1",
    } as any;
    const response = responseMock();

    await controller.setDefault(request, response);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "policy-1", companyId: "company-1", isDefault: true },
      data: { isDefault: false, updatedById: "admin-1" },
    });
    expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "removed_default",
        snapshot: expect.objectContaining({ preservedAssignments: true }),
      }),
    }));
    expect(response.json).toHaveBeenCalledWith({ success: true, changed: true, affectedUsers: 0 });
  });
});
