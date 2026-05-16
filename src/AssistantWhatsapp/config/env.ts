export const assistantWhatsappEnv = {
  metaAccessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || "",
  metaPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || "",
  metaBusinessAccountId: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "",
  metaGraphApiVersion: process.env.META_WHATSAPP_GRAPH_API_VERSION || "v20.0",
  metaAppSecret: process.env.META_APP_SECRET || "",
  webhookVerifyToken: process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
  openAiApiKey: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.ASSISTANT_WHATSAPP_OPENAI_MODEL || "gpt-5.4-mini",
  sessionInactivityMinutes: Number(process.env.ASSISTANT_WHATSAPP_SESSION_TIMEOUT_MINUTES || 60),
  maxWhatsappTextLength: Number(process.env.ASSISTANT_WHATSAPP_MAX_TEXT_LENGTH || 3500),
  publicAppUrl:
    process.env.ASSISTANT_WHATSAPP_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.URL_FRONT ||
    process.env.WEB_FRONT_URL ||
    process.env.APP_URL ||
    "",
};

export function assertMetaWebhookConfig() {
  if (!assistantWhatsappEnv.webhookVerifyToken) {
    throw new Error("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured");
  }
}

export function assertMetaSendConfig() {
  const missing = [
    ["META_WHATSAPP_ACCESS_TOKEN", assistantWhatsappEnv.metaAccessToken],
    ["META_WHATSAPP_PHONE_NUMBER_ID", assistantWhatsappEnv.metaPhoneNumberId],
    ["META_WHATSAPP_GRAPH_API_VERSION", assistantWhatsappEnv.metaGraphApiVersion],
  ].filter(([, value]) => !value);

  if (missing.length) {
    throw new Error(`Missing Meta WhatsApp envs: ${missing.map(([key]) => key).join(", ")}`);
  }
}

export function assertMetaSignatureConfig() {
  if (!assistantWhatsappEnv.metaAppSecret) {
    throw new Error("META_APP_SECRET is not configured");
  }
}
