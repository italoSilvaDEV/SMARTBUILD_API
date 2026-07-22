import type { Request, Response } from "express";

jest.mock("../../src/services/TrackingConfigService", () => {
  const actual = jest.requireActual("../../src/services/TrackingConfigService");
  return {
    ...actual,
    listTrackingConfigForMaster: jest.fn(),
    getCompanyTrackingConfigForMaster: jest.fn(),
    updateGlobalTrackingConfig: jest.fn(),
    updateCompanyTrackingConfig: jest.fn(),
    restoreCompanyTrackingConfigInheritance: jest.fn(),
  };
});

jest.mock("../../src/services/SocketService", () => ({
  SocketService: { emitToAll: jest.fn() },
}));

import { MasterTrackingConfigController } from "../../src/controllers/tracking/MasterTrackingConfigController";
import {
  restoreCompanyTrackingConfigInheritance,
  updateCompanyTrackingConfig,
} from "../../src/services/TrackingConfigService";
import { SocketService } from "../../src/services/SocketService";

function createResponse() {
  const response: Partial<Response> = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response as Response;
}

const actor = {
  id: "master-1",
  name: "Master User",
  email: "master@example.com",
};

describe("MasterTrackingConfigController", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves a company override and broadcasts an immediate refresh", async () => {
    const updatedAt = new Date("2026-07-15T15:00:00.000Z");
    const company = {
      companyId: "company-1",
      companyName: "Company 1",
      isActive: true,
      hasOverride: true,
      override: { enabled: false },
      effectiveConfig: {},
      updatedAt,
      updatedBy: actor,
    };
    (updateCompanyTrackingConfig as jest.Mock).mockResolvedValue(company);
    const request = {
      masterActor: actor,
      params: { companyId: "company-1" },
      body: { config: { enabled: false } },
    } as unknown as Request;
    const response = createResponse();

    await new MasterTrackingConfigController().saveCompany(request, response);

    expect(updateCompanyTrackingConfig).toHaveBeenCalledWith(
      "company-1",
      { enabled: false },
      actor
    );
    expect(SocketService.emitToAll).toHaveBeenCalledWith(
      "tracking_config_updated",
      { companyId: "company-1", updatedAt: updatedAt.toISOString() }
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ company });
  });

  it("restores inheritance and broadcasts the affected company", async () => {
    const company = {
      companyId: "company-1",
      companyName: "Company 1",
      isActive: true,
      hasOverride: false,
      override: null,
      effectiveConfig: {},
      updatedAt: null,
      updatedBy: null,
    };
    (restoreCompanyTrackingConfigInheritance as jest.Mock).mockResolvedValue(company);
    const response = createResponse();

    await new MasterTrackingConfigController().restoreCompany(
      {
        masterActor: actor,
        params: { companyId: "company-1" },
      } as unknown as Request,
      response
    );

    expect(SocketService.emitToAll).toHaveBeenCalledWith(
      "tracking_config_updated",
      expect.objectContaining({
        companyId: "company-1",
        updatedAt: expect.any(String),
      })
    );
    expect(response.json).toHaveBeenCalledWith({ company });
  });
});
