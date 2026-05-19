import OpenAI from "openai";
import { DateTime } from "luxon";
import { assistantWhatsappEnv } from "../config/env";
import { searchPlaybooks } from "../knowledge/playbooks";
import { ASSISTANT_WHATSAPP_SYSTEM_PROMPT } from "../prompts/systemPrompt";
import type { AssistantWhatsappModelResult, AssistantWhatsappSession, AssistantWhatsappToolResult } from "../types";
import { executeAssistantWhatsappTool, getAssistantWhatsappTools } from "../tools/assistantWhatsappTools";

const openai = assistantWhatsappEnv.openAiApiKey
  ? new OpenAI({ apiKey: assistantWhatsappEnv.openAiApiKey })
  : null;

export class AssistantWhatsappOpenAIService {
  async answer(params: {
    session: AssistantWhatsappSession;
    userMessage: string;
  }): Promise<AssistantWhatsappModelResult> {
    if (!openai) {
      return this.fallbackAnswer(params.userMessage);
    }

    const toolsUsed: AssistantWhatsappToolResult[] = [];
    let lastResponseId = params.session.lastResponseId || null;

    try {
      let response: any = await openai.responses.create({
        model: assistantWhatsappEnv.openAiModel,
        instructions: this.buildInstructions(),
        previous_response_id: lastResponseId || undefined,
        input: params.userMessage,
        tools: getAssistantWhatsappTools() as any,
      } as any);

      lastResponseId = response?.id || lastResponseId;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const toolCalls = this.getToolCalls(response);
        if (!toolCalls.length) break;

        const toolOutputs = [];
        for (const toolCall of toolCalls) {
          const toolResult = await executeAssistantWhatsappTool({
            toolName: String(toolCall?.name || ""),
            rawArgs: String(toolCall?.arguments || "{}"),
            session: params.session,
            userMessage: params.userMessage,
          });

          toolsUsed.push(toolResult);
          toolOutputs.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify(toolResult.output),
          });
        }

        response = await openai.responses.create({
          model: assistantWhatsappEnv.openAiModel,
          instructions: this.buildInstructions(),
          previous_response_id: lastResponseId || undefined,
          input: toolOutputs,
          tools: getAssistantWhatsappTools() as any,
        } as any);

        lastResponseId = response?.id || lastResponseId;
      }

      const text = this.getResponseText(response);
      return {
        text: text || "Não consegui montar uma resposta confiável agora. Pode me mandar a dúvida de outro jeito?",
        responseId: lastResponseId,
        toolsUsed,
      };
    } catch (error) {
      console.error("[AssistantWhatsappOpenAIService.answer]", {
        message: error instanceof Error ? error.message : String(error),
      });
      return this.fallbackAnswer(params.userMessage, lastResponseId, toolsUsed);
    }
  }

  private buildInstructions() {
    const today = DateTime.now().setZone("America/Sao_Paulo").toFormat("yyyy-MM-dd");
    return `${ASSISTANT_WHATSAPP_SYSTEM_PROMPT}\nToday is ${today}.`;
  }

  private getToolCalls(response: any) {
    const output = Array.isArray(response?.output) ? response.output : [];
    return output.filter((item: any) => item?.type === "function_call");
  }

  private getResponseText(response: any) {
    if (typeof response?.output_text === "string" && response.output_text.trim()) {
      return response.output_text.trim();
    }

    const output = Array.isArray(response?.output) ? response.output : [];
    const messageItem = output.find((item: any) => item?.type === "message");
    const content = Array.isArray(messageItem?.content) ? messageItem.content : [];

    return content
      .filter((item: any) => item?.type === "output_text" && typeof item.text === "string")
      .map((item: any) => item.text)
      .join("\n")
      .trim();
  }

  private fallbackAnswer(
    userMessage: string,
    responseId: string | null = null,
    existingTools: AssistantWhatsappToolResult[] = []
  ): AssistantWhatsappModelResult {
    const matches = searchPlaybooks(userMessage, 1);
    const match = matches[0];

    if (!match) {
      return {
        text:
          "Nesta V1 eu consigo ajudar com acesso/cadastro, Clients, Estimates, Settings, User Management e Services/Materials. Me manda a duvida com o nome da tela ou acao que voce esta tentando fazer que eu te guio no ponto certo.",
        responseId,
        toolsUsed: existingTools,
      };
    }

    return {
      text: match.directAnswer,
      responseId,
      toolsUsed: [
        ...existingTools,
        {
          tool: "searchSmartBuildKnowledge",
          input: { query: userMessage },
          output: { matches },
        },
      ],
    };
  }
}
