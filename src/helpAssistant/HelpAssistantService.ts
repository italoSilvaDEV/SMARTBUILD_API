import { detectLanguage } from "./language";
import { openai } from "./openaiClient";
import { buildSystemPrompt } from "./prompts";
import { getActiveSkills, isToolAllowed } from "./skills";
import { HelpAssistantContext, HelpAssistantReply, HelpChatMessage, HelpReport, HelpSource, HelpTool } from "./types";

const MODEL = "gpt-5-mini";
const REQUEST_TIMEOUT_MS = 90000;
const MAX_TOOL_ROUNDS = 6;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`help assistant timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function extractText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const output = Array.isArray(response?.output) ? response.output : [];
  return output
    .filter((item: any) => item?.type === "message")
    .flatMap((item: any) => (Array.isArray(item.content) ? item.content : []))
    .filter((part: any) => part?.type === "output_text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n")
    .trim();
}

/** Grupo correto de cada item do menu lateral. */
const MENU_GROUP: Record<string, string> = {
  Dashboard: "Platform",
  Reports: "Platform",
  "Job Schedule": "Schedule",
  "Job Dispatch": "Schedule",
  Projects: "Workflow",
  Clients: "Workflow",
  Subcontractors: "Workflow",
  "Work Orders": "Workflow",
  Activities: "Workflow",
  Estimates: "Financials",
  "Bid Requests": "Financials",
  Contracts: "Financials",
  Invoice: "Financials",
  "Accounts Payable": "Financials",
  "Time Cards": "Financials",
  Catalog: "Management",
  Services: "Management",
  "User Management": "Management",
  Settings: "Management",
};
const MENU_ITEMS = Object.keys(MENU_GROUP)
  .sort((a, b) => b.length - a.length)
  .join("|");
const MENU_PATH = new RegExp(String.raw`\b(Platform|Schedule|Workflow|Financials|Management)(\s*>\s*\**)(` + MENU_ITEMS + String.raw`)\b`, "g");
// "Workflow > Financials > Estimates": dois grupos seguidos; fica só o último.
const STACKED_GROUPS = /\b(?:Platform|Schedule|Workflow|Financials|Management)\s*>\s*\**(?=(?:Platform|Schedule|Workflow|Financials|Management)\b)/g;
// "Settings > Settings": o item repetido no lugar do grupo.
const REPEATED_ITEM = /\*{0,2}Settings\*{0,2}\s*>\s*(\*{0,2})Settings\b/g;

/** O modelo às vezes troca o grupo do menu (ex.: "Workflow > Estimates"); corrige pelo mapa oficial. */
export function fixMenuPaths(text: string): string {
  return text
    .replace(STACKED_GROUPS, "")
    .replace(REPEATED_ITEM, "Management > $1Settings")
    .replace(MENU_PATH, (_match, _group: string, separator: string, item: string) => `${MENU_GROUP[item]}${separator}${item}`);
}

/**
 * Limpa marcas técnicas que às vezes escapam do modelo: links malformados
 * como [texto](/rota]), links com marcador (<projectId>), linhas "Rota: ..."
 * e rotas cruas entre parênteses fora de um link. Também remove qualquer linha
 * que indique o IA Assistant antigo (/ai-assistant), desativado do menu.
 */
export function sanitizeAnswer(text: string): string {
  return text
    .replace(/^.*\/ai-assistant.*(\r?\n|$)/gim, "")
    .replace(/\[([^\]]+)\]\((\/[^)\]\s]*)\]/g, "[$1]($2)")
    .replace(/\[([^\]]+)\]\(\/[^)\s]*<[^>]+>[^)\s]*\)/g, "$1")
    .replace(/^\s*Rota:.*$/gim, "")
    .replace(/\s*\[\/[^\]\s]*\](?!\()/g, "")
    .replace(/(^|[^\]])\s*\((\/[A-Za-z0-9\-/:<>]*)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pergunta usada na busca: a última do usuário, com a anterior para dar contexto a follow-ups curtos. */
function buildRetrievalQuery(history: HelpChatMessage[]): string {
  const userMessages = history.filter((message) => message.role === "user").map((message) => message.content);
  const last = userMessages[userMessages.length - 1] ?? "";
  const previous = userMessages[userMessages.length - 2];
  return previous && last.length < 80 ? `${previous}\n${last}` : last;
}

export class HelpAssistantService {
  isConfigured() {
    return Boolean(openai);
  }

  async reply(history: HelpChatMessage[], requestCtx: HelpAssistantContext): Promise<HelpAssistantReply> {
    if (!openai) {
      throw new Error("OPENAI_KEY is not configured");
    }

    // O idioma da resposta segue a mensagem; o da interface é só o padrão.
    const lastQuestion = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
    const ctx: HelpAssistantContext = { ...requestCtx, language: detectLanguage(lastQuestion) ?? requestCtx.language };

    const skills = getActiveSkills(ctx);
    const query = buildRetrievalQuery(history);

    const contexts = await Promise.all(
      skills.map((skill) =>
        skill.buildContext
          ? skill.buildContext(query, ctx).catch((error) => {
              console.error(`[HelpAssistant] skill ${skill.id} context failed:`, error);
              return null;
            })
          : null
      )
    );
    const dynamicContext = contexts.flatMap((context) => (context ? [context.text] : []));
    const sources: HelpSource[] = contexts.flatMap((context) => context?.sources ?? []);

    const tools: HelpTool[] = skills.flatMap((skill) => skill.tools ?? []).filter((tool) => isToolAllowed(tool, ctx));
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    const toolDefs = tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    }));

    const instructions = buildSystemPrompt(ctx, skills, dynamicContext);
    const input: any[] = history.map((message) => ({ role: message.role, content: message.content }));
    const toolsUsed: string[] = [];
    let report: HelpReport | null = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const isLastRound = round === MAX_TOOL_ROUNDS;
      const response: any = await withTimeout(
        openai.responses.create({
          model: MODEL,
          instructions,
          input,
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          ...(toolDefs.length && !isLastRound ? { tools: toolDefs } : {}),
        } as any),
        REQUEST_TIMEOUT_MS
      );

      const calls = (Array.isArray(response?.output) ? response.output : []).filter(
        (item: any) => item?.type === "function_call"
      );

      if (!calls.length) {
        return { content: sanitizeAnswer(fixMenuPaths(extractText(response))), toolsUsed, sources, report };
      }

      input.push(...response.output);
      for (const call of calls) {
        const tool = toolsByName.get(call.name);
        let output: unknown;
        try {
          const args = call.arguments ? JSON.parse(call.arguments) : {};
          output = tool ? await tool.run(args, ctx) : { error: "unknown tool" };
          if (tool) toolsUsed.push(tool.name);
          if (tool?.producesReport && (output as any)?.report) {
            report = (output as any).report as HelpReport;
            output = { ok: true, shownToUser: true };
          }
        } catch (error) {
          console.error(`[HelpAssistant] tool ${call.name} failed:`, error);
          output = { error: "tool failed" };
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
      }
    }

    return { content: "", toolsUsed, sources, report };
  }
}
