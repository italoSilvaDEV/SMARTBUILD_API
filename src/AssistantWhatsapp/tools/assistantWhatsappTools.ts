import { searchPlaybooks } from "../knowledge/playbooks";
import type { AssistantWhatsappSession, AssistantWhatsappToolResult } from "../types";

export function getAssistantWhatsappTools() {
  return [
    {
      type: "function",
      name: "searchSmartBuildKnowledge",
      description:
        "Search SmartBuild usability playbooks for Clients and Estimates. Use this before answering how-to, navigation, workflow, permission, common mistake, or bug-signal questions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
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

  return {
    tool: params.toolName,
    input,
    output: { error: "Unknown tool" },
  };
}

function safeParseArgs(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
