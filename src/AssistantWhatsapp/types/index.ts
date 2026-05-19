export type AssistantWhatsappSessionStatus = "active" | "closed";

export type AssistantWhatsappClosedReason =
  | "inactivity"
  | "user_request"
  | "error";

export type AssistantWhatsappMessageRole = "user" | "assistant" | "system";

export type AssistantWhatsappMessageDirection = "inbound" | "outbound";

export type AssistantWhatsappSession = {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  status: AssistantWhatsappSessionStatus;
  openaiConversationId: string | null;
  lastResponseId: string | null;
  closedReason: AssistantWhatsappClosedReason | string | null;
  metadata: unknown;
  lastActivityAt: Date;
  closedAt: Date | null;
  date_creation: Date;
  date_update: Date;
};

export type AssistantWhatsappMessage = {
  id: string;
  sessionId: string;
  role: AssistantWhatsappMessageRole;
  direction: AssistantWhatsappMessageDirection;
  content: string;
  metaMessageId: string | null;
  rawPayload: unknown;
  toolData: unknown;
  createdAt: Date;
};

export type AssistantWhatsappToolResult = {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
};

export type AssistantWhatsappModelResult = {
  text: string;
  responseId: string | null;
  toolsUsed: AssistantWhatsappToolResult[];
};

export type MetaWhatsappTextMessage = {
  id: string;
  from: string;
  text: string;
  timestamp?: string;
  contactName?: string | null;
  raw: unknown;
};

export type KnowledgePlaybook = {
  id: string;
  module: "account" | "clients" | "estimates" | "settings" | "user_management";
  intent: string;
  terms: string[];
  route?: string;
  uiLocation: string;
  directAnswer: string;
  prerequisites: string[];
  commonMistakes: string[];
  bugSignals: string[];
  supportEscalationNote: string;
};
