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

  async reply(history: HelpChatMessage[], ctx: HelpAssistantContext): Promise<HelpAssistantReply> {
    if (!openai) {
      throw new Error("OPENAI_KEY is not configured");
    }

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
        return { content: extractText(response), toolsUsed, sources, report };
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
