import { NextFunction, Request, Response } from "express";
import { checkToken } from "./checkToken";
import { prisma } from "../utils/prisma";
import { verifyEstimatePublicToken, verifyRegistrationToken } from "../utils/publicAccessTokens";

const getSingleHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function checkTokenOrRegistrationToken(req: Request, res: Response, next: NextFunction) {
  const registrationToken = getSingleHeader(req.headers["x-registration-token"])
    || (typeof req.body?.registrationToken === "string" ? req.body.registrationToken : undefined);

  if (!registrationToken) return checkToken(req, res, next);

  try {
    const payload = verifyRegistrationToken(registrationToken);
    if (payload.companyId !== req.body?.companyId) {
      return res.status(403).json({ error: "Registration token does not match company" });
    }
    (req as any).userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired registration token" });
  }
}

const decodeLegacyEmailToken = (token: string) => {
  try {
    if (token.includes(".")) return null;
    const decoded = Buffer.from(token.replace(/ /g, "+"), "base64").toString("utf8").trim().toLowerCase();
    return decoded.includes("@") ? decoded : null;
  } catch {
    return null;
  }
};

export async function checkTokenOrEstimatePublicAccess(req: Request, res: Response, next: NextFunction) {
  const publicToken = String(req.query.publicToken || req.body?.publicToken || req.body?.email || "").trim();

  if (!publicToken) return checkToken(req, res, next);

  const estimateId = req.params.id;
  try {
    const payload = verifyEstimatePublicToken(publicToken);
    if (payload.estimateId !== estimateId) {
      return res.status(403).json({ error: "Estimate token does not match resource" });
    }
    (req as any).publicEstimateAccess = true;
    (req as any).publicEstimateEmail = payload.email;
    return next();
  } catch {
    // Compatibility for links issued before signed public tokens existed.
    const legacyEmail = decodeLegacyEmailToken(publicToken);
    if (!legacyEmail) return res.status(401).json({ error: "Invalid or expired estimate access token" });

    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId },
        select: {
          project: {
            select: {
              client: { select: { email: true } },
            },
          },
        },
      });
      const clientEmail = estimate?.project?.client?.email?.trim().toLowerCase();
      if (!clientEmail || clientEmail !== legacyEmail) {
        return res.status(401).json({ error: "Invalid or expired estimate access token" });
      }

      (req as any).publicEstimateAccess = true;
      (req as any).publicEstimateEmail = legacyEmail;
      return next();
    } catch (error) {
      console.error("Failed to validate legacy estimate access token", { estimateId, error });
      return res.status(500).json({ error: "Failed to validate estimate access token" });
    }
  }
}
