import { Request, Response } from "express";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { DateTime } from "luxon";
import { prisma } from "../../utils/prisma";
import { TimeService } from "../../services/TimeService";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";
import { PLANNING_SYSTEM_PROMPT, SYNTHESIS_PROMPT, SYSTEM_PROMPT } from "./prompts";
import {
  ACTIVE_PROJECT_STATUSES,
  OPENAI_SYNTHESIS_TIMEOUT_MS,
  OPENAI_TOOL_TIMEOUT_MS,
  PLANNER_HISTORY_MESSAGE_LIMIT,
  describeRequestedDateRange,
  decimalToNumber,
  endOfDay,
  formatCurrency,
  formatHours,
  getActiveProjectStatusFilter,
  getActiveProjectStatuses,
  getRequestedDateRange,
  inferRelativePeriodFromQuestion,
  parseDateValue,
  safeJsonParse,
  startOfDay,
  trimMessageContent,
  withTimeout,
} from "./utils";
import { normalizeStructuredResponse } from "./reportUtils";
import { buildToolSummaryResponse, compactToolOutputForModel, shouldPreferDirectToolSummary } from "./summaryBuilder";
import { buildReportFromTool } from "./reportBuilder";
import { getRecentProjectIdFromHistory, getRecentResponseIdFromHistory, getRecentSubcontractorIdFromHistory, getRecentToolContexts, getRecentToolOutput } from "./threadContext";
import type {
  AssistantMessageRow,
  AssistantStructuredResponse,
  AssistantThreadRow,
  ExecutedTool,
} from "./types";

const openai = process.env.OPENAI_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_KEY })
  : null;

const DATE_FILTER_TOOL_NAMES = new Set([
  "project_status_transitions",
  "top_spending_projects",
  "top_profitable_projects",
  "invoice_summary",
  "list_invoices",
  "invoice_aging",
  "overdue_invoices",
  "receivables_by_client",
  "client_risk_analysis",
  "cashflow_projection",
  "timecard_summary",
  "timecards_by_worker",
  "employee_vs_subcontractor_spend",
  "worker_timecard_details",
  "timecards_by_project",
  "timecards_daily_breakdown",
  "subcontractor_summary",
  "list_subcontractors",
  "get_subcontractor_details",
  "subcontractor_projects",
  "subcontractor_cost_entries",
]);
const timeService = new TimeService();
const TIMECARD_PROJECT_STATUSES = ["Pre-Start", "In Progress", "Final walkthrough", "Finished"] as const;


function buildTimecardDateFilter(input: Record<string, unknown>) {
  const range = getRequestedDateRange(input);
  if (!range?.rangeStart && !range?.rangeEnd) return undefined;

  const paymentDateFilter: Record<string, Date> = {};
  const createdAtFilter: Record<string, Date> = {};

  if (range.rangeStart) {
    paymentDateFilter.gte = range.rangeStart;
    createdAtFilter.gte = range.rangeStart;
  }

  if (range.rangeEnd) {
    paymentDateFilter.lte = range.rangeEnd;
    createdAtFilter.lte = range.rangeEnd;
  }

  return {
    OR: [
      { payment_date: paymentDateFilter },
      {
        payment_date: null,
        date_creation: createdAtFilter,
      },
    ],
  };
}

function buildAttendanceDateFilter(input: Record<string, unknown>) {
  const range = getRequestedDateRange(input);
  if (!range?.rangeStart && !range?.rangeEnd) return undefined;

  const filter: Record<string, Date> = {};
  if (range.rangeStart) filter.gte = range.rangeStart;
  if (range.rangeEnd) filter.lte = range.rangeEnd;
  return filter;
}

function isDateWithinRange(value: unknown, rangeStart: Date | null, rangeEnd: Date | null) {
  const date = parseDateValue(value);
  if (!date) return !rangeStart && !rangeEnd;
  if (rangeStart && date < rangeStart) return false;
  if (rangeEnd && date > rangeEnd) return false;
  return true;
}

function buildProjectStatusWhere(input: Record<string, unknown>) {
  const rawStatuses = Array.isArray(input.status)
    ? input.status.map((value) => String(value)).filter(Boolean)
    : input.status
      ? [String(input.status)]
      : [];

  const statuses = rawStatuses.length ? expandProjectStatuses(rawStatuses) : [];
  return {
    statuses,
    filter: statuses.length ? { in: statuses } : getActiveProjectStatusFilter(),
  };
}

function getWorkedHourEffectiveCost(row: {
  amount_of_hours?: unknown;
  hourly_price?: unknown;
  fixed_price?: unknown;
  type_price?: string | null;
  computed_total_cost?: unknown;
  computed_total_hours?: unknown;
}) {
  if (row.computed_total_cost != null || row.computed_total_hours != null) {
    return {
      totalCost: decimalToNumber(row.computed_total_cost),
      totalHours: decimalToNumber(row.computed_total_hours),
    };
  }

  const hours = decimalToNumber(row.amount_of_hours);
  const hourlyRate = decimalToNumber(row.hourly_price);
  const totalCost = row.type_price === "fixed"
    ? decimalToNumber(row.fixed_price)
    : hours > 0
    ? hours * hourlyRate
    : hourlyRate;

  return {
    totalCost,
    totalHours: hours,
  };
}

