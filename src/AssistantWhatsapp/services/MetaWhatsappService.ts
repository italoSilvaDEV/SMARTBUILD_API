import axios from "axios";
import { assistantWhatsappEnv, assertMetaSendConfig } from "../config/env";
import type { MetaWhatsappTextMessage } from "../types";
import { trimForWhatsapp } from "../utils/text";

export class MetaWhatsappService {
  async sendText(to: string, body: string) {
    assertMetaSendConfig();

    const chunks = trimForWhatsapp(body, assistantWhatsappEnv.maxWhatsappTextLength);
    const responses = [];

    for (const chunk of chunks) {
      const response = await axios.post(
        this.messagesUrl(),
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: chunk,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${assistantWhatsappEnv.metaAccessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
        }
      );
      responses.push(response.data);
    }

    return responses;
  }

  extractTextMessages(payload: any): MetaWhatsappTextMessage[] {
    const messages: MetaWhatsappTextMessage[] = [];
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const rawMessages = Array.isArray(value?.messages) ? value.messages : [];

        for (const rawMessage of rawMessages) {
          const from = String(rawMessage?.from || "").trim();
          const id = String(rawMessage?.id || "").trim();
          if (!from || !id) continue;

          const contact = contacts.find((item: any) => String(item?.wa_id || "") === from);
          const contactName = contact?.profile?.name ? String(contact.profile.name) : null;

          if (rawMessage?.type === "text" && rawMessage?.text?.body) {
            messages.push({
              id,
              from,
              text: String(rawMessage.text.body),
              timestamp: rawMessage.timestamp ? String(rawMessage.timestamp) : undefined,
              contactName,
              raw: rawMessage,
            });
            continue;
          }

          messages.push({
            id,
            from,
            text:
              "Recebi sua mensagem, mas nesta V1 eu consigo responder melhor por texto. Pode descrever sua dúvida sobre Clients ou Estimates em uma mensagem?",
            timestamp: rawMessage.timestamp ? String(rawMessage.timestamp) : undefined,
            contactName,
            raw: rawMessage,
          });
        }
      }
    }

    return messages;
  }

  private messagesUrl() {
    return `https://graph.facebook.com/${assistantWhatsappEnv.metaGraphApiVersion}/${assistantWhatsappEnv.metaPhoneNumberId}/messages`;
  }
}

