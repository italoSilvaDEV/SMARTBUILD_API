import { Request, Response } from "express";
import { getTrackingConfig } from "../../config/trackingConfig";

export class TrackingConfigController {
  handle(_req: Request, res: Response): Response {
    const config = getTrackingConfig();
    res.setHeader(
      "Cache-Control",
      `private, max-age=${Math.max(0, Math.floor(config.configTtlMs / 1000))}`
    );
    return res.status(200).json(config);
  }
}