function getWorkedHourWorkerName(row: {
  name_user?: string | null;
  workerName?: string | null;
  user?: { name?: string | null } | null;
  subcontractor?: { name?: string | null } | null;
}) {
  return row.subcontractor?.name || row.workerName || row.user?.name || row.name_user || "Unknown worker";
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

function expandProjectStatuses(statuses: string[]) {
  const normalized = statuses.map((status) => status.trim()).filter(Boolean);
  const expanded = new Set<string>();

  for (const status of normalized) {
    const lower = status.toLowerCase();

    if (["active", "in progress", "in_progress", "pre start", "pre_start", "final walkthrough", "final_walkthrough"].includes(lower)) {
      [
        "active",
        "Active",
        "in progress",
        "In Progress",
        "in_progress",
        "IN_PROGRESS",
        "pre start",
        "Pre Start",
        "pre_start",
        "PRE_START",
        "final walkthrough",
        "Final Walkthrough",
        "final_walkthrough",
        "FINAL_WALKTHROUGH",
      ].forEach((item) => expanded.add(item));
      continue;
    }

    if (["completed", "done", "finished", "closed"].includes(lower)) {
      ["completed", "Completed", "done", "Done", "finished", "Finished", "closed", "Closed"].forEach((item) => expanded.add(item));
      continue;
    }

    if (["planned", "planning", "pending"].includes(lower)) {
      ["planned", "Planned", "planning", "Planning", "pending", "Pending"].forEach((item) => expanded.add(item));
      continue;
    }

    expanded.add(status);
  }

  return Array.from(expanded);
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
    companyId: string,
    history: AssistantMessageRow[] = [],
    question = ""
  ): Promise<ExecutedTool> {
    const input = safeJsonParse<Record<string, unknown>>(rawArgs, {});
    const contextualProjectId = getRecentProjectIdFromHistory(history);
    const contextualSubcontractorId = getRecentSubcontractorIdFromHistory(history);
    const resolvedInput = { ...input };
    const recentProfitableProjects = getRecentToolOutput(history, "top_profitable_projects");

    if (
      !resolvedInput.projectId &&
      contextualProjectId &&
      [
        "get_project_details",
        "project_cost_breakdown",
        "project_margin_analysis",
        "project_schedule_risk",
        "project_vs_estimate",
        "project_services_detail",
        "project_files_detail",
        "project_tasks_detail",
        "project_feed_detail",
        "project_invoices_detail",
        "project_change_orders_detail",
        "project_team_detail",
      ].includes(toolName)
    ) {
      resolvedInput.projectId = contextualProjectId;
    }

    if (
      !resolvedInput.subcontractorId &&
      contextualSubcontractorId &&
      ["get_subcontractor_details", "subcontractor_projects", "subcontractor_cost_entries"].includes(toolName)
    ) {
      resolvedInput.subcontractorId = contextualSubcontractorId;
    }

    if (
      toolName === "top_profitable_projects" &&
      !resolvedInput.limit &&
      recentProfitableProjects &&
      Number(recentProfitableProjects.profitableCount) > 0
    ) {
      resolvedInput.limit = Math.min(Number(recentProfitableProjects.profitableCount), 100);
    }

    if (
      DATE_FILTER_TOOL_NAMES.has(toolName) &&
      !resolvedInput.period &&
      !resolvedInput.date &&
      !resolvedInput.startDate &&
      !resolvedInput.endDate
    ) {
      const inferredPeriod = inferRelativePeriodFromQuestion(question);
      if (inferredPeriod) {
        resolvedInput.period = inferredPeriod;
      }
    }

    switch (toolName) {
      case "list_projects":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.listProjects(companyId, resolvedInput),
        };
      case "get_project_details":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.getProjectDetails(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_status_transitions":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectStatusTransitions(companyId, resolvedInput),
        };
      case "top_spending_projects":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.topSpendingProjects(companyId, resolvedInput),
        };
      case "top_profitable_projects":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.topProfitableProjects(companyId, resolvedInput),
        };
      case "list_clients":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.listClients(companyId, resolvedInput),
        };
      case "get_client_details":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.getClientDetails(companyId, String(resolvedInput.clientId || "")),
        };
      case "invoice_summary":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.invoiceSummary(companyId, resolvedInput),
        };
      case "list_invoices":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.listInvoices(companyId, resolvedInput),
        };
      case "invoice_aging":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.invoiceAging(companyId, resolvedInput),
        };
      case "overdue_invoices":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.overdueInvoices(companyId, resolvedInput),
        };
      case "receivables_by_client":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.receivablesByClient(companyId, resolvedInput),
        };
      case "client_risk_analysis":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.clientRiskAnalysis(companyId, resolvedInput),
        };
      case "cashflow_projection":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.cashflowProjection(companyId, resolvedInput),
        };
      case "project_cost_breakdown":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectCostBreakdown(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_margin_analysis":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectMarginAnalysis(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_schedule_risk":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectScheduleRisk(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_services_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectServicesDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_files_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectFilesDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_tasks_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectTasksDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_feed_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectFeedDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_invoices_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectInvoicesDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_change_orders_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectChangeOrdersDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "project_team_detail":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectTeamDetail(companyId, String(resolvedInput.projectId || "")),
        };
      case "estimate_summary":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.estimateSummary(companyId, resolvedInput),
        };
      case "project_vs_estimate":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.projectVsEstimate(companyId, String(resolvedInput.projectId || "")),
        };
      case "change_order_summary":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.changeOrderSummary(companyId, resolvedInput),
        };
      case "timecard_summary":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.timecardSummary(companyId, resolvedInput),
        };
      case "timecards_by_worker":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.timecardsByWorker(companyId, resolvedInput),
        };
      case "employee_vs_subcontractor_spend":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.employeeVsSubcontractorSpend(companyId, resolvedInput),
        };
      case "worker_timecard_details":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.workerTimecardDetails(companyId, resolvedInput),
        };
      case "timecards_by_project":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.timecardsByProject(companyId, resolvedInput),
        };
      case "timecards_daily_breakdown":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.timecardsDailyBreakdown(companyId, resolvedInput),
        };
      case "subcontractor_summary":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.subcontractorSummary(companyId, resolvedInput),
        };
      case "list_subcontractors":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.listSubcontractors(companyId, resolvedInput),
        };
      case "get_subcontractor_details":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.getSubcontractorDetails(companyId, resolvedInput),
        };
      case "subcontractor_projects":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.subcontractorProjects(companyId, resolvedInput),
        };
      case "subcontractor_cost_entries":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.subcontractorCostEntries(companyId, resolvedInput),
        };
      case "company_overview":
        return {
          tool: toolName,
          input: resolvedInput,
          output: await this.companyOverview(companyId),
        };
      default:
        return {
          tool: toolName,
          input: resolvedInput,
          output: { error: `Tool ${toolName} is not implemented` },
        };
    }
  }

  private getTools() {
    const tools = [
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
          name: "project_status_transitions",
          description: "Count and list projects that moved into one or more project statuses during a selected period, using the stored project status change date.",
          parameters: {
            type: "object",
            properties: {
              status: { type: "array", items: { type: "string" } },
              period: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              limit: { type: "number" },
            },
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
          name: "project_services_detail",
          description: "Return the full project services structure with service status, stages, subservices, cost items, activity counts and photo counts.",
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
          name: "project_files_detail",
          description: "Return the project file cabinet with folders, files, authors, descriptions, types and created dates.",
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
          name: "project_tasks_detail",
          description: "Return all project tasks with status, priority, due date, assigned user, service, comments and files.",
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
          name: "project_feed_detail",
          description: "Return the project activity feed through project services with activity text, author, comments, likes, service and created dates.",
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
          name: "project_invoices_detail",
          description: "Return all invoices tied to a project with totals, status, due dates, invoice type, paid/open/overdue split and payment-related fields.",
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
          name: "project_change_orders_detail",
          description: "Return all project change orders with status, total amount, scope, supervisor, created date and line items.",
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
          name: "project_team_detail",
          description: "Return the internal employee and subcontractor labor/cost breakdown for a project, with hours, entries and top contributors.",
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
          description: "Rank active projects by total spending using material and labor costs. Accepts period or explicit dates for rankings like this week, last month or custom windows.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number" },
              period: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "top_profitable_projects",
          description: "Rank active projects by profit using sold value minus material and labor cost. Accepts period or explicit dates for rankings like this month, last month or custom windows.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number" },
              period: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
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
          name: "client_risk_analysis",
          description: "Rank clients by revenue, open balance, overdue exposure and delay risk.",
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
          name: "cashflow_projection",
          description: "Summarize overdue and next-30-day unpaid invoice impact on cash flow.",
          parameters: {
            type: "object",
            properties: {
              days: { type: "number" },
              clientId: { type: "string" },
              projectId: { type: "string" },
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
          description: "Summarize internal employee labor pay/cost and hours from SmartBuild time cards for active projects only. Excludes subcontractor cost records.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              workerName: { type: "string" },
              period: {
                type: "string",
                enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"],
                description: "Relative period filter. Resolve phrases like 'this month'/'este mes' to thisMonth and 'last month'/'mes passado' to lastMonth.",
              },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "timecards_by_worker",
          description: "Rank internal employees by SmartBuild time-card labor pay/cost and hours for a selected period, project or date on active projects only. Excludes subcontractors.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              workerName: { type: "string" },
              period: {
                type: "string",
                enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"],
                description: "Relative period filter. Resolve phrases like 'this month'/'este mes' to thisMonth and 'last month'/'mes passado' to lastMonth.",
              },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "employee_vs_subcontractor_spend",
          description: "Compare employee time-card labor cost versus subcontractor cost for the same selected period on active projects, returning one consolidated financial answer.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              period: {
                type: "string",
                enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"],
                description: "Relative period filter. Resolve phrases like 'this month'/'este mes' to thisMonth and 'last month'/'mes passado' to lastMonth.",
              },
              status: { type: "array", items: { type: "string" } },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "worker_timecard_details",
          description: "Return detailed internal employee SmartBuild time card entries for a specific worker, including check-in, check-out, project, service, category, hours and labor pay/cost, with optional exact date or date range filters.",
          parameters: {
            type: "object",
            properties: {
              workerName: { type: "string" },
              projectId: { type: "string" },
              period: {
                type: "string",
                enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"],
                description: "Relative period filter. Resolve phrases like 'this month'/'este mes' to thisMonth and 'last month'/'mes passado' to lastMonth.",
              },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              limit: { type: "number" },
            },
            required: ["workerName"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "timecards_by_project",
          description: "Rank active projects by internal employee labor pay/cost and hours from SmartBuild time cards for a selected period. Excludes subcontractors.",
          parameters: {
            type: "object",
            properties: {
              workerName: { type: "string" },
              period: {
                type: "string",
                enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"],
                description: "Relative period filter. Resolve phrases like 'this month'/'este mes' to thisMonth and 'last month'/'mes passado' to lastMonth.",
              },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "timecards_daily_breakdown",
          description: "Show daily internal employee hours and SmartBuild time-card labor pay/cost trends for a selected worker, project or period on active projects. Excludes subcontractors.",
          parameters: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              workerName: { type: "string" },
              period: {
                type: "string",
                enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"],
                description: "Relative period filter. Resolve phrases like 'this month'/'este mes' to thisMonth and 'last month'/'mes passado' to lastMonth.",
              },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "subcontractor_summary",
          description: "Rank subcontractors by actual subcontractor cost using the same cost basis shown in the SmartBuild subcontractor dashboards.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string" },
              period: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              projectId: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "list_subcontractors",
          description: "List subcontractors with total cost, project count, monthly trend, project status mix, and top project context.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string" },
              period: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              projectId: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_subcontractor_details",
          description: "Get a subcontractor detail view equivalent to navigating SmartBuild: totals, projects, entries, timeline, project statuses and cost breakdown.",
          parameters: {
            type: "object",
            properties: {
              subcontractorId: { type: "string" },
              subcontractorName: { type: "string" },
              period: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "subcontractor_projects",
          description: "List all projects tied to a subcontractor with address, client, status, sold value, subcontractor cost, cost share and project-level totals.",
          parameters: {
            type: "object",
            properties: {
              subcontractorId: { type: "string" },
              subcontractorName: { type: "string" },
              period: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "subcontractor_cost_entries",
          description: "Return detailed subcontractor cost entries with project, client, service/category, date, payment date, pricing model, hours and total cost.",
          parameters: {
            type: "object",
            properties: {
              subcontractorId: { type: "string" },
              subcontractorName: { type: "string" },
              projectId: { type: "string" },
              search: { type: "string" },
              period: { type: "string" },
              status: { type: "array", items: { type: "string" } },
              startDate: { type: "string" },
              endDate: { type: "string" },
              date: { type: "string" },
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

    return tools.map((tool: any) => ({
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: false,
    }));
  }

  private buildPlannerMessages(question: string, history: AssistantMessageRow[], mode: "standard" | "minimal" = "standard") {
    const recentProjectId = getRecentProjectIdFromHistory(history);
    const recentSubcontractorId = getRecentSubcontractorIdFromHistory(history);
    const recentToolContexts = getRecentToolContexts(history, mode === "minimal" ? 1 : 3);
    const recentHistory = mode === "minimal"
      ? history.slice(-4)
      : history.slice(-PLANNER_HISTORY_MESSAGE_LIMIT);

    const contextParts: string[] = [];
    if (recentProjectId) contextParts.push(`recentProjectId=${recentProjectId}`);
    if (recentSubcontractorId) contextParts.push(`recentSubcontractorId=${recentSubcontractorId}`);

    const messages: any[] = [
      { role: "system", content: PLANNING_SYSTEM_PROMPT },
      {
        role: "system",
        content: `Today's date is ${DateTime.now().setZone("America/Sao_Paulo").toFormat("yyyy-MM-dd")}. Resolve relative dates against this date.`,
      },
    ];

    if (contextParts.length) {
      messages.push({
        role: "system",
        content: `Recent thread context: ${contextParts.join(", ")}.`,
      });
    }

    if (recentToolContexts.length) {
      messages.push({
        role: "system",
        content: `Recent tool context: ${JSON.stringify(recentToolContexts)}.`,
      });
    }

    messages.push(
      ...recentHistory.map((message) => ({
        role: message.role,
        content: trimMessageContent(message.content),
      }))
    );

    messages.push({ role: "user", content: trimMessageContent(question, 700) });
    return messages;
  }

  private async runPlanningCompletion(messages: any[]) {
    return withTimeout(
      openai!.responses.create({
        model: "gpt-5-mini",
        instructions: PLANNING_SYSTEM_PROMPT,
        input: messages.filter((message: any) => message.role !== "system"),
        tools: this.getTools() as any,
      } as any),
      OPENAI_TOOL_TIMEOUT_MS,
      "assistant tool planning"
    );
  }

  private getResponseText(response: any) {
    if (typeof response?.output_text === "string" && response.output_text.trim()) {
      return response.output_text.trim();
    }

    const output = Array.isArray(response?.output) ? response.output : [];
    const messageItem = output.find((item: any) => item?.type === "message");
    const content = Array.isArray(messageItem?.content) ? messageItem.content : [];

    const text = content
      .filter((item: any) => item?.type === "output_text" && typeof item.text === "string")
      .map((item: any) => item.text)
      .join("\n")
      .trim();

    return text || "";
  }

  private async synthesizeResponse(question: string, history: AssistantMessageRow[], companyId: string) {
    const messages = this.buildPlannerMessages(question, history, "standard");
    const previousResponseId = getRecentResponseIdFromHistory(history);

    const executedTools: ExecutedTool[] = [];

    if (openai) {
      try {
        let lastResponseId: string | null = previousResponseId;

        for (let attempt = 0; attempt < 6; attempt += 1) {
          let completion: any;

          try {
            completion = await withTimeout(
              openai.responses.create({
                model: "gpt-5-mini",
                instructions: PLANNING_SYSTEM_PROMPT,
                input: messages.filter((message: any) => message.role !== "system"),
                tools: this.getTools() as any,
              } as any),
              OPENAI_TOOL_TIMEOUT_MS,
              "assistant tool planning"
            );
          } catch (planningError) {
            const errorMessage = planningError instanceof Error ? planningError.message : String(planningError);
            const shouldRetryMinimal = errorMessage.includes("assistant tool planning timed out after");

            if (!shouldRetryMinimal) {
              throw planningError;
            }

            console.error("[AIAssistantController.synthesizeResponse] Planning retry with minimal context:", planningError);
            const minimalMessages = this.buildPlannerMessages(question, history, "minimal");
            completion = await withTimeout(
              openai.responses.create({
                model: "gpt-5-mini",
                instructions: PLANNING_SYSTEM_PROMPT,
                input: minimalMessages.filter((message: any) => message.role !== "system"),
                tools: this.getTools() as any,
              } as any),
              OPENAI_TOOL_TIMEOUT_MS,
              "assistant tool planning"
            );
            messages.splice(0, messages.length, ...minimalMessages);
          }

          lastResponseId = completion?.id || lastResponseId;
          const responseOutput = Array.isArray(completion?.output) ? completion.output : [];
          const toolCalls = responseOutput.filter((item: any) => item?.type === "function_call");

          if (toolCalls.length) {
            const toolOutputs: any[] = [];

            for (const toolCall of toolCalls) {
              const toolResult = await this.executeTool(
                toolCall?.name || "",
                toolCall?.arguments || "{}",
                companyId,
                history,
                question
              );

              executedTools.push(toolResult);
              toolOutputs.push({
                type: "function_call_output",
                call_id: toolCall.call_id,
                output: JSON.stringify(compactToolOutputForModel(toolResult, buildReportFromTool)),
              });
            }

            completion = await withTimeout(
              openai.responses.create({
                model: "gpt-5-mini",
                instructions: PLANNING_SYSTEM_PROMPT,
                previous_response_id: lastResponseId || undefined,
                input: toolOutputs,
                tools: this.getTools() as any,
              } as any),
              OPENAI_TOOL_TIMEOUT_MS,
              "assistant tool planning"
            );
            lastResponseId = completion?.id || lastResponseId;
            const followUpToolCalls = Array.isArray(completion?.output)
              ? completion.output.filter((item: any) => item?.type === "function_call")
              : [];

            if (followUpToolCalls.length) {
              continue;
            }
          }

          const assistantText = this.getResponseText(completion);

          if (!executedTools.length && assistantText) {
            return {
              structured: {
                content: assistantText,
                bullets: [],
                followUp: null,
                report: null,
              },
              executedTools: [],
              responseId: lastResponseId,
            };
          }

          if (executedTools.length || assistantText) {
            break;
          }
        }

        if (executedTools.length === 0) {
          return {
            structured: {
              content: "I couldn't determine a reliable data path for that request. Please ask it more directly.",
              bullets: [],
              followUp: null,
              report: null,
            },
            executedTools: [],
            responseId: lastResponseId,
          };
        }

        const fallback = buildToolSummaryResponse(executedTools, buildReportFromTool, question);
        const fallbackWithReport = {
          ...fallback,
          report: fallback.report || buildReportFromTool(executedTools[0]) || null,
        };

        if (shouldPreferDirectToolSummary(executedTools, buildReportFromTool)) {
          return {
            structured: normalizeStructuredResponse(fallbackWithReport, fallbackWithReport),
            executedTools,
            responseId: lastResponseId,
          };
        }

        try {
          const compactTools = executedTools.map((tool) => compactToolOutputForModel(tool, buildReportFromTool));
          const synthesisCompletion: any = await withTimeout(openai.responses.create({
            model: "gpt-5-mini",
            instructions: SYNTHESIS_PROMPT,
            previous_response_id: lastResponseId || undefined,
            input: JSON.stringify({
              question,
              tools: compactTools,
            }),
          } as any), OPENAI_SYNTHESIS_TIMEOUT_MS, "assistant synthesis");

          const rawContent = this.getResponseText(synthesisCompletion) || "{}";
          const structured = normalizeStructuredResponse(
            safeJsonParse<AssistantStructuredResponse>(rawContent, fallbackWithReport),
            fallbackWithReport
          );

          return {
            structured,
            executedTools,
            responseId: synthesisCompletion?.id || lastResponseId,
          };
        } catch (synthesisError) {
          console.error("[AIAssistantController.synthesizeResponse] Synthesis fallback:", synthesisError);
        }

        return {
          structured: normalizeStructuredResponse(fallbackWithReport, fallbackWithReport),
          executedTools,
          responseId: lastResponseId,
        };
      } catch (error) {
        console.error("[AIAssistantController.synthesizeResponse] OpenAI fallback:", error);
      }
    }

    return {
      structured: {
        content: "I couldn't complete that request right now.",
        bullets: [],
        followUp: null,
        report: null,
      },
      executedTools: [],
      responseId: null,
    };
  }

  private async listProjects(companyId: string, input: Record<string, unknown>) {
    const search = String(input.search || "").trim();
    const requestedLimit = Math.min(Number(input.limit || 100) || 100, 100);
    const { filter: statusFilter } = buildProjectStatusWhere(input);
    const where = {
      company_id: companyId,
      status_project: statusFilter,
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
    };

    const [total, projects] = await Promise.all([
      prisma.project.count({ where: where as any }),
      prisma.project.findMany({
        where: where as any,
        take: Math.min(requestedLimit, 100),
        orderBy: [
          { contract_number: "asc" },
          { date_creation: "desc" },
        ],
        select: {
          id: true,
          contract_number: true,
          status_project: true,
          status_changed_at: true,
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
      } as any),
    ]);

    const effectiveTotal = Math.min(total, 100);
    const items = total > projects.length && !search && effectiveTotal > projects.length
      ? await prisma.project.findMany({
          where: where as any,
          take: effectiveTotal,
          orderBy: [
            { contract_number: "asc" },
            { date_creation: "desc" },
          ],
          select: {
            id: true,
            contract_number: true,
            status_project: true,
            status_changed_at: true,
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
        } as any)
      : projects;

    return {
      total,
      returnedCount: items.length,
      items: items.map((project: any) => ({
        id: project.id,
        ...getProjectReference(project),
        contractNumber: project.contract_number,
        status: project.status_project,
        statusChangedAt: (project as any).status_changed_at || null,
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

  private async projectStatusTransitions(companyId: string, input: Record<string, unknown>) {
    const requestedStatuses = Array.isArray(input.status)
      ? input.status.map((value) => String(value)).filter(Boolean)
      : input.status
        ? [String(input.status)]
        : [];
    const statuses = requestedStatuses.length ? expandProjectStatuses(requestedStatuses) : [];
    const limit = Math.min(Number(input.limit || 50) || 50, 100);
    const { rangeStart, rangeEnd } = getRequestedDateRange(input);

    const statusChangedAt: Record<string, Date> = {};
    if (rangeStart) statusChangedAt.gte = rangeStart;
    if (rangeEnd) statusChangedAt.lte = rangeEnd;

    const projects = await prisma.project.findMany({
      where: {
        company_id: companyId,
        ...(statuses.length ? { status_project: { in: statuses } } : {}),
        status_changed_at: Object.keys(statusChangedAt).length ? statusChangedAt : { not: null },
      } as any,
      take: limit,
      orderBy: { status_changed_at: "desc" as const },
      select: {
        id: true,
        contract_number: true,
        status_project: true,
        status_changed_at: true,
        price: true,
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
      },
    } as any);

    const statusDateCoverage = await prisma.project.count({
      where: {
        company_id: companyId,
        ...(statuses.length ? { status_project: { in: statuses } } : {}),
        status_changed_at: { not: null },
      } as any,
    });

    return {
      total: projects.length,
      statuses: statuses.length ? statuses : [],
      period: {
        start: rangeStart || null,
        end: rangeEnd || null,
      },
      items: projects.map((project) => ({
        id: project.id,
        ...getProjectReference(project),
        contractNumber: project.contract_number,
        status: project.status_project,
        statusChangedAt: (project as any).status_changed_at || null,
        price: decimalToNumber(project.price),
        amountPaid: decimalToNumber(project.amountPaid),
        balanceDue: decimalToNumber(project.balanceDue),
      })),
      missingStatusChangeDateSupport: statusDateCoverage === 0,
    };
  }

  private async getProjectDetails(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: {
        id: projectId,
        company_id: companyId,
        status_project: getActiveProjectStatusFilter(),
      },
      select: {
        id: true,
        contract_number: true,
        price: true,
        status_project: true,
        status_changed_at: true,
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
            subcontractor_id: true,
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
        contractProject: {
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
            priority: true,
            dueDate: true,
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
    } as any);

    if (!project) {
      return { error: "Project not found" };
    }

    const employeeRows = await this.getEmployeeWorkedHours(companyId, { projectId });

    const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
      return (
        acc +
        service.costProject.reduce((serviceAcc: number, cost: any) => {
          return serviceAcc + decimalToNumber(cost.price) * Number(cost.amout || 0);
        }, 0)
      );
    }, 0);

    const employeeLaborCost = employeeRows.reduce((acc: number, item: any) => acc + getWorkedHourEffectiveCost(item).totalCost, 0);
    const subcontractorLaborCost = project.workedHours
      .filter((item: any) => Boolean(item.subcontractor_id))
      .reduce((acc: number, item: any) => acc + this.getSubcontractorEntryCost(item).totalCost, 0);
    const laborCost = employeeLaborCost + subcontractorLaborCost;

    const invoicedAmount = project.invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);
    const taskStatusCounts = {
      open: project.tasks.filter((task: any) => task.status === "OPEN").length,
      inProgress: project.tasks.filter((task: any) => task.status === "IN_PROGRESS").length,
      completed: project.tasks.filter((task: any) => task.status === "COMPLETED").length,
      canceled: project.tasks.filter((task: any) => task.status === "CANCELED").length,
      overdue: project.tasks.filter((task: any) => task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "COMPLETED").length,
    };
    const changeOrderTotals = {
      count: project.changeOrders.length,
      totalAmount: project.changeOrders.reduce((acc: number, order: any) => acc + decimalToNumber(order.total_amount), 0),
      pending: project.changeOrders.filter((order: any) => String(order.status) === "pending").length,
      approved: project.changeOrders.filter((order: any) => String(order.status) === "approved").length,
    };
    const serviceTotals = {
      plannedValue: project.serviceProject.reduce((acc: number, service: any) => acc + decimalToNumber(service.price), 0),
      plannedHours: project.serviceProject.reduce((acc: number, service: any) => acc + decimalToNumber(service.hours), 0),
      activities: project.serviceProject.reduce((acc: number, service: any) => acc + service.Activities.length, 0),
      photos: project.serviceProject.reduce((acc: number, service: any) => acc + service.photos.length, 0),
    };

    return {
      id: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      status: project.status_project,
      statusChangedAt: (project as any).status_changed_at || null,
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
        soldVsCost: decimalToNumber(project.price) - (materialCost + laborCost),
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
        contractFiles: project.contractProject.length,
        folders: project.projectPastes.length,
        tasks: project.tasks.length,
        changeOrders: project.changeOrders.length,
      },
      serviceTotals,
      taskStatusCounts,
      changeOrderTotals,
    };
  }

  private async topSpendingProjects(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 5) || 5, 100);
    const { rangeStart, rangeEnd } = getRequestedDateRange(input);
    const [projects, employeeRows, subcontractorRows] = await Promise.all([
      prisma.project.findMany({
        where: {
          company_id: companyId,
          status_project: getActiveProjectStatusFilter(),
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
                  cost_date: true,
                },
              },
            },
          },
        },
      }),
      this.getEmployeeWorkedHours(companyId, input),
      this.getSubcontractorWorkedHours(companyId, input),
    ]);

    const employeeLaborByProject = new Map<string, number>();
    for (const row of employeeRows) {
      const projectKey = row.project?.id;
      if (!projectKey) continue;
      employeeLaborByProject.set(projectKey, (employeeLaborByProject.get(projectKey) || 0) + getWorkedHourEffectiveCost(row).totalCost);
    }

    const subcontractorLaborByProject = new Map<string, number>();
    for (const row of subcontractorRows) {
      const projectKey = row.project?.id;
      if (!projectKey) continue;
      subcontractorLaborByProject.set(projectKey, (subcontractorLaborByProject.get(projectKey) || 0) + this.getSubcontractorEntryCost(row).totalCost);
    }

    const items = projects
      .map((project: any) => {
        const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
          return (
            acc +
            service.costProject.reduce((costAcc: number, cost: any) => {
              if (!isDateWithinRange(cost.cost_date, rangeStart, rangeEnd)) return costAcc;
              return costAcc + decimalToNumber(cost.price) * Number(cost.amout || 0);
            }, 0)
          );
        }, 0);

        const laborCost = (employeeLaborByProject.get(project.id) || 0) + (subcontractorLaborByProject.get(project.id) || 0);

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
      period: {
        start: rangeStart || null,
        end: rangeEnd || null,
      },
      items,
    };
  }

  private async topProfitableProjects(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 8) || 8, 100);
    const { rangeStart, rangeEnd } = getRequestedDateRange(input);
    const [projects, employeeRows, subcontractorRows] = await Promise.all([
      prisma.project.findMany({
        where: {
          company_id: companyId,
          status_project: getActiveProjectStatusFilter(),
        },
        select: {
          id: true,
          contract_number: true,
          location: true,
          price: true,
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          serviceProject: {
            select: {
              costProject: {
                select: {
                  price: true,
                  amout: true,
                  cost_date: true,
                },
              },
            },
          },
        },
      }),
      this.getEmployeeWorkedHours(companyId, input),
      this.getSubcontractorWorkedHours(companyId, input),
    ]);

    const employeeLaborByProject = new Map<string, number>();
    for (const row of employeeRows) {
      const projectKey = row.project?.id;
      if (!projectKey) continue;
      employeeLaborByProject.set(projectKey, (employeeLaborByProject.get(projectKey) || 0) + getWorkedHourEffectiveCost(row).totalCost);
    }

    const subcontractorLaborByProject = new Map<string, number>();
    for (const row of subcontractorRows) {
      const projectKey = row.project?.id;
      if (!projectKey) continue;
      subcontractorLaborByProject.set(projectKey, (subcontractorLaborByProject.get(projectKey) || 0) + this.getSubcontractorEntryCost(row).totalCost);
    }

    const items = projects
      .map((project: any) => {
        const soldValue = decimalToNumber(project.price);
        const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
          return acc + service.costProject.reduce((costAcc: number, cost: any) => {
            if (!isDateWithinRange(cost.cost_date, rangeStart, rangeEnd)) return costAcc;
            return costAcc + decimalToNumber(cost.price) * Number(cost.amout || 0);
          }, 0);
        }, 0);

        const laborCost = (employeeLaborByProject.get(project.id) || 0) + (subcontractorLaborByProject.get(project.id) || 0);

        const totalCost = materialCost + laborCost;
        const profitValue = soldValue - totalCost;
        const profitPct = soldValue > 0 ? profitValue / soldValue : 0;

        return {
          projectId: project.id,
          ...getProjectReference(project),
          contractNumber: project.contract_number,
          soldValue,
          materialCost,
          laborCost,
          totalCost,
          profitValue,
          profitPct,
        };
      })
      .filter((item) => item.soldValue > 0)
      .sort((a, b) => b.profitValue - a.profitValue);

    return {
      total: Math.min(items.length, limit),
      profitableCount: items.filter((item) => item.profitValue > 0).length,
      unprofitableCount: items.filter((item) => item.profitValue <= 0).length,
      period: {
        start: rangeStart || null,
        end: rangeEnd || null,
      },
      items: items.slice(0, limit),
    };
  }

  private async projectCostBreakdown(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
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
            name_user: true,
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

    const employeeRows = await this.getEmployeeWorkedHours(companyId, { projectId });

    let materialCost = 0;
    let laborCost = employeeRows.reduce((acc: number, item: any) => acc + getWorkedHourEffectiveCost(item).totalCost, 0);
    let subcontractorCost = 0;
    const byMaterial: Record<string, number> = {};
    const byLaborContributor: Record<string, number> = {};

    for (const service of project.serviceProject) {
      for (const cost of service.costProject) {
        const total = decimalToNumber(cost.price) * Number(cost.amout || 0);
        materialCost += total;
        byMaterial[cost.material_name || "Uncategorized"] = (byMaterial[cost.material_name || "Uncategorized"] || 0) + total;
      }
    }

    for (const item of project.workedHours) {
      if (!item.subcontractor) continue;
      const total = this.getSubcontractorEntryCost(item).totalCost;
      laborCost += total;
      subcontractorCost += total;
      const contributor = item.subcontractor?.name || item.name_user || "Unknown worker";
      byLaborContributor[contributor] = (byLaborContributor[contributor] || 0) + total;
    }

    for (const item of employeeRows) {
      const total = getWorkedHourEffectiveCost(item).totalCost;
      const contributor = getWorkedHourWorkerName(item);
      byLaborContributor[contributor] = (byLaborContributor[contributor] || 0) + total;
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
      topLaborContributors: Object.entries(byLaborContributor)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }

  private async projectMarginAnalysis(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
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
            subcontractor_id: true,
            amount_of_hours: true,
            hourly_price: true,
            fixed_price: true,
            type_price: true,
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const employeeRows = await this.getEmployeeWorkedHours(companyId, { projectId });

    const soldValue = decimalToNumber(project.price);
    const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
      return acc + service.costProject.reduce((inner: number, cost: any) => inner + decimalToNumber(cost.price) * Number(cost.amout || 0), 0);
    }, 0);
    const employeeLaborCost = employeeRows.reduce((acc: number, item: any) => acc + getWorkedHourEffectiveCost(item).totalCost, 0);
    const subcontractorLaborCost = project.workedHours.reduce((acc: number, item: any) => {
      return acc + (item.subcontractor_id ? this.getSubcontractorEntryCost(item).totalCost : 0);
    }, 0);
    const laborCost = employeeLaborCost + subcontractorLaborCost;
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
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
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

  private async projectServicesDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { id: true, name: true, email: true } },
        serviceProject: {
          orderBy: { date_creation: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            hours: true,
            price: true,
            start_date: true,
            deadline: true,
            scheduleCompleted: true,
            stages: {
              select: {
                id: true,
                description: true,
                check: true,
              },
            },
            subServicesProjects: {
              select: {
                id: true,
                name: true,
                description: true,
                quantity: true,
                price: true,
                status: true,
                start_date: true,
                deadline: true,
                scheduleCompleted: true,
                category: {
                  select: {
                    id: true,
                    category_name: true,
                  },
                },
              },
            },
            costProject: {
              orderBy: { cost_date: "desc" },
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
                uri: true,
              },
            },
            tasks: {
              select: {
                id: true,
                status: true,
              },
            },
            UserServiceProject: {
              select: {
                id: true,
              },
            },
            subContractorServiceProjects: {
              select: {
                id: true,
                subcontractor: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const services = project.serviceProject.map((service: any) => {
      const materialCost = service.costProject.reduce((acc: number, item: any) => {
        return acc + decimalToNumber(item.price) * Number(item.amout || 0);
      }, 0);
      const stageCompleted = service.stages.filter((stage: any) => stage.check).length;
      const stageTotal = service.stages.length;

      return {
        id: service.id,
        name: service.name,
        description: service.description,
        status: service.status,
        startDate: service.start_date,
        deadline: service.deadline,
        scheduleCompleted: Boolean(service.scheduleCompleted),
        plannedHours: decimalToNumber(service.hours),
        plannedValue: decimalToNumber(service.price),
        materialCost,
        stageProgress: {
          completed: stageCompleted,
          total: stageTotal,
          ratio: stageTotal ? stageCompleted / stageTotal : 0,
        },
        activityCount: service.Activities.length,
        photoCount: service.photos.length,
        taskCount: service.tasks.length,
        assignedUserCount: service.UserServiceProject.length,
        subcontractorCount: service.subContractorServiceProjects.length,
        subcontractors: Array.from(
          new Map(
            service.subContractorServiceProjects
              .filter((item: any) => item.subcontractor?.id)
              .map((item: any) => [item.subcontractor.id, item.subcontractor])
          ).values()
        ),
        stages: service.stages,
        subservices: service.subServicesProjects.map((sub: any) => ({
          id: sub.id,
          name: sub.name,
          description: sub.description,
          quantity: sub.quantity,
          price: decimalToNumber(sub.price),
          status: sub.status,
          startDate: sub.start_date,
          deadline: sub.deadline,
          scheduleCompleted: Boolean(sub.scheduleCompleted),
          category: sub.category,
        })),
        costItems: service.costProject.map((item: any) => ({
          id: item.id,
          materialName: item.material_name,
          unitPrice: decimalToNumber(item.price),
          quantity: Number(item.amout || 0),
          totalPrice: decimalToNumber(item.price) * Number(item.amout || 0),
          transactionType: item.transaction_type,
          costDate: item.cost_date,
        })),
      };
    });

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      totalServices: services.length,
      totals: {
        plannedValue: services.reduce((acc: number, service: any) => acc + service.plannedValue, 0),
        plannedHours: services.reduce((acc: number, service: any) => acc + service.plannedHours, 0),
        materialCost: services.reduce((acc: number, service: any) => acc + service.materialCost, 0),
        activityCount: services.reduce((acc: number, service: any) => acc + service.activityCount, 0),
        photoCount: services.reduce((acc: number, service: any) => acc + service.photoCount, 0),
        taskCount: services.reduce((acc: number, service: any) => acc + service.taskCount, 0),
      },
      services,
    };
  }

  private async projectFilesDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { id: true, name: true, email: true } },
        projectPastes: {
          orderBy: { date_creation: "desc" },
          select: {
            id: true,
            name: true,
            date_creation: true,
            userAuthor: { select: { id: true, name: true } },
            files: {
              orderBy: { date_creation: "desc" },
              select: {
                id: true,
                name: true,
                description: true,
                file: true,
                type_file: true,
                date_creation: true,
                userAuthor: { select: { id: true, name: true } },
              },
            },
          },
        },
        projectFiles: {
          orderBy: { date_creation: "desc" },
          select: {
            id: true,
            name: true,
            description: true,
            file: true,
            type_file: true,
            date_creation: true,
            pasteId: true,
            userAuthor: { select: { id: true, name: true } },
          },
        },
        contractProject: {
          orderBy: { date_creation: "desc" },
          select: {
            id: true,
            original_file_name: true,
            uri: true,
            date_creation: true,
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const rootFiles = project.projectFiles.filter((file: any) => !file.pasteId);

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      totals: {
        folders: project.projectPastes.length,
        files: project.projectFiles.length,
        rootFiles: rootFiles.length,
        contractFiles: project.contractProject.length,
      },
      folders: project.projectPastes.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        createdAt: folder.date_creation,
        author: folder.userAuthor,
        fileCount: folder.files.length,
        files: folder.files.map((file: any) => ({
          id: file.id,
          name: file.name,
          description: file.description,
          url: file.file,
          type: file.type_file,
          createdAt: file.date_creation,
          author: file.userAuthor,
        })),
      })),
      rootFiles: rootFiles.map((file: any) => ({
        id: file.id,
        name: file.name,
        description: file.description,
        url: file.file,
        type: file.type_file,
        createdAt: file.date_creation,
        author: file.userAuthor,
      })),
      contractFiles: project.contractProject.map((file: any) => ({
        id: file.id,
        name: file.original_file_name,
        url: file.uri,
        createdAt: file.date_creation,
      })),
    };
  }

  private async projectTasksDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { id: true, name: true, email: true } },
        tasks: {
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            creator: { select: { id: true, name: true } },
            assignedUser: { select: { id: true, name: true, email: true } },
            serviceProject: { select: { id: true, name: true } },
            comments: { select: { id: true } },
            files: { select: { id: true, name: true, url: true, type: true, size: true } },
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const tasks = project.tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      creator: task.creator,
      assignedUser: task.assignedUser,
      service: task.serviceProject,
      commentCount: task.comments.length,
      fileCount: task.files.length,
      files: task.files,
    }));

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      totals: {
        totalTasks: tasks.length,
        open: tasks.filter((task: any) => task.status === "OPEN").length,
        inProgress: tasks.filter((task: any) => task.status === "IN_PROGRESS").length,
        completed: tasks.filter((task: any) => task.status === "COMPLETED").length,
        canceled: tasks.filter((task: any) => task.status === "CANCELED").length,
        urgent: tasks.filter((task: any) => task.priority === "URGENT").length,
        overdue: tasks.filter((task: any) => task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "COMPLETED").length,
      },
      items: tasks,
    };
  }

  private async projectFeedDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { id: true, name: true, email: true } },
        serviceProject: {
          select: {
            id: true,
            name: true,
            photos: { select: { id: true, uri: true, date_creation: true } },
            Activities: {
              orderBy: { date_creation: "desc" },
              select: {
                id: true,
                text: true,
                date_creation: true,
                author: { select: { id: true, name: true } },
                comments: { select: { id: true } },
                likes: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const feedItems = project.serviceProject.flatMap((service: any) =>
      service.Activities.map((activity: any) => ({
        id: activity.id,
        text: activity.text,
        createdAt: activity.date_creation,
        author: activity.author,
        commentCount: activity.comments.length,
        likeCount: activity.likes.length,
        serviceId: service.id,
        serviceName: service.name,
      }))
    ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const photos = project.serviceProject.flatMap((service: any) =>
      service.photos.map((photo: any) => ({
        id: photo.id,
        uri: photo.uri,
        createdAt: photo.date_creation,
        serviceId: service.id,
        serviceName: service.name,
      }))
    ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      totals: {
        services: project.serviceProject.length,
        activities: feedItems.length,
        photos: photos.length,
      },
      latestActivities: feedItems.slice(0, 50),
      latestPhotos: photos.slice(0, 50),
    };
  }

  private async projectInvoicesDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        price: true,
        amountPaid: true,
        balanceDue: true,
        client: { select: { id: true, name: true, email: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            currency: true,
            dueDate: true,
            createdAt: true,
            invoiceType: true,
            description: true,
            balanceRemaining: true,
            totalAmountPaid: true,
            totalAmountPaidQbo: true,
            lastPaymentAt: true,
            type_value: true,
            percentageCoefficient: true,
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const now = new Date();
    const items = project.invoices.map((invoice: any) => ({
      id: invoice.id,
      status: invoice.status,
      totalAmount: decimalToNumber(invoice.totalAmount),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      invoiceType: invoice.invoiceType,
      description: invoice.description,
      balanceRemaining: decimalToNumber(invoice.balanceRemaining),
      totalAmountPaid: decimalToNumber(invoice.totalAmountPaid || invoice.totalAmountPaidQbo),
      lastPaymentAt: invoice.lastPaymentAt,
      typeValue: invoice.type_value,
      percentageCoefficient: decimalToNumber(invoice.percentageCoefficient),
      isOverdue: invoice.status !== "paid" && invoice.dueDate ? new Date(invoice.dueDate) < now : false,
    }));

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      soldValue: decimalToNumber(project.price),
      amountPaid: decimalToNumber(project.amountPaid),
      balanceDue: decimalToNumber(project.balanceDue),
      totals: {
        invoiceCount: items.length,
        totalInvoiced: items.reduce((acc: number, item: any) => acc + item.totalAmount, 0),
        paidAmount: items.filter((item: any) => item.status === "paid").reduce((acc: number, item: any) => acc + item.totalAmount, 0),
        openAmount: items.filter((item: any) => item.status !== "paid").reduce((acc: number, item: any) => acc + item.totalAmount, 0),
        overdueAmount: items.filter((item: any) => item.isOverdue).reduce((acc: number, item: any) => acc + item.totalAmount, 0),
      },
      items,
    };
  }

  private async projectChangeOrdersDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { id: true, name: true, email: true } },
        changeOrders: {
          orderBy: { date_creation: "desc" },
          select: {
            id: true,
            number: true,
            status: true,
            total_amount: true,
            scope_of_work: true,
            date_creation: true,
            supervisor: { select: { id: true, name: true } },
            changeOrderServices: {
              select: {
                id: true,
                name: true,
                description: true,
                quantity: true,
                unitPrice: true,
                lineTotal: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const items = project.changeOrders.map((changeOrder: any) => ({
      id: changeOrder.id,
      number: changeOrder.number,
      status: changeOrder.status,
      totalAmount: decimalToNumber(changeOrder.total_amount),
      scopeOfWork: changeOrder.scope_of_work,
      createdAt: changeOrder.date_creation,
      supervisor: changeOrder.supervisor,
      serviceCount: changeOrder.changeOrderServices.length,
      services: changeOrder.changeOrderServices.map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        quantity: service.quantity,
        unitPrice: decimalToNumber(service.unitPrice),
        lineTotal: decimalToNumber(service.lineTotal),
        price: decimalToNumber(service.price),
      })),
    }));

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      totals: {
        count: items.length,
        approvedAmount: items.filter((item: any) => String(item.status) === "approved").reduce((acc: number, item: any) => acc + item.totalAmount, 0),
        pendingAmount: items.filter((item: any) => String(item.status) === "pending").reduce((acc: number, item: any) => acc + item.totalAmount, 0),
        totalAmount: items.reduce((acc: number, item: any) => acc + item.totalAmount, 0),
      },
      items,
    };
  }

  private async projectTeamDetail(companyId: string, projectId: string) {
    const project: any = await prisma.project.findFirst({
      where: { id: projectId, company_id: companyId, status_project: { in: [...TIMECARD_PROJECT_STATUSES] } },
      select: {
        id: true,
        contract_number: true,
        location: true,
        client: { select: { id: true, name: true, email: true } },
        seller_user_id: true,
        project_manager_id: true,
        user: { select: { id: true, name: true } },
        project_manager: { select: { id: true, name: true } },
        workedHours: {
          orderBy: { date_creation: "desc" },
          select: {
            id: true,
            name_user: true,
            amount_of_hours: true,
            hourly_price: true,
            fixed_price: true,
            type_price: true,
            date_creation: true,
            payment_date: true,
            subcontractor: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!project) return { error: "Project not found" };

    const employeeRows = await this.getEmployeeWorkedHours(companyId, { projectId });

    const employees = new Map<string, { workerName: string; totalHours: number; totalCost: number; entries: number }>();
    const subcontractors = new Map<string, { subcontractorId: string; name: string; email: string | null; phone: string | null; totalHours: number; totalCost: number; entries: number }>();

    for (const row of project.workedHours) {
      if (row.subcontractor) {
        const current = subcontractors.get(row.subcontractor.id) || {
          subcontractorId: row.subcontractor.id,
          name: row.subcontractor.name,
          email: row.subcontractor.email || null,
          phone: row.subcontractor.phone || null,
          totalHours: 0,
          totalCost: 0,
          entries: 0,
        };
        const cost = this.getSubcontractorEntryCost(row);
        current.totalHours += cost.totalHours;
        current.totalCost += cost.totalCost;
        current.entries += 1;
        subcontractors.set(row.subcontractor.id, current);
      }
    }

    for (const row of employeeRows) {
      const workerName = getWorkedHourWorkerName(row);
      const current = employees.get(workerName) || {
        workerName,
        totalHours: 0,
        totalCost: 0,
        entries: 0,
      };
      const cost = getWorkedHourEffectiveCost(row);
      current.totalHours += cost.totalHours;
      current.totalCost += cost.totalCost;
      current.entries += 1;
      employees.set(workerName, current);
    }

    const employeeItems = Array.from(employees.values()).sort((a, b) => b.totalCost - a.totalCost);
    const subcontractorItems = Array.from(subcontractors.values()).sort((a, b) => b.totalCost - a.totalCost);

    return {
      projectId: project.id,
      ...getProjectReference(project),
      contractNumber: project.contract_number,
      seller: project.user,
      projectManager: project.project_manager,
      totals: {
        employeeCount: employeeItems.length,
        subcontractorCount: subcontractorItems.length,
        employeeLaborCost: employeeItems.reduce((acc: number, item: any) => acc + item.totalCost, 0),
        subcontractorCost: subcontractorItems.reduce((acc: number, item: any) => acc + item.totalCost, 0),
        totalHours: employeeItems.reduce((acc: number, item: any) => acc + item.totalHours, 0) + subcontractorItems.reduce((acc: number, item: any) => acc + item.totalHours, 0),
        totalEntries: employeeRows.length + project.workedHours.filter((row: any) => Boolean(row.subcontractor)).length,
      },
      employees: employeeItems,
      subcontractors: subcontractorItems,
    };
  }

  private async listClients(companyId: string, input: Record<string, unknown>) {
    const search = String(input.search || "").trim();
    const limit = Math.min(Number(input.limit || 25) || 25, 100);

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
          where: {
            status_project: getActiveProjectStatusFilter(),
          },
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
          where: {
            status_project: getActiveProjectStatusFilter(),
          },
          select: {
            id: true,
            contract_number: true,
            status_project: true,
            status_changed_at: true,
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
    } as any);

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
        statusChangedAt: (project as any).status_changed_at || null,
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

  private async clientRiskAnalysis(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 10) || 10, 25);
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
      },
      select: {
        totalAmount: true,
        status: true,
        dueDate: true,
        project: {
          select: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const now = new Date();
    const byClient = new Map<string, {
      clientId: string;
      clientName: string;
      email: string | null;
      revenueAmount: number;
      openAmount: number;
      overdueAmount: number;
      overdueInvoices: number;
      invoiceCount: number;
      riskScore: number;
    }>();

    for (const invoice of invoices) {
      const client = invoice.project?.client;
      if (!client) continue;
      const amount = decimalToNumber(invoice.totalAmount);
      const current = byClient.get(client.id) || {
        clientId: client.id,
        clientName: client.name,
        email: client.email || null,
        revenueAmount: 0,
        openAmount: 0,
        overdueAmount: 0,
        overdueInvoices: 0,
        invoiceCount: 0,
        riskScore: 0,
      };

      current.revenueAmount += amount;
      current.invoiceCount += 1;

      const isPaid = String(invoice.status || "").toLowerCase() === "paid";
      const isOverdue = !isPaid && invoice.dueDate && new Date(invoice.dueDate) < now;

      if (!isPaid) {
        current.openAmount += amount;
      }

      if (isOverdue) {
        current.overdueAmount += amount;
        current.overdueInvoices += 1;
      }

      byClient.set(client.id, current);
    }

    const items = Array.from(byClient.values())
      .map((item) => {
        const overdueRatio = item.openAmount > 0 ? item.overdueAmount / item.openAmount : 0;
        const revenueWeight = item.revenueAmount > 0 ? Math.min(item.revenueAmount / 100000, 1) : 0;
        const invoiceWeight = item.invoiceCount > 0 ? Math.min(item.overdueInvoices / item.invoiceCount, 1) : 0;
        const riskScore = Math.min(overdueRatio * 0.6 + invoiceWeight * 0.25 + revenueWeight * 0.15, 1);

        return {
          ...item,
          riskScore,
        };
      })
      .sort((a, b) => {
        if (b.revenueAmount !== a.revenueAmount) return b.revenueAmount - a.revenueAmount;
        return b.riskScore - a.riskScore;
      })
      .slice(0, limit);

    return {
      totalClients: byClient.size,
      items,
    };
  }

  private async cashflowProjection(companyId: string, input: Record<string, unknown>) {
    const days = Math.min(Number(input.days || 30) || 30, 90);
    const clientId = input.clientId ? String(input.clientId) : undefined;
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

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
        project: {
          select: {
            id: true,
            contract_number: true,
            location: true,
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

    const overdueInvoices = invoices.filter((invoice: any) => invoice.dueDate && new Date(invoice.dueDate) < now);
    const nextInvoices = invoices.filter((invoice: any) => {
      if (!invoice.dueDate) return false;
      const dueDate = new Date(invoice.dueDate);
      return dueDate >= now && dueDate <= future;
    });

    return {
      totalInvoices: invoices.length,
      overdueAmount: overdueInvoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0),
      next30DaysAmount: nextInvoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0),
      items: [
        {
          label: "Overdue",
          amount: overdueInvoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0),
        },
        {
          label: `Next ${days} Days`,
          amount: nextInvoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0),
        },
      ],
      overdueInvoices: overdueInvoices.slice(0, 8).map((invoice: any) => ({
        id: invoice.id,
        totalAmount: decimalToNumber(invoice.totalAmount),
        dueDate: invoice.dueDate,
        projectId: invoice.project?.id || null,
        projectName: invoice.project ? getProjectDisplayName(invoice.project) : null,
        projectAddress: invoice.project?.location || null,
        clientName: invoice.project?.client?.name || null,
        contractNumber: invoice.project?.contract_number || null,
      })),
      upcomingInvoices: nextInvoices.slice(0, 8).map((invoice: any) => ({
        id: invoice.id,
        totalAmount: decimalToNumber(invoice.totalAmount),
        dueDate: invoice.dueDate,
        projectId: invoice.project?.id || null,
        projectName: invoice.project ? getProjectDisplayName(invoice.project) : null,
        projectAddress: invoice.project?.location || null,
        clientName: invoice.project?.client?.name || null,
        contractNumber: invoice.project?.contract_number || null,
      })),
    };
  }

  private async estimateSummary(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const status = Array.isArray(input.status) ? input.status.map(String) : [];
    const limit = Math.min(Number(input.limit || 12) || 12, 30);
    const estimates = await prisma.estimate.findMany({
      where: {
        project: { company_id: companyId, status_project: getActiveProjectStatusFilter() },
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
            location: true,
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
      where: { id: projectId, company_id: companyId, status_project: getActiveProjectStatusFilter() },
      select: {
        id: true,
        contract_number: true,
        location: true,
        price: true,
        client: { select: { name: true } },
        invoices: { select: { totalAmount: true, status: true } },
        workedHours: { select: { subcontractor_id: true, amount_of_hours: true, hourly_price: true, fixed_price: true, type_price: true } },
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

    const employeeRows = await this.getEmployeeWorkedHours(companyId, { projectId });

    const latestEstimate = project.estimates[0] || null;
    const estimateValue = latestEstimate ? decimalToNumber(latestEstimate.totalAmount) : 0;
    const invoiced = project.invoices.reduce((acc: number, invoice: any) => acc + decimalToNumber(invoice.totalAmount), 0);
    const materialCost = project.serviceProject.reduce((acc: number, service: any) => {
      return acc + service.costProject.reduce((inner: number, cost: any) => inner + decimalToNumber(cost.price) * Number(cost.amout || 0), 0);
    }, 0);
    const employeeLaborCost = employeeRows.reduce((acc: number, item: any) => acc + getWorkedHourEffectiveCost(item).totalCost, 0);
    const subcontractorLaborCost = project.workedHours.reduce((acc: number, item: any) => {
      return acc + this.getSubcontractorEntryCost(item).totalCost;
    }, 0);
    const laborCost = employeeLaborCost + subcontractorLaborCost;
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
        ...(projectId ? { projectId } : { project: { company_id: companyId, status_project: getActiveProjectStatusFilter() } }),
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

  private getSubcontractorDateRange(input: Record<string, unknown>) {
    const exactDate = parseDateValue(input.date);
    if (exactDate) {
      return {
        startDate: startOfDay(exactDate),
        endDate: endOfDay(exactDate),
        useFilter: true,
      };
    }

    const explicitStart = parseDateValue(input.startDate);
    const explicitEnd = parseDateValue(input.endDate);
    if (explicitStart || explicitEnd) {
      return {
        startDate: explicitStart ? startOfDay(explicitStart) : new Date(2020, 0, 1),
        endDate: explicitEnd ? endOfDay(explicitEnd) : new Date(),
        useFilter: true,
      };
    }

    const period = String(input.period || "allPeriod");
    const now = new Date();

    switch (period) {
      case "thisWeek": {
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const startDate = new Date(now);
        startDate.setDate(now.getDate() + diffToMonday);
        return {
          startDate: startOfDay(startDate),
          endDate: now,
          useFilter: true,
        };
      }
      case "lastWeek": {
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const startDate = new Date(now);
        startDate.setDate(now.getDate() + diffToMonday - 7);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        return {
          startDate: startOfDay(startDate),
          endDate: endOfDay(endDate),
          useFilter: true,
        };
      }
      case "thisYear":
        return {
          startDate: new Date(now.getFullYear(), 0, 1),
          endDate: now,
          useFilter: true,
        };
      case "thisQuarter": {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        return {
          startDate: new Date(now.getFullYear(), quarterStartMonth, 1),
          endDate: now,
          useFilter: true,
        };
      }
      case "last3Months": {
        const startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        return {
          startDate,
          endDate: now,
          useFilter: true,
        };
      }
      case "lastMonth":
        return {
          startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          endDate: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
          useFilter: true,
        };
      case "thisMonth":
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1),
          endDate: now,
          useFilter: true,
        };
      case "last30Days": {
        const startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        return {
          startDate,
          endDate: now,
          useFilter: true,
        };
      }
      default:
        return {
          startDate: null,
          endDate: null,
          useFilter: false,
        };
    }
  }

  private buildSubcontractorDateFilter(input: Record<string, unknown>) {
    const range = this.getSubcontractorDateRange(input);
    if (!range.useFilter || !range.startDate) return undefined;

    const filter: Record<string, Date> = {
      gte: range.startDate,
    };
    if (range.endDate) {
      filter.lte = range.endDate;
    }

    return filter;
  }

  private getSubcontractorStatuses(input: Record<string, unknown>) {
    const rawStatuses = Array.isArray(input.status)
      ? input.status.map(String)
      : Array.isArray(input.status_project)
      ? input.status_project.map(String)
      : typeof input.status === "string"
      ? String(input.status).split(",")
      : typeof input.status_project === "string"
      ? String(input.status_project).split(",")
      : [];

    const expanded = expandProjectStatuses(rawStatuses);
    return expanded.filter((status) =>
      getActiveProjectStatuses().includes(status as typeof ACTIVE_PROJECT_STATUSES[number])
    );
  }

  private getSubcontractorEntryCost(row: {
    amount_of_hours?: unknown;
    hourly_price?: unknown;
    fixed_price?: unknown;
    type_price?: string | null;
  }) {
    const hours = decimalToNumber(row.amount_of_hours);
    const hourlyRate = decimalToNumber(row.hourly_price);
    const fixedPrice = decimalToNumber(row.fixed_price);

    if (row.type_price === "fixed") {
      return {
        totalCost: fixedPrice,
        totalHours: hours,
      };
    }

    if (hours > 0) {
      return {
        totalCost: hours * hourlyRate,
        totalHours: hours,
      };
    }

    return {
      totalCost: hourlyRate || fixedPrice,
      totalHours: hours,
    };
  }

  private getSubcontractorEntryServiceLabel(row: any) {
    return (
      row.subcontractor_service?.name ||
      row.subcontractor_service_project?.service_project?.name ||
      row.subcontractor_service_project?.sub_service_project?.name ||
      row.subcontractor_service_project?.custom_service_schedule?.name ||
      row.sub_services_project?.name ||
      row.custom_service_schedule?.name ||
      row.category?.category_name ||
      row.description ||
      "General cost"
    );
  }

  private buildMonthlyCostSeries(rows: any[], input: Record<string, unknown>) {
    const monthlyMap = new Map<string, { key: string; label: string; value: number; date: Date }>();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const addMonth = (date: Date) => {
      const monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          key,
          label: `${monthNames[monthDate.getMonth()]}/${monthDate.getFullYear()}`,
          value: 0,
          date: monthDate,
        });
      }
      return monthlyMap.get(key)!;
    };

    for (const row of rows) {
      const baseDate = parseDateValue(row.payment_date) || parseDateValue(row.date_creation) || new Date();
      const bucket = addMonth(baseDate);
      bucket.value += this.getSubcontractorEntryCost(row).totalCost;
    }

    const range = this.getSubcontractorDateRange(input);
    if (range.useFilter && range.startDate) {
      const cursor = new Date(range.startDate.getFullYear(), range.startDate.getMonth(), 1);
      const end = new Date((range.endDate || new Date()).getFullYear(), (range.endDate || new Date()).getMonth(), 1);

      while (cursor <= end) {
        addMonth(cursor);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    return Array.from(monthlyMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(range.useFilter ? 0 : -12)
      .map(({ label, value }) => ({ month: label, value }));
  }

  private buildProjectStatusOverview(rows: any[]) {
    const statusOrder = [...ACTIVE_PROJECT_STATUSES];
    const projectMap = new Map<string, string>();

    for (const row of rows) {
      if (row.project?.id) {
        projectMap.set(row.project.id, row.project.status_project || "Unknown");
      }
    }

    const totalProjects = projectMap.size;
    const counts = new Map<string, number>();
    for (const status of projectMap.values()) {
      counts.set(status, (counts.get(status) || 0) + 1);
    }

    return {
      totalProjects,
      items: statusOrder
        .filter((status) => counts.has(status))
        .map((status) => ({
          label: status,
          value: counts.get(status) || 0,
          percentage: totalProjects ? ((counts.get(status) || 0) / totalProjects) * 100 : 0,
        })),
    };
  }

  private async resolveSubcontractor(companyId: string, input: Record<string, unknown>) {
    const subcontractorId = input.subcontractorId ? String(input.subcontractorId) : "";
    const subcontractorName = String(
      input.subcontractorName || input.name || input.search || ""
    ).trim();

    if (subcontractorId) {
      return prisma.subcontractor.findFirst({
        where: {
          id: subcontractorId,
          company_id: companyId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          date_creation: true,
        },
      });
    }

    if (!subcontractorName) return null;

    return prisma.subcontractor.findFirst({
      where: {
        company_id: companyId,
        OR: [
          { name: { contains: subcontractorName } },
          { email: { contains: subcontractorName } },
          { phone: { contains: subcontractorName } },
          { address: { contains: subcontractorName } },
        ],
      },
      orderBy: {
        date_creation: "desc",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        date_creation: true,
      },
    });
  }

  private async getEmployeeWorkedHours(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const workerName = input.workerName ? String(input.workerName).trim() : "";
    const dateFilter = buildAttendanceDateFilter(input);

    const attendances = await prisma.userAttendance.findMany({
      where: {
        company_id: companyId,
        ...(workerName
          ? {
              user: {
                OR: [
                  { name: { contains: workerName } },
                  { email: { contains: workerName } },
                ],
              },
            }
          : {}),
        ...(dateFilter ? { check_in_time: dateFilter } : {}),
        OR: [
          {
            UserServiceProject: {
              service_project: {
                Project: {
                  company_id: companyId,
                  status_project: { in: [...TIMECARD_PROJECT_STATUSES] },
                  ...(projectId ? { id: projectId } : {}),
                },
              },
            },
          },
          {
            UserServiceProject: {
              sub_service_project: {
                serviceProject: {
                  Project: {
                    company_id: companyId,
                    status_project: { in: [...TIMECARD_PROJECT_STATUSES] },
                    ...(projectId ? { id: projectId } : {}),
                  },
                },
              },
            },
          },
          {
            UserServiceProject: {
              sub_service_project: {
                custom_service_schedule: {
                  project: {
                    company_id: companyId,
                    status_project: { in: [...TIMECARD_PROJECT_STATUSES] },
                    ...(projectId ? { id: projectId } : {}),
                  },
                },
              },
            },
          },
          {
            UserServiceProject: {
              custom_service_schedule: {
                project: {
                  company_id: companyId,
                  status_project: { in: [...TIMECARD_PROJECT_STATUSES] },
                  ...(projectId ? { id: projectId } : {}),
                },
              },
            },
          },
          {
            UserServiceProject: {
              service_project: {
                projectId: null,
                company_id: companyId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        date: true,
        check_in_time: true,
        check_out_time: true,
        workStartTime: true,
        workEndTime: true,
        isOvertime: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            hourly_price: true,
            isOverTime: true,
            defaultBreakMinutes: true,
            dailyRate: true,
          },
        },
        UserServiceProject: {
          select: {
            id: true,
            category: {
              select: {
                id: true,
                category_name: true,
              },
            },
            service_project: {
              select: {
                id: true,
                name: true,
                projectId: true,
                company_id: true,
                Project: {
                  select: {
                    id: true,
                    contract_number: true,
                    location: true,
                    status_project: true,
                    price: true,
                    client: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            },
            sub_service_project: {
              select: {
                id: true,
                name: true,
                category: {
                  select: {
                    id: true,
                    category_name: true,
                  },
                },
                serviceProject: {
                  select: {
                    id: true,
                    name: true,
                    Project: {
                      select: {
                        id: true,
                        contract_number: true,
                        location: true,
                        status_project: true,
                        price: true,
                        client: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
                custom_service_schedule: {
                  select: {
                    id: true,
                    name: true,
                    project: {
                      select: {
                        id: true,
                        contract_number: true,
                        location: true,
                        status_project: true,
                        price: true,
                        client: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            },
            custom_service_schedule: {
              select: {
                id: true,
                name: true,
                category: {
                  select: {
                    id: true,
                    category_name: true,
                  },
                },
                project: {
                  select: {
                    id: true,
                    contract_number: true,
                    location: true,
                    status_project: true,
                    price: true,
                    client: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        check_in_time: "desc",
      },
    });

    const resolveProjectContext = (attendance: any) => {
      const directProject = attendance.UserServiceProject?.service_project?.Project || null;
      const subServiceProject = attendance.UserServiceProject?.sub_service_project || null;
      const customSchedule = attendance.UserServiceProject?.custom_service_schedule || null;
      const project =
        directProject ||
        subServiceProject?.serviceProject?.Project ||
        subServiceProject?.custom_service_schedule?.project ||
        customSchedule?.project ||
        null;

      const serviceName =
        attendance.UserServiceProject?.service_project?.name ||
        subServiceProject?.name ||
        customSchedule?.name ||
        null;

      const categoryName =
        attendance.UserServiceProject?.category?.category_name ||
        subServiceProject?.category?.category_name ||
        customSchedule?.category?.category_name ||
        null;

      return {
        project,
        serviceName,
        categoryName,
      };
    };

    const calculatedAttendances = timeService.calculatePeriodTotals(attendances as any[]);

    return calculatedAttendances
      .map((attendance: any) => {
        const context = resolveProjectContext(attendance);

        return {
          id: attendance.id,
          workerId: attendance.user?.id || null,
          workerName: attendance.user?.name || "Unknown worker",
          user: attendance.user,
          project: context.project,
          serviceName: context.serviceName,
          categoryName: context.categoryName,
          check_in_time: attendance.check_in_time,
          check_out_time: attendance.check_out_time,
          payment_date: attendance.date || attendance.check_in_time,
          date_creation: attendance.check_in_time,
          regular_hours: decimalToNumber(attendance.regular_hours),
          overtime_hours: decimalToNumber(attendance.overtime_hours),
          computed_total_hours: decimalToNumber(attendance.hours_worked),
          computed_total_cost: decimalToNumber(attendance.price),
          subcontractor: null,
        };
      })
      .sort((a, b) => new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime());
  }

  private async getSubcontractorWorkedHours(companyId: string, input: Record<string, unknown>) {
    const projectId = input.projectId ? String(input.projectId) : undefined;
    const search = String(input.search || "").trim();
    const statuses = this.getSubcontractorStatuses(input);
    const dateFilter = this.buildSubcontractorDateFilter(input);
    const subcontractor = await this.resolveSubcontractor(companyId, input);

    const dateScopedWhere = dateFilter
      ? {
          OR: [
            { payment_date: dateFilter },
            {
              AND: [{ payment_date: null }, { date_creation: dateFilter }],
            },
          ],
        }
      : {};

    return prisma.workedhours.findMany({
      where: {
        subcontractor_id: { not: null },
        OR: [
          { type_price: "fixed" },
          { type_price: "hourly" },
          { AND: [{ type_price: null }, { amount_of_hours: null }] },
        ],
        subcontractor: {
          company_id: companyId,
          ...(subcontractor?.id ? { id: subcontractor.id } : {}),
        },
        project: {
          company_id: companyId,
          ...(projectId ? { id: projectId } : {}),
          status_project: statuses.length ? { in: statuses } : getActiveProjectStatusFilter(),
        },
        ...(search
          ? {
              OR: [
                { description: { contains: search } },
                { subcontractor: { name: { contains: search } } },
                { subcontractor: { email: { contains: search } } },
                { project: { location: { contains: search } } },
                { project: { client: { name: { contains: search } } } },
                { subcontractor_service: { name: { contains: search } } },
                { category: { category_name: { contains: search } } },
              ],
            }
          : {}),
        ...dateScopedWhere,
      },
      select: {
        id: true,
        name_user: true,
        amount_of_hours: true,
        hourly_price: true,
        fixed_price: true,
        type_price: true,
        start_date: true,
        end_date: true,
        description: true,
        payment_date: true,
        date_creation: true,
        subcontractor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        subcontractor_service: {
          select: {
            id: true,
            name: true,
          },
        },
        subcontractor_service_project: {
          select: {
            id: true,
            service_project: { select: { id: true, name: true } },
            sub_service_project: { select: { id: true, name: true } },
            custom_service_schedule: { select: { id: true, name: true } },
          },
        },
        sub_services_project: {
          select: {
            id: true,
            name: true,
          },
        },
        custom_service_schedule: {
          select: {
            id: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            category_name: true,
          },
        },
        project: {
          select: {
            id: true,
            contract_number: true,
            location: true,
            status_project: true,
            price: true,
            client: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ payment_date: "desc" }, { date_creation: "desc" }],
    });
  }

  private async timecardSummary(companyId: string, input: Record<string, unknown>) {
    const workedHours = await this.getEmployeeWorkedHours(companyId, input);
    const dateContext = describeRequestedDateRange(input);

    const byProject = new Map<string, { projectId: string; projectName: string; projectAddress: string | null; clientName: string | null; totalHours: number; totalCost: number; entries: number }>();
    const byWorker = new Map<string, { workerName: string; totalHours: number; totalCost: number; entries: number }>();

    for (const row of workedHours) {
      const { totalCost, totalHours } = getWorkedHourEffectiveCost(row);
      const projectKey = row.project?.id || "unknown";
      const workerName = getWorkedHourWorkerName(row);

      const projectCurrent = byProject.get(projectKey) || {
        projectId: row.project?.id || "unknown",
        projectName: row.project ? getProjectDisplayName(row.project) : "Project N/A",
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
        totalHours: 0,
        totalCost: 0,
        entries: 0,
      };
      projectCurrent.totalHours += totalHours;
      projectCurrent.totalCost += totalCost;
      projectCurrent.entries += 1;
      byProject.set(projectKey, projectCurrent);

      const workerCurrent = byWorker.get(workerName) || {
        workerName,
        totalHours: 0,
        totalCost: 0,
        entries: 0,
      };
      workerCurrent.totalHours += totalHours;
      workerCurrent.totalCost += totalCost;
      workerCurrent.entries += 1;
      byWorker.set(workerName, workerCurrent);
    }

    return {
      period: dateContext.period,
      periodLabel: dateContext.periodLabel,
      dateRangeLabel: dateContext.dateRangeLabel,
      totalEntries: workedHours.length,
      totalHours: workedHours.reduce((acc: number, row: any) => acc + getWorkedHourEffectiveCost(row).totalHours, 0),
      totalCost: workedHours.reduce((acc: number, row: any) => acc + getWorkedHourEffectiveCost(row).totalCost, 0),
      byProject: Array.from(byProject.values()).sort((a, b) => b.totalCost - a.totalCost),
      byWorker: Array.from(byWorker.values()).sort((a, b) => b.totalCost - a.totalCost).slice(0, 10),
    };
  }

  private async employeeVsSubcontractorSpend(companyId: string, input: Record<string, unknown>) {
    const [employeeRows, subcontractorRows] = await Promise.all([
      this.getEmployeeWorkedHours(companyId, input),
      this.getSubcontractorWorkedHours(companyId, input),
    ]);
    const dateContext = describeRequestedDateRange(input);

    const employeeProjectIds = new Set<string>();
    const subcontractorProjectIds = new Set<string>();

    const employeeTotalCost = employeeRows.reduce((acc: number, row: any) => {
      if (row.project?.id) employeeProjectIds.add(row.project.id);
      return acc + getWorkedHourEffectiveCost(row).totalCost;
    }, 0);

    const employeeTotalHours = employeeRows.reduce((acc: number, row: any) => {
      return acc + getWorkedHourEffectiveCost(row).totalHours;
    }, 0);

    const subcontractorTotalCost = subcontractorRows.reduce((acc: number, row: any) => {
      if (row.project?.id) subcontractorProjectIds.add(row.project.id);
      return acc + this.getSubcontractorEntryCost(row).totalCost;
    }, 0);

    const subcontractorTotalHours = subcontractorRows.reduce((acc: number, row: any) => {
      return acc + this.getSubcontractorEntryCost(row).totalHours;
    }, 0);

    return {
      period: dateContext.period,
      periodLabel: dateContext.periodLabel,
      dateRangeLabel: dateContext.dateRangeLabel,
      totals: {
        employeeCost: employeeTotalCost,
        subcontractorCost: subcontractorTotalCost,
        totalCost: employeeTotalCost + subcontractorTotalCost,
        projectCount: new Set<string>([...employeeProjectIds, ...subcontractorProjectIds]).size,
      },
      employee: {
        totalEntries: employeeRows.length,
        totalHours: employeeTotalHours,
        totalCost: employeeTotalCost,
        projectCount: employeeProjectIds.size,
      },
      subcontractor: {
        totalEntries: subcontractorRows.length,
        totalHours: subcontractorTotalHours,
        totalCost: subcontractorTotalCost,
        projectCount: subcontractorProjectIds.size,
      },
    };
  }

  private async timecardsByWorker(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 25) || 25, 100);
    const workedHours = await this.getEmployeeWorkedHours(companyId, input);
    const dateContext = describeRequestedDateRange(input);

    const byWorker = new Map<string, {
      workerId: string | null;
      workerName: string;
      totalHours: number;
      totalCost: number;
      entryCount: number;
      regularHours: number;
      overtimeHours: number;
      topProjectName: string | null;
      topProjectAddress: string | null;
      topProjectClientName: string | null;
      topProjectCost: number;
      projectTotals: Map<string, { totalCost: number; projectName: string | null; projectAddress: string | null; clientName: string | null }>;
    }>();

    for (const row of workedHours) {
      const workerName = getWorkedHourWorkerName(row);
      const { totalCost, totalHours } = getWorkedHourEffectiveCost(row);
      const current = byWorker.get(workerName) || {
        workerId: row.workerId || row.user?.id || null,
        workerName,
        totalHours: 0,
        totalCost: 0,
        entryCount: 0,
        regularHours: 0,
        overtimeHours: 0,
        topProjectName: null,
        topProjectAddress: null,
        topProjectClientName: null,
        topProjectCost: 0,
        projectTotals: new Map(),
      };

      current.totalHours += totalHours;
      current.totalCost += totalCost;
      current.entryCount += 1;
      current.regularHours += decimalToNumber(row.regular_hours);
      current.overtimeHours += decimalToNumber(row.overtime_hours);
      const projectKey = row.project?.id || row.project?.location || row.project?.contract_number || "unknown";
      const projectCurrent = current.projectTotals.get(String(projectKey)) || {
        totalCost: 0,
        projectName: row.project ? getProjectDisplayName(row.project) : null,
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
      };
      projectCurrent.totalCost += totalCost;
      current.projectTotals.set(String(projectKey), projectCurrent);

      if (projectCurrent.totalCost >= current.topProjectCost) {
        current.topProjectCost = projectCurrent.totalCost;
        current.topProjectName = projectCurrent.projectName;
        current.topProjectAddress = projectCurrent.projectAddress;
        current.topProjectClientName = projectCurrent.clientName;
      }
      byWorker.set(workerName, current);
    }

    return {
      period: dateContext.period,
      periodLabel: dateContext.periodLabel,
      dateRangeLabel: dateContext.dateRangeLabel,
      totalWorkers: byWorker.size,
      totalEntries: workedHours.length,
      items: Array.from(byWorker.values())
        .map(({ projectTotals, ...item }) => item)
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, limit),
    };
  }

  private async workerTimecardDetails(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 25) || 25, 100);
    const workerName = String(input.workerName || "").trim();
    const workedHours = await this.getEmployeeWorkedHours(companyId, { ...input, workerName });
    const dateContext = describeRequestedDateRange(input);

    const sortedRows = [...workedHours].sort((a: any, b: any) => {
      const aDate = new Date(a.payment_date || a.date_creation || 0).getTime();
      const bDate = new Date(b.payment_date || b.date_creation || 0).getTime();
      return bDate - aDate;
    });

    const entries = sortedRows.slice(0, limit).map((row: any) => {
      const { totalCost, totalHours } = getWorkedHourEffectiveCost(row);
      const workDate = row.payment_date || row.date_creation;

      return {
        id: row.id,
        workerId: row.workerId || row.user?.id || null,
        workerName: getWorkedHourWorkerName(row),
        projectId: row.project?.id || null,
        projectName: row.project ? getProjectDisplayName(row.project) : null,
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
        workDate,
        workDateLabel: workDate ? new Date(workDate).toISOString().slice(0, 10) : "N/A",
        checkInTime: row.check_in_time || null,
        checkOutTime: row.check_out_time || null,
        totalHours,
        regularHours: decimalToNumber(row.regular_hours),
        overtimeHours: decimalToNumber(row.overtime_hours),
        totalCost,
        hourlyRate: decimalToNumber(row.user?.hourly_price),
        serviceName: row.serviceName || null,
        categoryName: row.categoryName || null,
      };
    });

    return {
      workerName,
      period: dateContext.period,
      periodLabel: dateContext.periodLabel,
      dateRangeLabel: dateContext.dateRangeLabel,
      totalEntries: workedHours.length,
      totalHours: workedHours.reduce((acc: number, row: any) => acc + getWorkedHourEffectiveCost(row).totalHours, 0),
      totalCost: workedHours.reduce((acc: number, row: any) => acc + getWorkedHourEffectiveCost(row).totalCost, 0),
      entries,
    };
  }

  private async timecardsByProject(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 25) || 25, 100);
    const workedHours = await this.getEmployeeWorkedHours(companyId, input);
    const dateContext = describeRequestedDateRange(input);
    const byProject = new Map<string, {
      projectId: string;
      projectName: string;
      projectAddress: string | null;
      clientName: string | null;
      totalHours: number;
      totalCost: number;
      entryCount: number;
      topWorkerName: string | null;
      topWorkerCost: number;
      workerTotals: Map<string, number>;
    }>();

    for (const row of workedHours) {
      const key = row.project?.id || "unknown";
      const { totalCost, totalHours } = getWorkedHourEffectiveCost(row);
      const current = byProject.get(key) || {
        projectId: row.project?.id || "unknown",
        projectName: row.project ? getProjectDisplayName(row.project) : "Project N/A",
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
        totalHours: 0,
        totalCost: 0,
        entryCount: 0,
        topWorkerName: null,
        topWorkerCost: 0,
        workerTotals: new Map(),
      };

      current.totalHours += totalHours;
      current.totalCost += totalCost;
      current.entryCount += 1;
      const workerName = getWorkedHourWorkerName(row);
      const workerTotal = (current.workerTotals.get(workerName) || 0) + totalCost;
      current.workerTotals.set(workerName, workerTotal);
      if (workerTotal >= current.topWorkerCost) {
        current.topWorkerCost = workerTotal;
        current.topWorkerName = workerName;
      }
      byProject.set(key, current);
    }

    return {
      period: dateContext.period,
      periodLabel: dateContext.periodLabel,
      dateRangeLabel: dateContext.dateRangeLabel,
      totalProjects: byProject.size,
      totalEntries: workedHours.length,
      items: Array.from(byProject.values())
        .map(({ workerTotals, ...item }) => item)
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, limit),
    };
  }

  private async timecardsDailyBreakdown(companyId: string, input: Record<string, unknown>) {
    const workedHours = await this.getEmployeeWorkedHours(companyId, input);
    const dateContext = describeRequestedDateRange(input);
    const byDate = new Map<string, { dateLabel: string; totalHours: number; totalCost: number; entries: number }>();

    for (const row of workedHours) {
      const { totalCost, totalHours } = getWorkedHourEffectiveCost(row);
      const dateValue = row.payment_date || row.date_creation;
      const dateLabel = dateValue ? new Date(dateValue).toISOString().slice(0, 10) : "N/A";
      const current = byDate.get(dateLabel) || {
        dateLabel,
        totalHours: 0,
        totalCost: 0,
        entries: 0,
      };

      current.totalHours += totalHours;
      current.totalCost += totalCost;
      current.entries += 1;
      byDate.set(dateLabel, current);
    }

    const items = Array.from(byDate.values()).sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));

    return {
      period: dateContext.period,
      periodLabel: dateContext.periodLabel,
      dateRangeLabel: dateContext.dateRangeLabel,
      totalHours: items.reduce((acc, item) => acc + item.totalHours, 0),
      totalCost: items.reduce((acc, item) => acc + item.totalCost, 0),
      items,
    };
  }

  private async subcontractorSummary(companyId: string, input: Record<string, unknown>) {
    const limit = Math.min(Number(input.limit || 10) || 10, 30);
    const search = String(input.search || "").trim();

    const [subcontractors, workedHours] = await Promise.all([
      prisma.subcontractor.findMany({
        where: {
          company_id: companyId,
          ...(search
            ? {
                OR: [
                  { name: { contains: search } },
                  { email: { contains: search } },
                  { phone: { contains: search } },
                  { address: { contains: search } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          date_creation: true,
        },
        orderBy: { date_creation: "desc" },
      }),
      this.getSubcontractorWorkedHours(companyId, input),
    ]);

    const summaryBySubcontractor = new Map<
      string,
      {
        subcontractorId: string;
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
        totalHours: number;
        totalCost: number;
        projectIds: Set<string>;
        topProjectName: string | null;
        topProjectAddress: string | null;
        topProjectClientName: string | null;
        topProjectCost: number;
        entryCount: number;
        lastPaymentDate: string | null;
      }
    >();

    for (const subcontractor of subcontractors) {
      summaryBySubcontractor.set(subcontractor.id, {
        subcontractorId: subcontractor.id,
        name: subcontractor.name,
        email: subcontractor.email || null,
        phone: subcontractor.phone || null,
        address: subcontractor.address || null,
        totalHours: 0,
        totalCost: 0,
        projectIds: new Set<string>(),
        topProjectName: null,
        topProjectAddress: null,
        topProjectClientName: null,
        topProjectCost: 0,
        entryCount: 0,
        lastPaymentDate: null,
      });
    }

    for (const row of workedHours) {
      const subcontractor = row.subcontractor;
      if (!subcontractor) continue;

      const { totalCost, totalHours } = this.getSubcontractorEntryCost(row);
      const current = summaryBySubcontractor.get(subcontractor.id) || {
        subcontractorId: subcontractor.id,
        name: subcontractor.name,
        email: subcontractor.email || null,
        phone: subcontractor.phone || null,
        address: subcontractor.address || null,
        totalHours: 0,
        totalCost: 0,
        projectIds: new Set<string>(),
        topProjectName: null,
        topProjectAddress: null,
        topProjectClientName: null,
        topProjectCost: 0,
        entryCount: 0,
        lastPaymentDate: null,
      };

      current.totalHours += totalHours;
      current.totalCost += totalCost;
      current.entryCount += 1;

      if (row.project?.id) {
        current.projectIds.add(row.project.id);
      }

      if (totalCost >= current.topProjectCost) {
        current.topProjectCost = totalCost;
        current.topProjectName = row.project ? getProjectDisplayName(row.project) : null;
        current.topProjectAddress = row.project?.location || null;
        current.topProjectClientName = row.project?.client?.name || null;
      }

      const paymentDate = parseDateValue(row.payment_date) || parseDateValue(row.date_creation);
      if (paymentDate && (!current.lastPaymentDate || paymentDate > new Date(current.lastPaymentDate))) {
        current.lastPaymentDate = paymentDate.toISOString();
      }

      summaryBySubcontractor.set(subcontractor.id, current);
    }

    const items = Array.from(summaryBySubcontractor.values())
      .map(({ projectIds, ...item }) => ({
        ...item,
        projectCount: projectIds.size,
        averageProjectCost: projectIds.size ? item.totalCost / projectIds.size : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const projectIds = new Set<string>();
    for (const row of workedHours) {
      if (row.project?.id) projectIds.add(row.project.id);
    }

    return {
      totalSubcontractors: summaryBySubcontractor.size,
      totals: {
        totalSubcontractorCosts: items.reduce((acc, item) => acc + item.totalCost, 0),
        totalProjects: projectIds.size,
        averageSubcontractorCost: projectIds.size
          ? items.reduce((acc, item) => acc + item.totalCost, 0) / projectIds.size
          : 0,
      },
      monthlySales: this.buildMonthlyCostSeries(workedHours, input),
      statusOverview: this.buildProjectStatusOverview(workedHours),
      items: items.slice(0, limit),
    };
  }

  private async listSubcontractors(companyId: string, input: Record<string, unknown>) {
    return this.subcontractorSummary(companyId, input);
  }

  private async getSubcontractorDetails(companyId: string, input: Record<string, unknown>) {
    const subcontractor = await this.resolveSubcontractor(companyId, input);
    if (!subcontractor) {
      return { error: "Subcontractor not found" };
    }

    const limit = Math.min(Number(input.limit || 200) || 200, 500);
    const workedHours = await this.getSubcontractorWorkedHours(companyId, {
      ...input,
      subcontractorId: subcontractor.id,
    });

    const projectsMap = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        projectAddress: string | null;
        clientName: string | null;
        contractNumber: number | string | null;
        status: string | null;
        soldValue: number;
        totalCost: number;
        totalHours: number;
        entryCount: number;
        latestPaymentDate: string | null;
      }
    >();

    const categoryTotals = new Map<string, number>();
    let totalCost = 0;
    let totalHours = 0;
    let latestPaymentDate: string | null = null;

    for (const row of workedHours) {
      const { totalCost: entryCost, totalHours: entryHours } = this.getSubcontractorEntryCost(row);
      totalCost += entryCost;
      totalHours += entryHours;

      const projectKey = row.project?.id || "unknown";
      const projectCurrent = projectsMap.get(projectKey) || {
        projectId: row.project?.id || "unknown",
        projectName: row.project ? getProjectDisplayName(row.project) : "Project N/A",
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
        contractNumber: row.project?.contract_number || null,
        status: row.project?.status_project || null,
        soldValue: decimalToNumber(row.project?.price),
        totalCost: 0,
        totalHours: 0,
        entryCount: 0,
        latestPaymentDate: null,
      };
      projectCurrent.totalCost += entryCost;
      projectCurrent.totalHours += entryHours;
      projectCurrent.entryCount += 1;

      const paymentDate = parseDateValue(row.payment_date) || parseDateValue(row.date_creation);
      if (paymentDate) {
        const iso = paymentDate.toISOString();
        if (!projectCurrent.latestPaymentDate || paymentDate > new Date(projectCurrent.latestPaymentDate)) {
          projectCurrent.latestPaymentDate = iso;
        }
        if (!latestPaymentDate || paymentDate > new Date(latestPaymentDate)) {
          latestPaymentDate = iso;
        }
      }

      projectsMap.set(projectKey, projectCurrent);

      const categoryLabel = this.getSubcontractorEntryServiceLabel(row);
      categoryTotals.set(categoryLabel, (categoryTotals.get(categoryLabel) || 0) + entryCost);
    }

    const projectItems = Array.from(projectsMap.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .map((project) => ({
        ...project,
        costShareOfProject: project.soldValue ? project.totalCost / project.soldValue : null,
      }));

    return {
      subcontractorId: subcontractor.id,
      subcontractor,
      totals: {
        totalCost,
        totalHours,
        totalProjects: projectItems.length,
        totalEntries: workedHours.length,
        averageCostPerProject: projectItems.length ? totalCost / projectItems.length : 0,
      },
      latestPaymentDate,
      monthlySales: this.buildMonthlyCostSeries(workedHours, input),
      statusOverview: this.buildProjectStatusOverview(workedHours),
      costBreakdown: Array.from(categoryTotals.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      projects: projectItems,
      entries: workedHours.slice(0, limit).map((row) => {
        const { totalCost: entryCost, totalHours: entryHours } = this.getSubcontractorEntryCost(row);
        return {
          id: row.id,
          projectId: row.project?.id || null,
          projectName: row.project ? getProjectDisplayName(row.project) : null,
          projectAddress: row.project?.location || null,
          clientName: row.project?.client?.name || null,
          projectStatus: row.project?.status_project || null,
          contractNumber: row.project?.contract_number || null,
          startDate: row.start_date || null,
          endDate: row.end_date || null,
          paymentDate: row.payment_date || null,
          createdAt: row.date_creation,
          description: row.description || null,
          serviceName: this.getSubcontractorEntryServiceLabel(row),
          categoryName: row.category?.category_name || null,
          priceType: row.type_price || (decimalToNumber(row.amount_of_hours) > 0 ? "hourly" : "fixed"),
          hourlyPrice: decimalToNumber(row.hourly_price),
          fixedPrice: decimalToNumber(row.fixed_price),
          totalHours: entryHours,
          totalCost: entryCost,
        };
      }),
    };
  }

  private async subcontractorProjects(companyId: string, input: Record<string, unknown>) {
    const details = await this.getSubcontractorDetails(companyId, input);
    if ((details as any).error) return details;

    const typedDetails = details as any;
    const limit = Math.min(Number(input.limit || 50) || 50, 200);
    return {
      subcontractorId: typedDetails.subcontractorId,
      subcontractor: typedDetails.subcontractor,
      totalProjects: typedDetails.projects.length,
      totals: typedDetails.totals,
      monthlySales: typedDetails.monthlySales,
      statusOverview: typedDetails.statusOverview,
      items: typedDetails.projects.slice(0, limit),
    };
  }

  private async subcontractorCostEntries(companyId: string, input: Record<string, unknown>) {
    const subcontractor = await this.resolveSubcontractor(companyId, input);
    if (!subcontractor) {
      return { error: "Subcontractor not found" };
    }

    const limit = Math.min(Number(input.limit || 250) || 250, 1000);
    const workedHours = await this.getSubcontractorWorkedHours(companyId, {
      ...input,
      subcontractorId: subcontractor.id,
    });

    const categoryTotals = new Map<string, number>();
    const items = workedHours.map((row) => {
      const { totalCost, totalHours } = this.getSubcontractorEntryCost(row);
      const categoryLabel = this.getSubcontractorEntryServiceLabel(row);
      categoryTotals.set(categoryLabel, (categoryTotals.get(categoryLabel) || 0) + totalCost);

      return {
        id: row.id,
        projectId: row.project?.id || null,
        projectName: row.project ? getProjectDisplayName(row.project) : null,
        projectAddress: row.project?.location || null,
        clientName: row.project?.client?.name || null,
        projectStatus: row.project?.status_project || null,
        contractNumber: row.project?.contract_number || null,
        startDate: row.start_date || null,
        endDate: row.end_date || null,
        paymentDate: row.payment_date || null,
        createdAt: row.date_creation,
        description: row.description || null,
        serviceName: categoryLabel,
        categoryName: row.category?.category_name || null,
        priceType: row.type_price || (decimalToNumber(row.amount_of_hours) > 0 ? "hourly" : "fixed"),
        hourlyPrice: decimalToNumber(row.hourly_price),
        fixedPrice: decimalToNumber(row.fixed_price),
        totalHours,
        totalCost,
      };
    });

    return {
      subcontractorId: subcontractor.id,
      subcontractor,
      totalEntries: items.length,
      returnedEntries: Math.min(items.length, limit),
      totals: {
        totalCost: items.reduce((acc: number, entry: any) => acc + entry.totalCost, 0),
        totalHours: items.reduce((acc: number, entry: any) => acc + entry.totalHours, 0),
      },
      costBreakdown: Array.from(categoryTotals.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      items: items.slice(0, limit),
    };
  }

  private async companyOverview(companyId: string) {
    const [projectCount, clientCount, invoiceCount, topProjects, invoices] = await Promise.all([
      prisma.project.count({ where: { company_id: companyId, status_project: getActiveProjectStatusFilter() } }),
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
      const { structured, executedTools, responseId } = await this.synthesizeResponse(trimmedContent, historyBeforeCurrentQuestion.slice(-12), companyId);

      const assistantMessage = await insertMessage({
        threadId,
        role: "assistant",
        content: structured.content,
        report: structured.report || null,
      toolsUsed: executedTools.map((tool: ExecutedTool) => tool.tool),
        toolData: {
          bullets: structured.bullets || [],
          followUp: structured.followUp || null,
          responseId: responseId || null,
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
