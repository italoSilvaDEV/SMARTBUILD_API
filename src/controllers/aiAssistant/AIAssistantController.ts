import { Request, Response } from "express";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../utils/prisma";

type AssistantThreadRow = {
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

type AssistantMessageRow = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  report: unknown;
  toolsUsed: unknown;
  toolData: unknown;
  createdAt: Date;
};

type AssistantChartMode = "bar" | "line" | "pie";

type AssistantReport = {
  title: string;
  description: string;
  chartMode: AssistantChartMode;
  chartData: Record<string, string | number>[];
  metrics: { label: string; value: string; tone?: "default" | "warning" | "success" }[];
};

type AssistantStructuredResponse = {
  content: string;
  bullets?: string[];
  followUp?: string;
  report?: AssistantReport | null;
};

type ExecutedTool = {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
};

const openai = process.env.OPENAI_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_KEY })
  : null;

const SYSTEM_PROMPT = `
You are the SmartBuild AI Assistant for admin users.
You are consultative, analytical, and concise.
By default, reply in the same language used by the user unless they explicitly ask for another language.
You must use tools whenever data is needed.
You never invent project, client, invoice, or company numbers when tools are available.
Focus on operational and financial intelligence for construction businesses.
When relevant, combine multiple tools before answering.
Prefer specific numbers, rankings, gaps, risk signals and next actions.
Whenever you mention a project, always include the project address and client name when available.
Never use the client name as the project name.
If the user asks for a report, return a report payload.
`;

const SYNTHESIS_PROMPT = `
Return ONLY valid JSON with this shape:
{
  "content": "short executive answer",
  "bullets": ["insight 1", "insight 2"],
  "followUp": "optional next question",
  "report": {
    "title": "optional",
    "description": "optional",
    "chartMode": "bar|line|pie",
    "chartData": [{"label":"A","value":10}],
    "metrics": [{"label":"Total","value":"$100","tone":"default|warning|success"}]
  }
}
If no report is appropriate, set "report" to null.
Keep chartData compact and directly derived from the provided tool results.
Match the user's language naturally.
`;

const OPENAI_TIMEOUT_MS = 25000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number(String(value)) || 0;
  }
  return 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getProjectDisplayName(project: {
  id?: string;
  contract_number?: number | string | null;
  location?: string | null;
}) {
  const location = typeof project.location === "string" ? project.location.trim() : "";
  if (location) return location;
  if (project.contract_number != null && String(project.contract_number).trim()) {
    return `Project ${project.contract_number}`;
  }
  return `Project ${String(project.id || "").slice(0, 6) || "N/A"}`;
}

function getProjectReference(project: {
  id?: string;
  contract_number?: number | string | null;
  location?: string | null;
  client?: { id?: string; name?: string | null; email?: string | null } | null;
}) {
  return {
    projectName: getProjectDisplayName(project),
    projectAddress: project.location || null,
    client: project.client || null,
    clientName: project.client?.name || null,
  };
}

function summarizeTitle(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "New conversation";
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

function isGreetingQuestion(question: string) {
  const normalized = question.toLowerCase().trim();
  return ["oi", "olá", "ola", "hi", "hello", "hey", "e ai", "e aí"].includes(normalized);
}

function isCapabilityQuestion(question: string) {
  const normalized = question.toLowerCase();
  return (
    normalized.includes("what can you do") ||
    normalized.includes("what do you do") ||
    normalized.includes("how can you help") ||
    normalized.includes("oq vc sabe fazer") ||
    normalized.includes("o que voce sabe fazer") ||
    normalized.includes("o que você sabe fazer") ||
    normalized.includes("como voce pode ajudar") ||
    normalized.includes("como você pode ajudar")
  );
}

function normalizeStructuredResponse(
  response: AssistantStructuredResponse,
  fallback: AssistantStructuredResponse
): AssistantStructuredResponse {
  const content = typeof response?.content === "string" && response.content.trim()
    ? response.content.trim()
    : fallback.content;

  const bullets = Array.isArray(response?.bullets)
    ? response.bullets.filter((item) => typeof item === "string" && item.trim()).slice(0, 6)
    : fallback.bullets || [];

  const followUp = typeof response?.followUp === "string" && response.followUp.trim()
    ? response.followUp.trim()
    : fallback.followUp;

  const report = response?.report && response.report.chartData?.length
    ? response.report
    : fallback.report || null;

  return {
    content,
    bullets,
    followUp,
    report,
  };
}

function buildReportFromTool(tool: ExecutedTool): AssistantReport | null {
  if (!tool) return null;
  const output: any = tool.output;

  if (tool.tool === "top_spending_projects" && output?.items?.length) {
    return {
      title: "Top Spending Projects",
      description: "Projects ranked by highest accumulated cost.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Top project", value: output.items[0].projectAddress || output.items[0].projectName, tone: "warning" },
        { label: "Client", value: output.items[0].clientName || "Not available" },
        { label: "Top cost", value: formatCurrency(output.items[0].totalCost || 0) },
        { label: "Projects", value: String(output.items.length), tone: "success" },
      ],
    };
  }

  if (tool.tool === "invoice_aging" && output?.buckets?.length) {
    return {
      title: "Invoice Aging",
      description: "Distribution of open invoices by aging bucket.",
      chartMode: "pie",
      chartData: output.buckets,
      metrics: [
        { label: "Open AR", value: formatCurrency(output.totalOpen || 0), tone: "warning" },
        { label: "Buckets", value: String(output.buckets.length) },
      ],
    };
  }

  if (tool.tool === "receivables_by_client" && output?.items?.length) {
    return {
      title: "Receivables By Client",
      description: "Clients with the highest outstanding receivables.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.clientName,
        value: item.openAmount,
      })),
      metrics: [
        { label: "Top client", value: output.items[0].clientName, tone: "warning" },
        { label: "Top AR", value: formatCurrency(output.items[0].openAmount || 0) },
      ],
    };
  }

  if (tool.tool === "company_overview" && output?.totals) {
    return {
      title: "Company Overview",
      description: "Consolidated view of projects, clients and invoices.",
      chartMode: "bar",
      chartData: [
        { label: "Invoiced", value: output.totals.invoiced || 0 },
        { label: "Paid", value: output.totals.paid || 0 },
        { label: "Open", value: output.totals.open || 0 },
        { label: "Overdue", value: output.totals.overdue || 0 },
      ],
      metrics: [
        { label: "Projects", value: String(output.projectCount || 0) },
        { label: "Clients", value: String(output.clientCount || 0) },
        { label: "Invoices", value: String(output.invoiceCount || 0), tone: "success" },
      ],
    };
  }

  return null;
}

