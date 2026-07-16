import type { NextFunction, Request, Response } from "express";

jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

import { requireMaster } from "../../src/middlewares/requireMaster";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;

function createResponse() {
  const response: Partial<Response> = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response as Response;
}

describe("requireMaster", () => {
  beforeEach(() => jest.clearAllMocks());

  it("authorizes an active Master and snapshots the audit actor", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "master-1",
      name: "Master User",
      email: "master@example.com",
      isDisabled: false,
      company_id: null,
      office: { name: "Master", company_id: null },
      companies: [],
    });
    const request = { userId: "master-1" } as unknown as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await requireMaster(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((request as any).masterActor).toEqual({
      id: "master-1",
      name: "Master User",
      email: "master@example.com",
    });
  });

  it("rejects a membership-only Master role to prevent tenant privilege escalation", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "master-2",
      name: "Multi Master",
      email: "multi@example.com",
      isDisabled: false,
      company_id: null,
      office: { name: "Worker", company_id: "company-1" },
      companies: [{ office: { name: " master " } }],
    });
    const next = jest.fn() as NextFunction;
    const response = createResponse();

    await requireMaster(
      { userId: "master-2" } as unknown as Request,
      response,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it.each([
    ["non-Master", false, "Administrator", null],
    ["disabled Master", true, "Master", null],
    ["company-scoped Master", false, "Master", "company-1"],
  ])("rejects a %s", async (_label, isDisabled, officeName, officeCompanyId) => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      isDisabled,
      company_id: officeCompanyId,
      office: { name: officeName, company_id: officeCompanyId },
      companies: [],
    });
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await requireMaster(
      { userId: "user-1" } as unknown as Request,
      response,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });
});
