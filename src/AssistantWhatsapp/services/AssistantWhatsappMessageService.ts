import { AssistantWhatsappOpenAIService } from "./AssistantWhatsappOpenAIService";
import { AssistantWhatsappSessionService } from "./AssistantWhatsappSessionService";
import { MetaWhatsappService } from "./MetaWhatsappService";
import type { MetaWhatsappTextMessage } from "../types";
import { isCloseConversationRequest } from "../utils/text";

export class AssistantWhatsappMessageService {
  private readonly sessionService = new AssistantWhatsappSessionService();
  private readonly openAiService = new AssistantWhatsappOpenAIService();
  private readonly metaService = new MetaWhatsappService();

  async handleIncomingText(message: MetaWhatsappTextMessage) {
    if (await this.sessionService.hasMetaMessage(message.id)) {
      return { skipped: true, reason: "duplicate" };
    }

    const session = await this.sessionService.getOrCreateActiveSession(message.from, message.contactName || null);

    await this.sessionService.insertMessage({
      sessionId: session.id,
      role: "user",
      direction: "inbound",
      content: message.text,
      metaMessageId: message.id,
      rawPayload: message.raw,
    });

    await this.markIncomingMessageAsRead(message.id);

    if (isCloseConversationRequest(message.text)) {
      const closingText =
        "Perfeito, vou encerrar por aqui. Se precisar de ajuda de novo, é só mandar uma nova mensagem.";

      const metaResponses = await this.metaService.sendText(message.from, closingText);
      await this.sessionService.insertMessage({
        sessionId: session.id,
        role: "assistant",
        direction: "outbound",
        content: closingText,
        rawPayload: metaResponses,
      });
      await this.sessionService.closeSession(session.id, "user_request");

      return { skipped: false, closed: true };
    }

    const aiResult = await this.openAiService.answer({
      session,
      userMessage: message.text,
    });

    const metaResponses = await this.metaService.sendText(message.from, aiResult.text);
    await this.sessionService.insertMessage({
      sessionId: session.id,
      role: "assistant",
      direction: "outbound",
      content: aiResult.text,
      rawPayload: metaResponses,
      toolData: {
        responseId: aiResult.responseId,
        toolsUsed: aiResult.toolsUsed,
      },
    });

    await this.sessionService.updateOpenAiState(session.id, aiResult.responseId);

    return {
      skipped: false,
      closed: false,
      responseId: aiResult.responseId,
      toolsUsed: aiResult.toolsUsed.map((tool) => tool.tool),
    };
  }

  private async markIncomingMessageAsRead(messageId: string) {
    try {
      await this.metaService.markMessageAsRead(messageId);
    } catch (error) {
      console.error("[AssistantWhatsappMessageService.markIncomingMessageAsRead]", {
        metaMessageId: messageId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