async function ensureCompanyAccess(userId: string, companyId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      company_id: true,
      companies: {
        select: {
          companyId: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const companyIds = new Set<string>();
  if (user.company_id) companyIds.add(user.company_id);
  for (const membership of user.companies) {
    if (membership.companyId) companyIds.add(membership.companyId);
  }

  if (!companyIds.has(companyId)) {
    throw new Error("Access denied for this company");
  }
}

async function getThreadById(threadId: string, companyId: string, userId: string) {
  const rows = await prisma.$queryRawUnsafe<AssistantThreadRow[]>(
    `
      SELECT
        t.id,
        t.title,
        t.summary,
        t.companyId,
        t.userId,
        t.lastMessageAt,
        t.createdAt,
        t.updatedAt
      FROM ai_assistant_threads t
      WHERE t.id = ? AND t.companyId = ? AND t.userId = ?
      LIMIT 1
    `,
    threadId,
    companyId,
    userId
  );

  return rows[0] || null;
}

async function listThreadMessages(threadId: string) {
  const rows = await prisma.$queryRawUnsafe<AssistantMessageRow[]>(
    `
      SELECT
        m.id,
        m.threadId,
        m.role,
        m.content,
        m.report,
        m.toolsUsed,
        m.toolData,
        m.createdAt
      FROM ai_assistant_messages m
      WHERE m.threadId = ?
      ORDER BY m.createdAt ASC
    `,
    threadId
  );

  return rows.map((message) => ({
    ...message,
    report: safeJsonParse(message.report, null),
    toolsUsed: safeJsonParse(message.toolsUsed, []),
    toolData: safeJsonParse(message.toolData, null),
  }));
}

async function insertMessage(params: {
  id?: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  report?: unknown;
  toolsUsed?: unknown;
  toolData?: unknown;
}) {
  const id = params.id || uuidv4();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO ai_assistant_messages
        (id, threadId, role, content, report, toolsUsed, toolData, createdAt)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    id,
    params.threadId,
    params.role,
    params.content,
    params.report ? JSON.stringify(params.report) : null,
    params.toolsUsed ? JSON.stringify(params.toolsUsed) : null,
    params.toolData ? JSON.stringify(params.toolData) : null
  );

  const rows = await prisma.$queryRawUnsafe<AssistantMessageRow[]>(
    `
      SELECT
        id, threadId, role, content, report, toolsUsed, toolData, createdAt
      FROM ai_assistant_messages
      WHERE id = ?
      LIMIT 1
    `,
    id
  );

  const message = rows[0];
  return {
    ...message,
    report: safeJsonParse(message?.report, null),
    toolsUsed: safeJsonParse(message?.toolsUsed, []),
    toolData: safeJsonParse(message?.toolData, null),
  };
}

function buildFallbackResponse(question: string, tools: ExecutedTool[]): AssistantStructuredResponse {
  const latestTool = tools[tools.length - 1];
  const base = latestTool?.output as any;

  if (latestTool?.tool === "top_spending_projects" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: `${topProject.projectName} is currently the highest-spending project in the selected period for ${topProject.clientName || "this client"}.`,
      bullets: [
        `Project address: ${topProject.projectAddress || topProject.projectName}.`,
        `Estimated total cost: ${formatCurrency(topProject.totalCost || 0)}.`,
        `${base.items.length} projects were evaluated for this ranking.`,
      ],
      followUp: "I can break this down by materials, labor and invoice impact.",
      report: {
        title: "Top Spending Projects",
        description: "Projects ranked by total cost exposure.",
        chartMode: "bar",
        chartData: base.items.slice(0, 5).map((item: any) => ({
          label: item.projectAddress || item.projectName,
          value: item.totalCost,
        })),
        metrics: [
          { label: "Top project", value: topProject.projectAddress || topProject.projectName, tone: "warning" },
          { label: "Client", value: topProject.clientName || "Not available" },
          { label: "Top cost", value: formatCurrency(topProject.totalCost || 0) },
          { label: "Projects analyzed", value: String(base.items.length), tone: "success" },
        ],
      },
    };
  }

  if (isCapabilityQuestion(question)) {
    return {
      content: "I can query live SmartBuild data and answer in a consultative way.",
      bullets: [
        "Search projects, clients, invoices, estimates and time cards.",
        "Compare cost, revenue, margin, risk and receivables.",
        "Generate executive reports with charts directly in the conversation.",
      ],
      followUp: "If you want, I can start with a project, a client, or a financial report.",
      report: null,
    };
  }

  if (isGreetingQuestion(question)) {
    return {
      content: "Hi. I can help with projects, clients, invoices, time cards and SmartBuild reports.",
      bullets: [
        "Ask about cost, margin, delays, receivables or performance.",
      ],
      followUp: "If you want, I can start with a project review or a financial summary.",
      report: null,
    };
  }

  return {
    content: `I understand your question about "${question}".`,
    bullets: [
      "I can go deeper using project, client, invoice, time card or reporting data.",
    ],
    followUp: "If you want, I can reframe this with a more financial, operational, or client-focused angle.",
    report: null,
  };
}

function inferFallbackToolSequence(question: string): string[] {
  const normalized = question.toLowerCase();
  if (isGreetingQuestion(question) || isCapabilityQuestion(question)) {
    return [];
  }
  if (normalized.includes("gasto") || normalized.includes("cost") || normalized.includes("gastando")) {
    return ["top_spending_projects"];
  }
  if (normalized.includes("margem") || normalized.includes("margin")) {
    return ["company_overview", "top_spending_projects"];
  }
  if (normalized.includes("invoice") || normalized.includes("receber") || normalized.includes("aging")) {
    return ["invoice_aging", "overdue_invoices", "receivables_by_client"];
  }
  if (normalized.includes("cliente") || normalized.includes("client")) {
    return ["list_clients", "receivables_by_client"];
  }
  if (normalized.includes("estimate")) {
    return ["estimate_summary"];
  }
  return ["company_overview"];
}

export class AIAssistantController {
  private async createWelcomeMessage(threadId: string) {
    return insertMessage({
      threadId,
      role: "assistant",
      content:
        "I’m your SmartBuild AI Assistant. Ask about projects, clients, invoices, margins or reports, and I’ll answer with live business data.",
      toolsUsed: ["Projects", "Clients", "Invoices", "Financials"],
    });
  }

