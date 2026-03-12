export type AssistantThreadRow = {
  id: string;
  title: string | null;
  summary: string | null;
  companyId: string;
  userId: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastMessageContent?: string | null;
  lastMessageRole?: string | null;
};

export type AssistantMessageRow = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  report: unknown;
  toolsUsed: unknown;
  toolData: unknown;
  createdAt: Date;
};

export type AssistantChartMode = "bar" | "line" | "pie";

export type AssistantReportTable = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | boolean | null>[];
};

export type AssistantReport = {
  title: string;
  description: string;
  chartMode?: AssistantChartMode;
  chartData?: Record<string, string | number>[];
  metrics?: { label: string; value: string; tone?: "default" | "warning" | "success" }[];
  table?: AssistantReportTable | null;
};

export type AssistantStructuredResponse = {
  content: string;
  bullets?: string[];
  followUp?: string;
  report?: AssistantReport | null;
};

export type ExecutedTool = {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
};

export type AssistantToolData = {
  bullets?: string[];
  followUp?: string | null;
  executedTools?: ExecutedTool[];
} | null;
