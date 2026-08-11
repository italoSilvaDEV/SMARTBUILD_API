import { userCanViewFinancials } from "../../src/utils/financialAccess";
import { prisma } from "../../src/utils/prisma";

jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe("userCanViewFinancials", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows a Master across companies", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      company_id: "another-company",
      office: { name: "Master" },
      companies: [],
    });

    await expect(
      userCanViewFinancials("master-1", "company-1")
    ).resolves.toBe(true);
  });

  it("denies a Worker in the same company", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      company_id: "company-1",
      office: { name: "Worker" },
      companies: [{ office: { name: "Worker" } }],
    });

    await expect(
      userCanViewFinancials("worker-1", "company-1")
    ).resolves.toBe(false);
  });

  it("allows a legacy Administrator only in their own company", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      company_id: "company-1",
      office: { name: "Administrator" },
      companies: [],
    });

    await expect(
      userCanViewFinancials("admin-1", "company-1")
    ).resolves.toBe(true);
    await expect(
      userCanViewFinancials("admin-1", "company-2")
    ).resolves.toBe(false);
  });

  it("allows an Administrator through their multi-company role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      company_id: "company-1",
      office: { name: "Worker" },
      companies: [{ office: { name: "Administrator" } }],
    });

    await expect(
      userCanViewFinancials("admin-2", "company-2")
    ).resolves.toBe(true);
  });
});