  private async executeTool(
    toolName: string,
    rawArgs: string,
    companyId: string
  ): Promise<ExecutedTool> {
    const input = safeJsonParse<Record<string, unknown>>(rawArgs, {});

    switch (toolName) {
      case "list_projects":
        return {
          tool: toolName,
          input,
          output: await this.listProjects(companyId, input),
        };
      case "get_project_details":
        return {
          tool: toolName,
          input,
          output: await this.getProjectDetails(companyId, String(input.projectId || "")),
        };
      case "top_spending_projects":
        return {
          tool: toolName,
          input,
          output: await this.topSpendingProjects(companyId, input),
        };
      case "list_clients":
        return {
          tool: toolName,
          input,
          output: await this.listClients(companyId, input),
        };
      case "get_client_details":
        return {
          tool: toolName,
          input,
          output: await this.getClientDetails(companyId, String(input.clientId || "")),
        };
      case "invoice_summary":
        return {
          tool: toolName,
          input,
          output: await this.invoiceSummary(companyId, input),
        };
      case "list_invoices":
        return {
          tool: toolName,
          input,
          output: await this.listInvoices(companyId, input),
        };
      case "invoice_aging":
        return {
          tool: toolName,
          input,
          output: await this.invoiceAging(companyId, input),
        };
      case "overdue_invoices":
        return {
          tool: toolName,
          input,
          output: await this.overdueInvoices(companyId, input),
        };
      case "receivables_by_client":
        return {
          tool: toolName,
          input,
          output: await this.receivablesByClient(companyId, input),
        };
      case "project_cost_breakdown":
        return {
          tool: toolName,
          input,
          output: await this.projectCostBreakdown(companyId, String(input.projectId || "")),
        };
      case "project_margin_analysis":
        return {
          tool: toolName,
          input,
          output: await this.projectMarginAnalysis(companyId, String(input.projectId || "")),
        };
      case "project_schedule_risk":
        return {
          tool: toolName,
          input,
          output: await this.projectScheduleRisk(companyId, String(input.projectId || "")),
        };
      case "estimate_summary":
        return {
          tool: toolName,
          input,
          output: await this.estimateSummary(companyId, input),
        };
      case "project_vs_estimate":
        return {
          tool: toolName,
          input,
          output: await this.projectVsEstimate(companyId, String(input.projectId || "")),
        };
      case "change_order_summary":
        return {
          tool: toolName,
          input,
          output: await this.changeOrderSummary(companyId, input),
        };
      case "timecard_summary":
        return {
          tool: toolName,
          input,
          output: await this.timecardSummary(companyId, input),
        };
      case "subcontractor_summary":
        return {
          tool: toolName,
          input,
          output: await this.subcontractorSummary(companyId, input),
        };
      case "company_overview":
        return {
          tool: toolName,
          input,
          output: await this.companyOverview(companyId),
        };
      default:
        return {
          tool: toolName,
          input,
          output: { error: `Tool ${toolName} is not implemented` },
        };
    }
  }

  private getTools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "list_projects",
          description: "Search projects for the current company by name, contract number or status.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_project_details",
          description: "Get detailed operational and financial data for a single project.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
            required: ["projectId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "project_cost_breakdown",
          description: "Break down project costs by materials and labor.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
            required: ["projectId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "project_margin_analysis",
          description: "Compare project sold value versus cost and invoices.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
            required: ["projectId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "project_schedule_risk",
          description: "Assess project risk based on deadline, services, tasks and delays.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
            required: ["projectId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "top_spending_projects",
          description: "Rank projects by total spending using material and labor costs.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "list_clients",
          description: "Search clients and summarize their project/invoice footprint.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_client_details",
          description: "Get detailed information for one client including projects and invoice metrics.",
          parameters: {
            type: "object",
            properties: {
              clientId: { type: "string" },
            },
            required: ["clientId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "list_invoices",
          description: "List invoices with filters by status, project or client.",
          parameters: {
            type: "object",
            properties: {
              status: { type: "array", items: { type: "string" } },
              limit: { type: "number" },
              projectId: { type: "string" },
              clientId: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "invoice_summary",
          description: "Summarize invoices for the company, with overdue and payment signals.",
          parameters: {
            type: "object",
            properties: {
              status: { type: "array", items: { type: "string" } },
              overdueOnly: { type: "boolean" },
              limit: { type: "number" },
              projectId: { type: "string" },
              clientId: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "invoice_aging",
          description: "Group open invoices by aging bucket.",
          parameters: {
            type: "object",
            properties: {
              clientId: { type: "string" },
              projectId: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "overdue_invoices",
          description: "List overdue invoices with due dates and client context.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number" },
              clientId: { type: "string" },
              projectId: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "receivables_by_client",
          description: "Aggregate open receivables by client.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "estimate_summary",
          description: "Summarize estimates by project or status.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "project_vs_estimate",
          description: "Compare a project's sold amount, latest estimate, invoiced amount and costs.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
            required: ["projectId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "change_order_summary",
          description: "Summarize change orders by project or overall company.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "timecard_summary",
          description: "Summarize labor cost and hours from worked hours/time cards.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "subcontractor_summary",
          description: "Summarize subcontractor spend and hours by project or company.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "company_overview",
          description: "Get overall company numbers for projects, clients and invoices.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
    ];
  }

  private async synthesizeResponse(question: string, history: AssistantMessageRow[], companyId: string) {
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: question },
    ];

    const executedTools: ExecutedTool[] = [];

    if (openai) {
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const completion = await withTimeout(openai.chat.completions.create({
            model: "gpt-5-mini",
            messages,
            tools: this.getTools(),
            tool_choice: "auto",
          }), OPENAI_TIMEOUT_MS, "assistant tool planning");

          const assistantMessage = completion.choices[0]?.message;
          if (!assistantMessage) break;

          if (assistantMessage.tool_calls?.length) {
            messages.push(assistantMessage);

            for (const toolCall of assistantMessage.tool_calls) {
              const functionCall = (toolCall as any).function;
              const toolResult = await this.executeTool(
                functionCall?.name || "",
                functionCall?.arguments || "{}",
                companyId
              );

              executedTools.push(toolResult);
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult.output),
              });
            }

            continue;
          }

          if (!assistantMessage.tool_calls?.length && !executedTools.length && assistantMessage.content?.trim()) {
            return {
              structured: normalizeStructuredResponse(
                {
                  content: assistantMessage.content.trim(),
                  bullets: [],
                  followUp: undefined,
                  report: null,
                },
                buildFallbackResponse(question, [])
              ),
              executedTools: [],
            };
          }

          break;
        }

        if (executedTools.length === 0) {
          const fallbackTools = inferFallbackToolSequence(question);
          for (const toolName of fallbackTools) {
            executedTools.push(await this.executeTool(toolName, "{}", companyId));
          }
        }

        const synthesisCompletion = await withTimeout(openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [
            { role: "system", content: SYNTHESIS_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                question,
                tools: executedTools,
              }),
            },
          ],
        }), OPENAI_TIMEOUT_MS, "assistant synthesis");

        const rawContent = synthesisCompletion.choices[0]?.message?.content || "{}";
        const fallback = buildFallbackResponse(question, executedTools);
        const structured = normalizeStructuredResponse(
          safeJsonParse<AssistantStructuredResponse>(rawContent, fallback),
          {
            ...fallback,
            report: fallback.report || buildReportFromTool(executedTools[0]) || null,
          }
        );

        return {
          structured,
          executedTools,
        };
      } catch (error) {
        console.error("[AIAssistantController.synthesizeResponse] OpenAI fallback:", error);
      }
    }

