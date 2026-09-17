import { randomBytes } from "crypto";

export const createPlanInviteCode = () => randomBytes(12).toString("base64url");
