import type { Request, Response } from "express";

jest.mock("../../src/services/TrackingConfigService", () => {
  const actual = jest.requireActual("../../src/services/TrackingConfigService");
  return {
    ...actual,
    resolveTrackingConfigCompanyForUser: jest.fn(),
    getEffectiveTrackingConfig: jest.fn(),
  };
});

import { TrackingConfigController } from "../../src/controllers/tracking/TrackingConfigController";
import { getTrackingConfig } from "../../src/config/trackingConfig";
import {
  getEffectiveTrackingConfig,
  resolveTrackingConfigCompanyForUser,
  TrackingConfigAccessError,
} from "../../src/services/TrackingConfigService";

function createResponse() {
  const response: Partial<Response> = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  response.setHeader = jest.fn().mockReturnValue(response);
  return response as Response;
}

describe("TrackingConfigController persisted compatibility", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps GET /tracking/config as a plain config object and forwards companyId", async () => {
    const config = { ...getTrackingConfig(), enabled: false, queueLimit: 321 };
    (resolveTrackingConfigCompanyForUser as jest.Mock).mockResolvedValue("company-1");
    (getEffectiveTrackingConfig as jest.Mock).mockResolvedValue(config);
    const request = {
      userId: "user-1",
      query: { companyId: "company-1" },
    } as unknown as Request;
    const response = createResponse();

    await new TrackingConfigController().handle(request, response);

    expect(resolveTrackingConfigCompanyForUser).toHaveBeenCalledWith(
      "user-1",
      "company-1"
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-cache, must-revalidate"
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(config);
  });

  it("returns authorization errors instead of silently leaking a company override", async () => {
    (resolveTrackingConfigCompanyForUser as jest.Mock).mockRejectedValue(
      new TrackingConfigAccessError(403, "User does not have access to this company")
    );
    const response = createResponse();

    await new TrackingConfigController().handle(
      { userId: "user-1", query: { companyId: "company-2" } } as unknown as Request,
      response
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "User does not have access to this company",
    });
  });

  it("falls back to the legacy environment/default object if persistence is unavailable", async () => {
    (resolveTrackingConfigCompanyForUser as jest.Mock).mockResolvedValue("company-1");
    (getEffectiveTrackingConfig as jest.Mock).mockRejectedValue(
      new Error("tracking_runtime_configs does not exist")
    );
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const response = createResponse();

    await new TrackingConfigController().handle(
      { userId: "user-1", query: {} } as unknown as Request,
      response
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Tracking-Config-Source",
      "environment-fallback"
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(getTrackingConfig());
    consoleError.mockRestore();
  });
});
