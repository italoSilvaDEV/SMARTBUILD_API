import axios from "axios";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export class PushNotificationService {
  /**
   * Envia push notification para um ou mais Expo Push Tokens.
   * Ignora silenciosamente tokens inválidos ou ausentes.
   */
  static async sendPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
    // Filtrar mensagens sem token válido
    const validMessages = messages.filter(
      (m) => m.to && /^(ExponentPushToken|ExpoPushToken)\[/.test(m.to)
    );

    if (validMessages.length === 0) return;

    try {
      // Expo aceita batch de até 100 notificações por request
      const chunks = this.chunkArray(validMessages, 100);
      let acceptedCount = 0;

      for (const chunk of chunks) {
        const response = await axios.post<{ data?: ExpoPushTicket[] }>(EXPO_PUSH_URL, chunk, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

        const tickets = Array.isArray(response.data?.data) ? response.data.data : [];
        acceptedCount += tickets.filter((ticket) => ticket.status === "ok").length;

        tickets.forEach((ticket, index) => {
          if (ticket.status !== "error") return;
          console.error("[PushNotificationService] Expo rejected push", {
            token: this.maskToken(chunk[index]?.to),
            error: ticket.details?.error || "UNKNOWN_PUSH_ERROR",
            message: ticket.message || "Push notification was rejected",
          });
        });
      }

      console.log(
        `[PushNotificationService] Expo accepted ${acceptedCount}/${validMessages.length} push notification(s)`
      );
    } catch (error: any) {
      // Não lançar erro para não quebrar o fluxo principal (envio de mensagem)
      console.error(
        "[PushNotificationService] Error sending push:",
        error?.response?.data || error.message
      );
    }
  }

  /**
   * Envia push de nova mensagem de chat para uma lista de tokens.
   */
  static async sendChatMessagePush(
    tokens: string[],
    senderName: string,
    messageText: string,
    chatId: string
  ): Promise<void> {
    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title: `💬 ${senderName}`,
      body: messageText || "Sent you a message",
      data: { type: "chat_message", chatId },
      sound: "default",
      channelId: "chat",
    }));

    await this.sendPushNotifications(messages);
  }

  private static chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private static maskToken(token?: string): string {
    if (!token || token.length < 16) return "unknown";
    return `${token.slice(0, 12)}...${token.slice(-5)}`;
  }
}
