jest.mock("../../src/utils/prisma", () => {
  const transactionClient = {
    company: { findUnique: jest.fn() },
    trackingRuntimeConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    trackingRuntimeConfigAudit: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    userAttendance: { findFirst: jest.fn() },
    company: { findUnique: jest.fn(), findMany: jest.fn() },
    trackingRuntimeConfig: { findUnique: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(transactionClient)),
    __transactionClient: transactionClient,
  };
  return { prisma };
});

import { getTrackingConfig } from "../../src/config/trackingConfig";
import {
  getEffectiveTrackingConfig,
  resolveTrackingConfigCompanyForUser,
  TrackingConfigAccessError,
  updateGlobalTrackingConfig,
} from "../../src/services/TrackingConfigService";
import { prisma } from "../../src/utils/prisma";

const prismaMock = prisma as any;
const tx = prismaMock.__transactionClient as any;
const actor = {
  id: "master-1",
  name: "Master User",
  email: "master@example.com",
};

function configRecord(
  id: string,
  companyId: string | null,
  config: Record<string, unknown>
) {
  return {
    id,
    scope: companyId ? "COMPANY" : "GLOBAL",
    companyId,
    config,
    updatedByUserId: actor.id,
    createdAt: new Date("2026-07-15T12:00:00.000Z"),
    updatedAt: new Date("2026-07-15T12:01:00.000Z"),
    updatedBy: actor,
  };
}

describe("TrackingConfigService", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TRACKING_V2_ENABLED;
    delete process.env.TRACKING_LEGACY_TIMELINE_WRITE;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it("resolves an active attendance first and rejects an explicit foreign company", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      office: { name: "Worker" },
      companies: [
        { companyId: "company-1", office: { name: "Worker" } },
        { companyId: "company-2", office: { name: "Worker" } },
      ],
    });
    prismaMock.userAttendance.findFirst.mockResolvedValue({
      company_id: "company-2",
      UserServiceProject: null,
    });

    await expect(resolveTrackingConfigCompanyForUser("user-1")).resolves.toBe(
      "company-2"
    );
    await expect(
      resolveTrackingConfigCompanyForUser("user-1", "company-3")
    ).rejects.toEqual(
      expect.objectContaining<Partial<TrackingConfigAccessError>>({ statusCode: 403 })
    );
  });

  it("merges environment, persisted global and per-company override", async () => {
    const global = configRecord("global", null, {
      enabled: false,
      queueLimit: 300,
      keepaliveMs: 180_000,
    });
    const company = configRecord("company:company-1", "company-1", {
      enabled: true,
      queueLimit: 100,
    });
    prismaMock.trackingRuntimeConfig.findUnique.mockImplementation(
      ({ where }: any) => Promise.resolve(where.id === "global" ? global : company)
    );

    await expect(getEffectiveTrackingConfig("company-1")).resolves.toEqual(
      expect.objectContaining({
        protocolVersion: 2,
        enabled: true,
        queueLimit: 100,
        keepaliveMs: 180_000,
      })
    );
  });

  it("persists a clamped global config and its immutable actor audit together", async () => {
    const expected = {
      ...getTrackingConfig(),
      enabled: false,
      keepaliveMs: 30_000,
      autoMinSendIntervalMs: 30_000,
    };
    tx.trackingRuntimeConfig.findUnique.mockResolvedValue(null);
    tx.trackingRuntimeConfig.upsert.mockResolvedValue({ id: "global" });
    tx.trackingRuntimeConfigAudit.create.mockResolvedValue({ id: "audit-1" });
    prismaMock.trackingRuntimeConfig.findUnique.mockResolvedValue(
      configRecord("global", null, expected)
    );

    const result = await updateGlobalTrackingConfig(
      { enabled: false, keepaliveMs: 1 },
      actor
    );

    expect(tx.trackingRuntimeConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: "global",
          config: expected,
          updatedByUserId: actor.id,
        }),
      })
    );
    expect(tx.trackingRuntimeConfigAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE_GLOBAL",
        nextConfig: expected,
        changedByUserId: actor.id,
        changedByName: actor.name,
        changedByEmail: actor.email,
      }),
    });
    expect(result.config).toEqual(expected);
  });
});