    const tools: ExecutedTool[] = [];
    for (const toolName of inferFallbackToolSequence(question)) {
      tools.push(await this.executeTool(toolName, "{}", companyId));
    }
    const fallback = buildFallbackResponse(question, tools);
    return {
      structured: normalizeStructuredResponse(fallback, {
        ...fallback,
        report: fallback.report || buildReportFromTool(tools[0]) || null,
      }),
      executedTools: tools,
    };
  }

  private async listProjects(companyId: string, input: Record<string, unknown>) {
    const search = String(input.search || "").trim();
    const limit = Math.min(Number(input.limit || 8) || 8, 20);
    const status = Array.isArray(input.status) ? input.status.map(String) : [];

    const projects = await prisma.project.findMany({
      where: {
        company_id: companyId,
        ...(status.length ? { status_project: { in: status } } : {}),
        ...(search
          ? {
              OR: [
                { client: { name: { contains: search } } },
                { location: { contains: search } },
                { status_project: { contains: search } },
                ...(Number.isFinite(Number(search))
                  ? [{ contract_number: { equals: Number(search) } }]
                  : []),
              ],
            }
          : {}),
      },
      take: limit,
      orderBy: { date_creation: "desc" },
      select: {
        id: true,
        contract_number: true,
        status_project: true,
        price: true,
        start_date: true,
        deadline: true,
        amountPaid: true,
        balanceDue: true,
        location: true,
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        serviceProject: {
          select: {
            id: true,
          },
        },
        invoices: {
          select: {
            id: true,
          },
        },
      },
    });

    return {
      total: projects.length,
      items: projects.map((project) => ({
        id: project.id,
        ...getProjectReference(project),
        contractNumber: project.contract_number,
        status: project.status_project,
        price: decimalToNumber(project.price),
        amountPaid: decimalToNumber(project.amountPaid),
        balanceDue: decimalToNumber(project.balanceDue),
        startDate: project.start_date,
        deadline: project.deadline,
        location: project.location,
        serviceCount: project.serviceProject.length,
        invoiceCount: project.invoices.length,
      })),
    };
  }

  private async getProjectDetails(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: {
        id: projectId,
        company_id: companyId,
      },
      select: {
        id: true,
        contract_number: true,
        price: true,
        status_project: true,
        start_date: true,
        deadline: true,
        amountPaid: true,
        balanceDue: true,
        location: true,
        date_creation: true,
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city_and_state: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        project_manager: {
          select: {
            id: true,
            name: true,
          },
        },
        serviceProject: {
          select: {
            id: true,
            name: true,
            description: true,
            hours: true,
            price: true,
            status: true,
            start_date: true,
            deadline: true,
            stages: {
              select: {
                id: true,
                check: true,
              },
            },
            costProject: {
              select: {
                id: true,
                material_name: true,
                price: true,
                amout: true,
                transaction_type: true,
                cost_date: true,
              },
            },
            Activities: {
              select: {
                id: true,
              },
            },
            photos: {
              select: {
                id: true,
              },
            },
          },
        },
        workedHours: {
          select: {
            id: true,
            amount_of_hours: true,
            hourly_price: true,
            fixed_price: true,
            type_price: true,
          },
        },
        invoices: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            dueDate: true,
            createdAt: true,
            invoiceType: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        estimates: {
          select: {
            id: true,
          },
        },
        projectFiles: {
          select: {
            id: true,
          },
        },
        projectPastes: {
          select: {
            id: true,
          },
        },
        tasks: {
          select: {
            id: true,
            status: true,
          },
        },
        changeOrders: {
          select: {
            id: true,
            status: true,
            total_amount: true,
          },
        },
      },
    });

    if (!project) {
      return { error: "Project not found" };
    }

    const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
      return (
        acc +
        service.costProject.reduce((serviceAcc: number, cost: any) => {
          return serviceAcc + decimalToNumber(cost.price) * Number(cost.amout || 0);
        }, 0)
      );
    }, 0);

    const laborCost = project.workedHours.reduce((acc: number, item: any) => {
      if (item.type_price === "fixed") return acc + decimalToNumber(item.fixed_price);
      return acc + decimalToNumber(item.amount_of_hours) * decimalToNumber(item.hourly_price);
    }, 0);

    const invoicedAmount = project.invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);

    return {
      id: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      status: project.status_project,
      startDate: project.start_date,
      deadline: project.deadline,
      createdAt: project.date_creation,
      location: project.location,
      price: decimalToNumber(project.price),
      amountPaid: decimalToNumber(project.amountPaid),
      balanceDue: decimalToNumber(project.balanceDue),
      seller: project.user,
      projectManager: project.project_manager,
      services: project.serviceProject.map((service: any) => ({
        id: service.id,
        name: service.name,
        status: service.status,
        hours: decimalToNumber(service.hours),
        price: decimalToNumber(service.price),
        stageCompletion:
          service.stages.length > 0
            ? service.stages.filter((stage: any) => stage.check).length / service.stages.length
            : 0,
        costItems: service.costProject.length,
        photos: service.photos.length,
        activities: service.Activities.length,
      })),
      financials: {
        materialCost,
        laborCost,
        totalCost: materialCost + laborCost,
        invoicedAmount,
      },
      invoices: project.invoices.map((invoice: any) => ({
        id: invoice.id,
        status: invoice.status,
        totalAmount: decimalToNumber(invoice.totalAmount),
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
        invoiceType: invoice.invoiceType,
      })),
      counts: {
        estimates: project.estimates.length,
        files: project.projectFiles.length,
        folders: project.projectPastes.length,
        tasks: project.tasks.length,
        changeOrders: project.changeOrders.length,
      },
    };
  }

  private async topSpendingProjects(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 5) || 5, 10);
    const projects: any[] = await prisma.project.findMany({
      where: {
        company_id: companyId,
      },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: {
          select: {
            name: true,
          },
        },
        serviceProject: {
          select: {
            name: true,
            costProject: {
              select: {
                price: true,
                amout: true,
              },
            },
          },
        },
        workedHours: {
          select: {
            amount_of_hours: true,
            hourly_price: true,
            fixed_price: true,
            type_price: true,
          },
        },
      },
    });

    const items = projects
      .map((project: any) => {
        const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
          return (
            acc +
            service.costProject.reduce((costAcc: number, cost: any) => {
              return costAcc + decimalToNumber(cost.price) * Number(cost.amout || 0);
            }, 0)
          );
        }, 0);

        const laborCost = project.workedHours.reduce((acc: number, work: any) => {
          if (work.type_price === "fixed") return acc + decimalToNumber(work.fixed_price);
          return acc + decimalToNumber(work.amount_of_hours) * decimalToNumber(work.hourly_price);
        }, 0);

        return {
          projectId: project.id,
          ...getProjectReference(project),
          contractNumber: project.contract_number,
          materialCost,
          laborCost,
          totalCost: materialCost + laborCost,
        };
      })
      .sort((a: any, b: any) => b.totalCost - a.totalCost)
      .slice(0, limit);

    return {
      total: items.length,
      items,
    };
  }

  private async projectCostBreakdown(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { name: true } },
        serviceProject: {
          select: {
            costProject: {
              select: {
                material_name: true,
                price: true,
                amout: true,
                transaction_type: true,
              },
            },
          },
        },
        workedHours: {
          select: {
            amount_of_hours: true,
            hourly_price: true,
            fixed_price: true,
            type_price: true,
            subcontractor: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    let materialCost = 0;
    let laborCost = 0;
    let subcontractorCost = 0;
    const byMaterial: Record<string, number> = {};

    for (const service of project.serviceProject) {
      for (const cost of service.costProject) {
        const total = decimalToNumber(cost.price) * Number(cost.amout || 0);
        materialCost += total;
        byMaterial[cost.material_name || "Uncategorized"] = (byMaterial[cost.material_name || "Uncategorized"] || 0) + total;
      }
    }

    for (const item of project.workedHours) {
      const total = item.type_price === "fixed"
        ? decimalToNumber(item.fixed_price)
        : decimalToNumber(item.amount_of_hours) * decimalToNumber(item.hourly_price);
      laborCost += total;
      if (item.subcontractor) subcontractorCost += total;
    }

    return {
      projectId: project.id,
      ...getProjectReference(project),
      totals: {
        materialCost,
        laborCost,
        subcontractorCost,
        internalLaborCost: laborCost - subcontractorCost,
        totalCost: materialCost + laborCost,
      },
      topMaterials: Object.entries(byMaterial)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }

  private async projectMarginAnalysis(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: {
        id: true,
        contract_number: true,
        location: true,
        price: true,
        amountPaid: true,
        balanceDue: true,
        client: { select: { name: true } },
        invoices: { select: { totalAmount: true, status: true } },
        serviceProject: {
          select: {
            costProject: { select: { price: true, amout: true } },
          },
        },
        workedHours: {
          select: {
            amount_of_hours: true,
            hourly_price: true,
            fixed_price: true,
            type_price: true,
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const soldValue = decimalToNumber(project.price);
    const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
      return acc + service.costProject.reduce((inner: number, cost: any) => inner + decimalToNumber(cost.price) * Number(cost.amout || 0), 0);
    }, 0);
    const laborCost = project.workedHours.reduce((acc: number, item: any) => {
      return acc + (item.type_price === "fixed"
        ? decimalToNumber(item.fixed_price)
        : decimalToNumber(item.amount_of_hours) * decimalToNumber(item.hourly_price));
    }, 0);
    const totalCost = materialCost + laborCost;
    const invoiced = project.invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);
    const marginValue = soldValue - totalCost;
    const marginPct = soldValue > 0 ? marginValue / soldValue : 0;

    return {
      projectId: project.id,
      ...getProjectReference(project),
      soldValue,
      invoiced,
      amountPaid: decimalToNumber(project.amountPaid),
      balanceDue: decimalToNumber(project.balanceDue),
      costs: {
        materialCost,
        laborCost,
        totalCost,
      },
      margin: {
        value: marginValue,
        percentage: marginPct,
      },
    };
  }

  private async projectScheduleRisk(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: {
        id: true,
        contract_number: true,
        location: true,
        start_date: true,
        deadline: true,
        status_project: true,
        client: { select: { name: true } },
        serviceProject: {
          select: {
            id: true,
            name: true,
            status: true,
            start_date: true,
            deadline: true,
            stages: { select: { check: true } },
          },
        },
        tasks: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const now = new Date();
    const deadline = project.deadline ? new Date(project.deadline) : null;
    const daysToDeadline = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const stalledServices = project.serviceProject.filter((service: any) => {
      const completion = service.stages.length > 0 ? service.stages.filter((stage: any) => stage.check).length / service.stages.length : 0;
      return completion < 0.5 && service.status && !["completed", "done", "finished"].includes(String(service.status).toLowerCase());
    }).length;
    const openTasks = project.tasks.filter((task: any) => !["DONE", "COMPLETED", "CLOSED"].includes(String(task.status || "").toUpperCase())).length;

    let riskScore = 0;
    if (daysToDeadline !== null && daysToDeadline < 0) riskScore += 45;
    else if (daysToDeadline !== null && daysToDeadline <= 7) riskScore += 25;
    riskScore += Math.min(stalledServices * 10, 30);
    riskScore += Math.min(openTasks * 2, 25);

    return {
      projectId: project.id,
      ...getProjectReference(project),
      status: project.status_project,
      deadline: project.deadline,
      daysToDeadline,
      stalledServices,
      openTasks,
      riskScore,
      riskLevel: riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low",
    };
  }

  private async listClients(companyId: string, input: Record<string, unknown>) {
    const search = String(input.search || "").trim();
    const limit = Math.min(Number(input.limit || 8) || 8, 20);

    const clients = await prisma.client.findMany({
      where: {
        company_id: companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      take: limit,
      orderBy: { date_creation: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city_and_state: true,
        projects: {
          select: {
            id: true,
            invoices: {
              select: {
                id: true,
                totalAmount: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return {
      total: clients.length,
      items: clients.map((client: any) => {
        const invoices = client.projects.flatMap((project: any) => project.invoices);
        const revenue = invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);
        return {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          cityAndState: client.city_and_state,
          projectCount: client.projects.length,
          invoiceCount: invoices.length,
          invoicedAmount: revenue,
        };
      }),
    };
  }

  private async getClientDetails(companyId: string, clientId: string) {
    const client: any = await prisma.client.findFirst({
      where: {
        id: clientId,
        company_id: companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city_and_state: true,
        addressOffice: true,
        date_creation: true,
        projects: {
          select: {
            id: true,
            contract_number: true,
            status_project: true,
            price: true,
            amountPaid: true,
            balanceDue: true,
            invoices: {
              select: {
                id: true,
                status: true,
                totalAmount: true,
                dueDate: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      return { error: "Client not found" };
    }

    const invoices = client.projects.flatMap((project: any) => project.invoices);
    const invoicedAmount = invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);
    const overdueCount = invoices.filter((invoice: any) => {
      return invoice.status !== "paid" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
    }).length;

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      cityAndState: client.city_and_state,
      address: client.addressOffice,
      createdAt: client.date_creation,
      projects: client.projects.map((project: any) => ({
        id: project.id,
        contractNumber: project.contract_number,
        status: project.status_project,
        price: decimalToNumber(project.price),
        amountPaid: decimalToNumber(project.amountPaid),
        balanceDue: decimalToNumber(project.balanceDue),
        invoiceCount: project.invoices.length,
      })),
      financials: {
        projectCount: client.projects.length,
        invoiceCount: invoices.length,
        invoicedAmount,
        overdueCount,
      },
    };
  }

  private async invoiceSummary(companyId: string, input: Record<string, unknown>) {
    const status = Array.isArray(input.status) ? input.status.map(String) : [];
    const overdueOnly = Boolean(input.overdueOnly);
    const limit = Math.min(Number(input.limit || 10) || 10, 30);
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const clientId = input.clientId ? String(input.clientId) : undefined;

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        ...(status.length ? { status: { in: status } } : {}),
        ...(projectId ? { projectId } : {}),
        ...(clientId ? { project: { client_id: clientId } } : {}),
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        dueDate: true,
        createdAt: true,
        invoiceType: true,
        project: {
          select: {
            id: true,
            contract_number: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const filtered = overdueOnly
      ? invoices.filter((invoice: any) => invoice.status !== "paid" && invoice.dueDate && new Date(invoice.dueDate) < new Date())
      : invoices;

    const totals = filtered.reduce(
      (acc: any, invoice: any) => {
        const amount = decimalToNumber(invoice.totalAmount);
        acc.total += amount;
        if (invoice.status === "paid") acc.paid += amount;
        else acc.open += amount;
        if (invoice.status !== "paid" && invoice.dueDate && new Date(invoice.dueDate) < new Date()) acc.overdue += amount;
        return acc;
      },
      { total: 0, paid: 0, open: 0, overdue: 0 }
    );

    return {
      totalCount: filtered.length,
      totals,
      items: filtered.map((invoice: any) => ({
        id: invoice.id,
        status: invoice.status,
        totalAmount: decimalToNumber(invoice.totalAmount),
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
        invoiceType: invoice.invoiceType,
        projectId: invoice.project?.id,
        contractNumber: invoice.project?.contract_number,
        client: invoice.project?.client,
      })),
    };
  }

  private async listInvoices(companyId: string, input: Record<string, unknown>) {
    const status = Array.isArray(input.status) ? input.status.map(String) : [];
    const limit = Math.min(Number(input.limit || 15) || 15, 50);
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const clientId = input.clientId ? String(input.clientId) : undefined;

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        ...(status.length ? { status: { in: status } } : {}),
        ...(projectId ? { projectId } : {}),
        ...(clientId ? { project: { client_id: clientId } } : {}),
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        dueDate: true,
        createdAt: true,
        invoiceType: true,
        project: {
          select: {
            id: true,
            contract_number: true,
            location: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      total: invoices.length,
      items: invoices.map((invoice: any) => ({
        id: invoice.id,
        status: invoice.status,
        totalAmount: decimalToNumber(invoice.totalAmount),
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
        invoiceType: invoice.invoiceType,
        projectId: invoice.project?.id,
        contractNumber: invoice.project?.contract_number,
        client: invoice.project?.client,
      })),
    };
  }

  private async invoiceAging(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const clientId = input.clientId ? String(input.clientId) : undefined;
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { not: "paid" },
        ...(projectId ? { projectId } : {}),
        ...(clientId ? { project: { client_id: clientId } } : {}),
      },
      select: {
        id: true,
        totalAmount: true,
        dueDate: true,
        project: { select: { client: { select: { name: true } } } },
      },
    });

    const now = new Date();
    const buckets = {
      current: 0,
      "1_15": 0,
      "16_30": 0,
      "31_plus": 0,
      no_due_date: 0,
    };

    for (const invoice of invoices) {
      const amount = decimalToNumber(invoice.totalAmount);
      if (!invoice.dueDate) {
        buckets.no_due_date += amount;
        continue;
      }
      const diff = Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      if (diff <= 0) buckets.current += amount;
      else if (diff <= 15) buckets["1_15"] += amount;
      else if (diff <= 30) buckets["16_30"] += amount;
      else buckets["31_plus"] += amount;
    }

    return {
      totalOpen: invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0),
      buckets: [
        { label: "Current", value: buckets.current },
        { label: "1-15 days", value: buckets["1_15"] },
        { label: "16-30 days", value: buckets["16_30"] },
        { label: "31+ days", value: buckets["31_plus"] },
        { label: "No due date", value: buckets.no_due_date },
      ],
    };
  }

  private async overdueInvoices(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 10) || 10, 30);
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const clientId = input.clientId ? String(input.clientId) : undefined;
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { not: "paid" },
        dueDate: { not: null, lt: new Date() },
        ...(projectId ? { projectId } : {}),
        ...(clientId ? { project: { client_id: clientId } } : {}),
      },
      take: limit,
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        dueDate: true,
        project: {
          select: {
            id: true,
            contract_number: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      total: invoices.length,
      overdueAmount: invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0),
      items: invoices.map((invoice: any) => ({
        id: invoice.id,
        status: invoice.status,
        totalAmount: decimalToNumber(invoice.totalAmount),
        dueDate: invoice.dueDate,
        client: invoice.project?.client,
        contractNumber: invoice.project?.contract_number,
      })),
    };
  }

  private async receivablesByClient(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 10) || 10, 25);
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { not: "paid" },
      },
      select: {
        totalAmount: true,
        dueDate: true,
        project: {
          select: {
            client: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const byClient = new Map<string, { clientId: string; clientName: string; email: string | null; openAmount: number; overdueAmount: number; invoiceCount: number }>();
    const now = new Date();

    for (const invoice of invoices) {
      const client = invoice.project?.client;
      if (!client) continue;
      const key = client.id;
      const amount = decimalToNumber(invoice.totalAmount);
      const current = byClient.get(key) || {
        clientId: client.id,
        clientName: client.name,
        email: client.email || null,
        openAmount: 0,
        overdueAmount: 0,
        invoiceCount: 0,
      };
      current.openAmount += amount;
      current.invoiceCount += 1;
      if (invoice.dueDate && new Date(invoice.dueDate) < now) current.overdueAmount += amount;
      byClient.set(key, current);
    }

    return {
      totalClients: byClient.size,
      items: Array.from(byClient.values())
        .sort((a, b) => b.openAmount - a.openAmount)
        .slice(0, limit),
    };
  }

  private async estimateSummary(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const status = Array.isArray(input.status) ? input.status.map(String) : [];
    const limit = Math.min(Number(input.limit || 12) || 12, 30);
    const estimates = await prisma.estimate.findMany({
      where: {
        project: { company_id: companyId },
        ...(projectId ? { projectId } : {}),
        ...(status.length ? { status: { in: status } } : {}),
      },
      take: limit,
      orderBy: { date_creation: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        balanceDue: true,
        project: {
          select: {
            id: true,
            contract_number: true,
            client: { select: { id: true, name: true } },
          },
        },
        changeOrders: {
          select: {
            id: true,
            total_amount: true,
            status: true,
          },
        },
      },
    });

    return {
      total: estimates.length,
      totals: {
        amount: estimates.reduce((acc: number, estimate: any) => acc + decimalToNumber(estimate.totalAmount), 0),
        paid: estimates.reduce((acc: number, estimate: any) => acc + decimalToNumber(estimate.amountPaid), 0),
        balance: estimates.reduce((acc: number, estimate: any) => acc + decimalToNumber(estimate.balanceDue), 0),
      },
      items: estimates.map((estimate: any) => ({
        id: estimate.id,
        number: estimate.number,
        status: estimate.status,
        totalAmount: decimalToNumber(estimate.totalAmount),
        amountPaid: decimalToNumber(estimate.amountPaid),
        balanceDue: decimalToNumber(estimate.balanceDue),
        projectId: estimate.project.id,
        projectName: getProjectDisplayName(estimate.project),
        projectAddress: estimate.project.location || null,
        contractNumber: estimate.project.contract_number,
        client: estimate.project.client,
        changeOrderCount: estimate.changeOrders.length,
        approvedChangeOrdersValue: estimate.changeOrders
          .filter((item: any) => String(item.status) === "approved")
          .reduce((acc: number, item: any) => acc + decimalToNumber(item.total_amount), 0),
      })),
    };
  }

  private async projectVsEstimate(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: {
        id: true,
        contract_number: true,
        location: true,
        price: true,
        client: { select: { name: true } },
        invoices: { select: { totalAmount: true, status: true } },
        workedHours: { select: { amount_of_hours: true, hourly_price: true, fixed_price: true, type_price: true } },
        serviceProject: {
          select: {
            costProject: { select: { price: true, amout: true } },
          },
        },
        estimates: {
          select: {
            id: true,
            number: true,
            status: true,
            totalAmount: true,
            approvedAt: true,
          },
          orderBy: { approvedAt: "desc" },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const latestEstimate = project.estimates[0] || null;
    const estimateValue = latestEstimate ? decimalToNumber(latestEstimate.totalAmount) : 0;
    const invoiced = project.invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);
    const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
      return acc + service.costProject.reduce((inner: number, cost: any) => inner + decimalToNumber(cost.price) * Number(cost.amout || 0), 0);
    }, 0);
    const laborCost = project.workedHours.reduce((acc: number, item: any) => {
      return acc + (item.type_price === "fixed" ? decimalToNumber(item.fixed_price) : decimalToNumber(item.amount_of_hours) * decimalToNumber(item.hourly_price));
    }, 0);
    const totalCost = materialCost + laborCost;

    return {
      projectId: project.id,
      ...getProjectReference(project),
      soldValue: decimalToNumber(project.price),
      latestEstimate: latestEstimate
        ? {
            id: latestEstimate.id,
            number: latestEstimate.number,
            status: latestEstimate.status,
            totalAmount: estimateValue,
          }
        : null,
      invoiced,
      costs: {
        materialCost,
        laborCost,
        totalCost,
      },
      deltas: {
        soldVsEstimate: decimalToNumber(project.price) - estimateValue,
        soldVsCost: decimalToNumber(project.price) - totalCost,
        estimateVsCost: estimateValue - totalCost,
      },
    };
  }

  private async changeOrderSummary(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const limit = Math.min(Number(input.limit || 10) || 10, 25);
    const rows: any[] = await prisma.changeOrder.findMany({
      where: {
        ...(projectId ? { projectId } : { project: { company_id: companyId } }),
      },
      take: limit,
      orderBy: { date_creation: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        total_amount: true,
        date_creation: true,
        project: {
          select: {
            id: true,
            contract_number: true,
            location: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      total: rows.length,
      totals: {
        approved: rows.filter((row: any) => String(row.status) === "approved").reduce((acc: number, row: any) => acc + decimalToNumber(row.total_amount), 0),
        pending: rows.filter((row: any) => String(row.status) === "pending").reduce((acc: number, row: any) => acc + decimalToNumber(row.total_amount), 0),
        canceled: rows.filter((row: any) => String(row.status) === "canceled").reduce((acc: number, row: any) => acc + decimalToNumber(row.total_amount), 0),
      },
      items: rows.map((row: any) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        totalAmount: decimalToNumber(row.total_amount),
        createdAt: row.date_creation,
        projectId: row.project?.id,
        projectName: row.project ? getProjectDisplayName(row.project) : null,
        projectAddress: row.project?.location || null,
        contractNumber: row.project?.contract_number,
        client: row.project?.client,
      })),
    };
  }

  private async timecardSummary(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const workedHours = await prisma.workedhours.findMany({
      where: {
        project: {
          company_id: companyId,
          ...(projectId ? { id: projectId } : {}),
        },
      },
      select: {
        id: true,
        name_user: true,
        amount_of_hours: true,
        hourly_price: true,
        fixed_price: true,
        type_price: true,
        project: {
          select: {
            id: true,
            contract_number: true,
            location: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    const byProject = new Map<string, { projectId: string; projectName: string; projectAddress: string | null; clientName: string | null; totalHours: number; totalCost: number; entries: number }>();
    for (const row of workedHours) {
      const amountHours = decimalToNumber(row.amount_of_hours);
      const totalCost = row.type_price === "fixed" ? decimalToNumber(row.fixed_price) : amountHours * decimalToNumber(row.hourly_price);
      const key = row.project?.id || "unknown";
      const current = byProject.get(key) || {
        projectId: row.project?.id || "unknown",
        projectName: row.project ? getProjectDisplayName(row.project) : "Project N/A",
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
        totalHours: 0,
        totalCost: 0,
        entries: 0,
      };
      current.totalHours += amountHours;
      current.totalCost += totalCost;
      current.entries += 1;
      byProject.set(key, current);
    }

    return {
      totalEntries: workedHours.length,
      totalHours: workedHours.reduce((acc: number, row: any) => acc + decimalToNumber(row.amount_of_hours), 0),
      totalCost: workedHours.reduce((acc: number, row: any) => {
        return acc + (row.type_price === "fixed" ? decimalToNumber(row.fixed_price) : decimalToNumber(row.amount_of_hours) * decimalToNumber(row.hourly_price));
      }, 0),
      byProject: Array.from(byProject.values()).sort((a, b) => b.totalCost - a.totalCost),
    };
  }

  private async subcontractorSummary(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const limit = Math.min(Number(input.limit || 10) || 10, 30);
    const workedHours = await prisma.workedhours.findMany({
      where: {
        subcontractor_id: { not: null },
        project: {
          company_id: companyId,
          ...(projectId ? { id: projectId } : {}),
        },
      },
      take: limit * 20,
      select: {
        amount_of_hours: true,
        hourly_price: true,
        fixed_price: true,
        type_price: true,
        subcontractor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            contract_number: true,
            location: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    const bySubcontractor = new Map<string, { subcontractorId: string; name: string; email: string | null; totalHours: number; totalCost: number; projectCount: number; projects: Set<string> }>();
    for (const row of workedHours) {
      const subcontractor = row.subcontractor;
      if (!subcontractor) continue;
      const key = subcontractor.id;
      const totalCost = row.type_price === "fixed" ? decimalToNumber(row.fixed_price) : decimalToNumber(row.amount_of_hours) * decimalToNumber(row.hourly_price);
      const current = bySubcontractor.get(key) || {
        subcontractorId: subcontractor.id,
        name: subcontractor.name,
        email: subcontractor.email || null,
        totalHours: 0,
        totalCost: 0,
        projectCount: 0,
        projects: new Set<string>(),
      };
      current.totalHours += decimalToNumber(row.amount_of_hours);
      current.totalCost += totalCost;
      if (row.project?.id) current.projects.add(getProjectDisplayName(row.project));
      current.projectCount = current.projects.size;
      bySubcontractor.set(key, current);
    }

    return {
      totalSubcontractors: bySubcontractor.size,
      items: Array.from(bySubcontractor.values())
        .map(({ projects, ...rest }) => rest)
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, limit),
    };
  }

  private async companyOverview(companyId: string) {
    const [projectCount, clientCount, invoiceCount, topProjects, invoices] = await Promise.all([
      prisma.project.count({ where: { company_id: companyId } }),
      prisma.client.count({ where: { company_id: companyId } }),
      prisma.invoice.count({ where: { companyId } }),
      this.topSpendingProjects(companyId, { limit: 3 }),
      prisma.invoice.findMany({
        where: { companyId },
        select: {
          totalAmount: true,
          status: true,
          dueDate: true,
        },
      }),
    ]);

    const totals = invoices.reduce(
      (acc: any, invoice: any) => {
        const amount = decimalToNumber(invoice.totalAmount);
        acc.invoiced += amount;
        if (invoice.status === "paid") acc.paid += amount;
        if (invoice.status !== "paid") acc.open += amount;
        if (invoice.status !== "paid" && invoice.dueDate && new Date(invoice.dueDate) < new Date()) acc.overdue += amount;
        return acc;
      },
      { invoiced: 0, paid: 0, open: 0, overdue: 0 }
    );

    return {
      projectCount,
      clientCount,
      invoiceCount,
      totals,
      topProjects: topProjects.items,
    };
  }

  async listThreads(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      const companyId = String(req.query.companyId || "");

      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      if (!companyId) return res.status(400).json({ error: "companyId is required" });

      await ensureCompanyAccess(userId, companyId);

      const rows = await prisma.$queryRawUnsafe<AssistantThreadRow[]>(
        `
          SELECT
            t.id,
            t.title,
            t.summary,
            t.companyId,
            t.userId,
            t.lastMessageAt,
            t.createdAt,
            t.updatedAt,
            (
              SELECT m.content
              FROM ai_assistant_messages m
              WHERE m.threadId = t.id
              ORDER BY m.createdAt DESC
              LIMIT 1
            ) as lastMessageContent,
            (
              SELECT m.role
              FROM ai_assistant_messages m
              WHERE m.threadId = t.id
              ORDER BY m.createdAt DESC
              LIMIT 1
            ) as lastMessageRole
          FROM ai_assistant_threads t
          WHERE t.companyId = ? AND t.userId = ?
          ORDER BY t.lastMessageAt DESC
        `,
        companyId,
        userId
      );

      return res.status(200).json({ threads: rows });
    } catch (error: any) {
      console.error("[AIAssistantController.listThreads]", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async createThread(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      const { companyId, title } = req.body as { companyId?: string; title?: string };

      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      if (!companyId) return res.status(400).json({ error: "companyId is required" });

      await ensureCompanyAccess(userId, companyId);

      const threadId = uuidv4();
      const safeTitle = title?.trim() || "New conversation";

      await prisma.$executeRawUnsafe(
        `
          INSERT INTO ai_assistant_threads
            (id, title, summary, companyId, userId, lastMessageAt, createdAt, updatedAt)
          VALUES
            (?, ?, NULL, ?, ?, NOW(), NOW(), NOW())
        `,
        threadId,
        safeTitle,
        companyId,
        userId
      );

      await this.createWelcomeMessage(threadId);

      const thread = await getThreadById(threadId, companyId, userId);
      const messages = await listThreadMessages(threadId);

      return res.status(201).json({ thread, messages });
    } catch (error: any) {
      console.error("[AIAssistantController.createThread]", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async getThread(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      const companyId = String(req.query.companyId || "");
      const { threadId } = req.params;

      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      if (!companyId) return res.status(400).json({ error: "companyId is required" });

      await ensureCompanyAccess(userId, companyId);

      const thread = await getThreadById(threadId, companyId, userId);
      if (!thread) return res.status(404).json({ error: "Thread not found" });

      const messages = await listThreadMessages(threadId);
      return res.status(200).json({ thread, messages });
    } catch (error: any) {
      console.error("[AIAssistantController.getThread]", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async deleteThread(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      const companyId = String(req.query.companyId || "");
      const { threadId } = req.params;

      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      if (!companyId) return res.status(400).json({ error: "companyId is required" });

      await ensureCompanyAccess(userId, companyId);

      const thread = await getThreadById(threadId, companyId, userId);
      if (!thread) return res.status(404).json({ error: "Thread not found" });

      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `
            DELETE FROM ai_assistant_messages
            WHERE threadId = ?
          `,
          threadId
        ),
        prisma.$executeRawUnsafe(
          `
            DELETE FROM ai_assistant_threads
            WHERE id = ? AND companyId = ? AND userId = ?
          `,
          threadId,
          companyId,
          userId
        ),
      ]);

      return res.status(200).json({ success: true, threadId });
    } catch (error: any) {
      console.error("[AIAssistantController.deleteThread]", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const userId = (req as any).userId as string | undefined;
      const { threadId } = req.params;
      const { companyId, content } = req.body as { companyId?: string; content?: string };

      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      if (!companyId) return res.status(400).json({ error: "companyId is required" });
      if (!content?.trim()) return res.status(400).json({ error: "content is required" });

      await ensureCompanyAccess(userId, companyId);

      const thread = await getThreadById(threadId, companyId, userId);
      if (!thread) return res.status(404).json({ error: "Thread not found" });

      const trimmedContent = content.trim();
      const userMessage = await insertMessage({
        threadId,
        role: "user",
        content: trimmedContent,
      });

      const history = await listThreadMessages(threadId);
      const historyBeforeCurrentQuestion = history.slice(0, -1);
      const { structured, executedTools } = await this.synthesizeResponse(trimmedContent, historyBeforeCurrentQuestion.slice(-12), companyId);

      const assistantMessage = await insertMessage({
        threadId,
        role: "assistant",
        content: structured.content,
        report: structured.report || null,
      toolsUsed: executedTools.map((tool: ExecutedTool) => tool.tool),
        toolData: {
          bullets: structured.bullets || [],
          followUp: structured.followUp || null,
          executedTools,
        },
      });

      await prisma.$executeRawUnsafe(
        `
          UPDATE ai_assistant_threads
          SET
            title = CASE
              WHEN title IS NULL OR title = '' OR title = 'New conversation'
                THEN ?
              ELSE title
            END,
            summary = ?,
            lastMessageAt = NOW(),
            updatedAt = NOW()
          WHERE id = ?
        `,
        summarizeTitle(trimmedContent),
        structured.content,
        threadId
      );

      const updatedThread = await getThreadById(threadId, companyId, userId);

      return res.status(200).json({
        thread: updatedThread,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          bullets: structured.bullets || [],
          followUp: structured.followUp || null,
        },
      });
    } catch (error: any) {
      console.error("[AIAssistantController.sendMessage]", error);
      return res.status(500).json({
        error: error.message || "Internal server error",
        message: "The assistant could not complete this request. Try again in a moment.",
      });
    }
  }
}
