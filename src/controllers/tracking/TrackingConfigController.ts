import { Request, Response } from "express";
import { getTrackingConfig } from "../../config/trackingConfig";
import {
  getEffectiveTrackingConfig,
  resolveTrackingConfigCompanyForUser,
  TrackingConfigAccessError,
} from "../../services/TrackingConfigService";

export class TrackingConfigController {
  async handle(req: Request, res: Response): Promise<Response> {
    const authUserId = (req as any).userId as string | undefined;
    if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

    // The native app owns the TTL/cache. Revalidation here lets a socket-triggered
    // refresh observe a newly saved configuration immediately.
    res.setHeader("Cache-Control", "private, no-cache, must-revalidate");

    try {
      const companyId = await resolveTrackingConfigCompanyForUser(
        authUserId,
        req.query.companyId
      );
      const config = await getEffectiveTrackingConfig(companyId);
      return res.status(200).json(config);
    } catch (error) {
      if (error instanceof TrackingConfigAccessError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      // During a rolling deployment (or a temporary config-table outage), tracking
      // remains operational with the exact environment/default contract used before.
      console.error("[TrackingConfigController] Falling back to environment config:", error);
      res.setHeader("X-Tracking-Config-Source", "environment-fallback");
      return res.status(200).json(getTrackingConfig());
    }
  }
}
