import OpenAI from "openai";
import { DateTime } from "luxon";
import { assistantWhatsappEnv } from "../config/env";
import { searchPlaybooks } from "../knowledge/playbooks";
import { ASSISTANT_WHATSAPP_SYSTEM_PROMPT } from "../prompts/systemPrompt";
import type { AssistantWhatsappModelResult, AssistantWhatsappSession, AssistantWhatsappToolResult } from "../types";
import { executeAssistantWhatsappTool, getAssistantWhatsappTools } from "../tools/assistantWhatsappTools";
import { normalizeText } from "../utils/text";

const openai = assistantWhatsappEnv.openAiApiKey
  ? new OpenAI({ apiKey: assistantWhatsappEnv.openAiApiKey })
  : null;

export class AssistantWhatsappOpenAIService {
  async answer(params: {
    session: AssistantWhatsappSession;
    userMessage: string;
  }): Promise<AssistantWhatsappModelResult> {
    const guardedResponse = this.getGuardedResponse(params.userMessage);
    if (guardedResponse) return guardedResponse;

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

  private getGuardedResponse(userMessage: string): AssistantWhatsappModelResult | null {
    const normalized = normalizeText(userMessage);
    if (!normalized) return null;

    if (this.isPromptInjectionAttempt(normalized) || this.isClearlyOffTopic(normalized)) {
      return {
        text: this.buildScopeRedirect(userMessage),
        responseId: null,
        toolsUsed: [],
      };
    }

    return null;
  }

  private isPromptInjectionAttempt(normalized: string) {
    const phrases = [
      "ignore previous",
      "ignore all previous",
      "ignore your instructions",
      "ignore the instructions",
      "forget previous instructions",
      "system prompt",
      "developer message",
      "developer instructions",
      "hidden instructions",
      "show your prompt",
      "reveal your prompt",
      "print your prompt",
      "what is your prompt",
      "what are your instructions",
      "tool names",
      "available tools",
      "internal tools",
      "internal schema",
      "act as",
      "you are now",
      "dan mode",
      "jailbreak",
      "bypass your rules",
      "bypass restrictions",
      "ignore as instrucoes",
      "ignora as instrucoes",
      "ignore suas instrucoes",
      "ignora suas instrucoes",
      "desconsidere as instrucoes",
      "desconsidera as instrucoes",
      "esqueca as instrucoes",
      "instrucoes anteriores",
      "regras anteriores",
      "mensagem do sistema",
      "prompt do sistema",
      "mostre seu prompt",
      "mostra seu prompt",
      "qual e seu prompt",
      "qual seu prompt",
      "revele seu prompt",
      "revelar seu prompt",
      "modo desenvolvedor",
      "voce agora e",
      "finja que",
      "finge que",
      "aja como",
      "faca de conta",
      "burlar suas regras",
      "hackear",
      "ignora las instrucciones",
      "olvida las instrucciones",
      "instrucciones anteriores",
      "mensaje del sistema",
      "prompt del sistema",
      "muestra tu prompt",
      "revela tu prompt",
      "actua como",
      "haz de cuenta",
    ];

    return phrases.some((phrase) => this.includesPhrase(normalized, phrase));
  }

  private isClearlyOffTopic(normalized: string) {
    const offTopicPhrases = [
      "neymar",
      "convocado",
      "convocou",
      "convocacao",
      "selecao brasileira",
      "cbf",
      "futebol",
      "soccer",
      "placar",
      "copa do mundo",
      "libertadores",
      "brasileirao",
      "champions league",
      "flamengo",
      "corinthians",
      "palmeiras",
      "santos futebol",
      "vasco",
      "messi",
      "cristiano ronaldo",
      "nba",
      "nfl",
      "ufc",
      "previsao do tempo",
      "weather forecast",
      "temperatura hoje",
      "noticia de hoje",
      "latest news",
      "eleicao",
      "politica",
      "presidente do brasil",
      "receita de",
      "horoscopo",
    ];

    return offTopicPhrases.some((phrase) => this.includesPhrase(normalized, phrase));
  }

  private includesPhrase(normalized: string, phrase: string) {
    const safePhrase = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${safePhrase}(\\s|$)`).test(normalized);
  }

  private buildScopeRedirect(userMessage: string) {
    const language = this.detectMessageLanguage(userMessage);

    if (language === "en") {
      return "I can help only with questions about the system. Tell me which screen or action you need help with.";
    }

    if (language === "es") {
      return "Puedo ayudar solo con dudas sobre el sistema. Dime que pantalla o accion necesitas hacer.";
    }

    return "Eu consigo ajudar apenas com duvidas sobre o sistema. Me diga qual tela ou acao voce quer fazer.";
  }

  private detectMessageLanguage(userMessage: string): "pt" | "en" | "es" {
    const normalized = normalizeText(userMessage);

    if (/\b(ayuda|pantalla|accion|necesito|quiero|donde|como hago|contrasena)\b/.test(normalized)) {
      return "es";
    }

    if (/\b(how|what|where|which|who|help|screen|action|password|sign up)\b/.test(normalized)) {
      return "en";
    }

    return "pt";
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
          "Eu consigo ajudar com acesso/cadastro, Clients, Estimates, Projects, Invoices, Settings, User Management e Services/Materials. Me manda a duvida com o nome da tela ou acao que voce esta tentando fazer que eu te guio no ponto certo.",
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
