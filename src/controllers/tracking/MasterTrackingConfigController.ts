import { Request, Response } from "express";
import {
  getCompanyTrackingConfigForMaster,
  listTrackingConfigForMaster,
  restoreCompanyTrackingConfigInheritance,
  TrackingConfigAccessError,
  TrackingConfigMasterActor,
  updateCompanyTrackingConfig,
  updateGlobalTrackingConfig,
} from "../../services/TrackingConfigService";
import { TrackingConfigValidationError } from "../../config/trackingConfig";
import { SocketService } from "../../services/SocketService";

function getActor(req: Request): TrackingConfigMasterActor {
  return (req as any).masterActor as TrackingConfigMasterActor;
}

function handleError(res: Response, error: unknown): Response {
  if (error instanceof TrackingConfigValidationError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof TrackingConfigAccessError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error("[MasterTrackingConfigController] Request failed:", error);
  return res.status(500).json({ error: "Unable to manage tracking configuration" });
}

function emitConfigUpdated(companyId: string | null, updatedAt: Date | null) {
  SocketService.emitToAll("tracking_config_updated", {
    companyId,
    updatedAt: (updatedAt || new Date()).toISOString(),
  });
}

export class MasterTrackingConfigController {
  async list(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await listTrackingConfigForMaster());
    } catch (error) {
      return handleError(res, error);
    }
  }

  async readCompany(req: Request, res: Response): Promise<Response> {
    try {
      return res
        .status(200)
        .json(await getCompanyTrackingConfigForMaster(req.params.companyId));
    } catch (error) {
      return handleError(res, error);
    }
  }

  async saveGlobal(req: Request, res: Response): Promise<Response> {
    try {
      const global = await updateGlobalTrackingConfig(req.body?.config, getActor(req));
      emitConfigUpdated(null, global.updatedAt);
      return res.status(200).json({ global });
    } catch (error) {
      return handleError(res, error);
    }
  }

  async saveCompany(req: Request, res: Response): Promise<Response> {
    try {
      const company = await updateCompanyTrackingConfig(
        req.params.companyId,
        req.body?.config,
        getActor(req)
      );
      emitConfigUpdated(company.companyId, company.updatedAt);
      return res.status(200).json({ company });
    } catch (error) {
      return handleError(res, error);
    }
  }

  async restoreCompany(req: Request, res: Response): Promise<Response> {
    try {
      const company = await restoreCompanyTrackingConfigInheritance(
        req.params.companyId,
        getActor(req)
      );
      emitConfigUpdated(company.companyId, company.updatedAt);
      return res.status(200).json({ company });
    } catch (error) {
      return handleError(res, error);
    }
  }
}
