import Jwt from "jsonwebtoken";
import { createHmac } from "crypto";

const getAuthenticationSecret = () => {
  const secret = process.env.SECRET_JWT;
  if (!secret) throw new Error("SECRET_JWT is not configured");
  return secret;
};

const getPublicAccessSecret = () => {
  const configuredSecret = process.env.PUBLIC_ACCESS_JWT_SECRET?.trim();
  if (configuredSecret) return configuredSecret;

  return createHmac("sha256", getAuthenticationSecret())
    .update("smartbuild-public-access-v1")
    .digest("hex");
};

type RegistrationTokenPayload = {
  purpose: "company_registration";
  companyId: string;
  userId: string;
};

type EstimateTokenPayload = {
  purpose: "estimate_response";
  estimateId: string;
  email: string;
};

export const issueRegistrationToken = (companyId: string, userId: string) =>
  Jwt.sign(
    { purpose: "company_registration", companyId, userId } satisfies RegistrationTokenPayload,
    getPublicAccessSecret(),
    { algorithm: "HS256", expiresIn: "15m" }
  );

export const verifyRegistrationToken = (token: string) => {
  const payload = Jwt.verify(token, getPublicAccessSecret(), { algorithms: ["HS256"] }) as Partial<RegistrationTokenPayload>;
  if (payload.purpose !== "company_registration" || !payload.companyId || !payload.userId) {
    throw new Error("Invalid registration token");
  }
  return payload as RegistrationTokenPayload;
};

export const issueEstimatePublicToken = (estimateId: string, email: string) =>
  Jwt.sign(
    { purpose: "estimate_response", estimateId, email: email.trim().toLowerCase() } satisfies EstimateTokenPayload,
    getPublicAccessSecret(),
    { algorithm: "HS256", expiresIn: "90d" }
  );

export const verifyEstimatePublicToken = (token: string) => {
  const payload = Jwt.verify(token, getPublicAccessSecret(), { algorithms: ["HS256"] }) as Partial<EstimateTokenPayload>;
  if (payload.purpose !== "estimate_response" || !payload.estimateId || !payload.email) {
    throw new Error("Invalid estimate access token");
  }
  return payload as EstimateTokenPayload;
};
