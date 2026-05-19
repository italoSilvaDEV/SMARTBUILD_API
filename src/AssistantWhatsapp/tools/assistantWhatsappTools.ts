import { searchPlaybooks } from "../knowledge/playbooks";
import type { AssistantWhatsappSession, AssistantWhatsappToolResult } from "../types";
import { prisma } from "../../utils/prisma";
import { assistantWhatsappEnv } from "../config/env";

export function getAssistantWhatsappTools() {
  return [
    {
      type: "function",
      name: "searchSmartBuildKnowledge",
      description:
        "Search system usability playbooks for account access, Clients, Estimates, Settings, User Management, and Services/Materials. Use this before answering how-to, navigation, workflow, permission, common mistake, or bug-signal questions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      strict: false,
    },
    {
      type: "function",
      name: "checkCompanyEmailExists",
      description:
        "Check whether an exact company email exists for login troubleshooting. Use only the exact email provided by the user. Never search similar emails.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
        },
        required: ["email"],
      },
      strict: false,
    },
    {
      type: "function",
      name: "listActivePlans",
      description:
        "List active system sign-up plans with available names, prices, billing periods, employee limits, descriptions and features. Use when the user asks about prices, plans, benefits or limits.",
      parameters: {
        type: "object",
        properties: {},
      },
      strict: false,
    },
  ];
}

export async function executeAssistantWhatsappTool(params: {
  toolName: string;
  rawArgs: string;
  session: AssistantWhatsappSession;
  userMessage: string;
}): Promise<AssistantWhatsappToolResult> {
  const input = safeParseArgs(params.rawArgs);

  if (params.toolName === "searchSmartBuildKnowledge") {
    const query = typeof input.query === "string" && input.query.trim()
      ? input.query.trim()
      : params.userMessage;
    const matches = searchPlaybooks(query);
    return {
      tool: params.toolName,
      input: { query },
      output: {
        matches,
        guidance:
          "Answer only the user's exact question. Mention a prerequisite or common mistake only when it directly applies. Do not turn this into a full tutorial unless the user asks for a full walkthrough.",
      },
    };
  }

  if (params.toolName === "checkCompanyEmailExists") {
    const email = normalizeEmail(typeof input.email === "string" ? input.email : "");

    if (!email) {
      return {
        tool: params.toolName,
        input: { email: input.email || null },
        output: {
          exists: false,
          checked: false,
          reason: "invalid_or_missing_email",
          guidance: "Ask naturally for the company email used in the system account. Do not say the previous message is not an email.",
        },
      };
    }

    const rows = await prisma.company.findMany({
      where: { email },
      take: 1,
      select: { id: true },
    });

    return {
      tool: params.toolName,
      input: { email },
      output: {
        exists: rows.length > 0,
        checked: true,
        exactMatchOnly: true,
        loginUrl: getLoginUrl(),
        guidance: rows.length > 0
          ? `The company email exists in the system. If the user cannot log in, guide them to Forgot password below the password input at ${getLoginUrl()}.`
          : "The company email was not found in the system. Ask the user to confirm the email used during sign-up, without mentioning internal matching rules.",
      },
    };
  }

  if (params.toolName === "listActivePlans") {
    const plans = await prisma.plan.findMany({
      where: {
        isActive: true,
        isCampaign: false,
      },
      orderBy: [
        { validityType: "asc" },
        { validityDuration: "asc" },
        { price: "asc" },
      ],
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        features: true,
        validityType: true,
        validityDuration: true,
        allowedEmployees: true,
      },
    });

    return {
      tool: params.toolName,
      input,
      output: {
        plans: plans
          .filter((plan) => plan.validityType !== "FREE")
          .map((plan) => ({
            name: plan.name,
            description: plan.description,
            price: plan.price == null ? null : Number(plan.price),
            billingPeriod: describePlanPeriod(plan.validityType, plan.validityDuration),
            validityType: plan.validityType,
            validityDuration: plan.validityDuration,
            allowedEmployees: plan.allowedEmployees,
            features: plan.features || null,
          })),
        guidance:
          "Answer using only these plan fields. Do not invent missing benefits, limits or prices. Mention there is no free plan in this sign-up step.",
      },
    };
  }

  return {
    tool: params.toolName,
    input,
    output: { error: "Unknown tool" },
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function describePlanPeriod(validityType: string, validityDuration: number) {
  if (validityType === "ANNUAL") return "annual";
  if (validityType === "MONTHLY" && validityDuration === 3) return "quarterly";
  if (validityType === "MONTHLY") return "monthly";
  if (validityType === "DAYS") return `${validityDuration} days`;
  return validityType.toLowerCase();
}

function getLoginUrl() {
  const appUrl = assistantWhatsappEnv.publicAppUrl.replace(/\/$/, "");
  return appUrl ? `${appUrl}/login` : "the system login page";
}

function safeParseArgs(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
