import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../utils/prisma";
import { assistantWhatsappEnv } from "../config/env";
import type {
  AssistantWhatsappClosedReason,
  AssistantWhatsappMessage,
  AssistantWhatsappMessageDirection,
  AssistantWhatsappMessageRole,
  AssistantWhatsappSession,
} from "../types";

export class AssistantWhatsappSessionService {
  async getOrCreateActiveSession(phoneNumber: string, displayName?: string | null) {
    const active = await this.getLatestActiveSession(phoneNumber);

    if (active) {
      if (this.isExpired(active.lastActivityAt)) {
        await this.closeSession(active.id, "inactivity");
      } else {
        if (displayName && displayName !== active.displayName) {
          await prisma.$executeRawUnsafe(
            `UPDATE assistant_whatsapp_sessions SET displayName = ?, date_update = NOW(3) WHERE id = ?`,
            displayName,
            active.id
          );
          return { ...active, displayName };
        }
        return active;
      }
    }

    const id = uuidv4();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO assistant_whatsapp_sessions
          (id, phoneNumber, displayName, status, lastActivityAt, date_creation, date_update)
        VALUES
          (?, ?, ?, 'active', NOW(3), NOW(3), NOW(3))
      `,
      id,
      phoneNumber,
      displayName || null
    );

    return this.getSessionById(id) as Promise<AssistantWhatsappSession>;
  }

  async closeSession(sessionId: string, reason: AssistantWhatsappClosedReason) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE assistant_whatsapp_sessions
        SET status = 'closed',
            closedReason = ?,
            closedAt = NOW(3),
            date_update = NOW(3)
        WHERE id = ? AND status = 'active'
      `,
      reason,
      sessionId
    );
  }

  async updateActivity(sessionId: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE assistant_whatsapp_sessions SET lastActivityAt = NOW(3), date_update = NOW(3) WHERE id = ?`,
      sessionId
    );
  }

  async updateOpenAiState(sessionId: string, responseId: string | null, conversationId?: string | null) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE assistant_whatsapp_sessions
        SET lastResponseId = ?,
            openaiConversationId = COALESCE(?, openaiConversationId),
            lastActivityAt = NOW(3),
            date_update = NOW(3)
        WHERE id = ?
      `,
      responseId,
      conversationId || null,
      sessionId
    );
  }

  async insertMessage(params: {
    sessionId: string;
    role: AssistantWhatsappMessageRole;
    direction: AssistantWhatsappMessageDirection;
    content: string;
    metaMessageId?: string | null;
    rawPayload?: unknown;
    toolData?: unknown;
  }) {
    const id = uuidv4();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO assistant_whatsapp_messages
          (id, sessionId, role, direction, content, metaMessageId, rawPayload, toolData, createdAt)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
      `,
      id,
      params.sessionId,
      params.role,
      params.direction,
      params.content,
      params.metaMessageId || null,
      params.rawPayload == null ? null : JSON.stringify(params.rawPayload),
      params.toolData == null ? null : JSON.stringify(params.toolData)
    );

    await this.updateActivity(params.sessionId);
    return this.getMessageById(id) as Promise<AssistantWhatsappMessage>;
  }

  async hasMetaMessage(metaMessageId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM assistant_whatsapp_messages WHERE metaMessageId = ? LIMIT 1`,
      metaMessageId
    );
    return rows.length > 0;
  }

  private async getLatestActiveSession(phoneNumber: string) {
    const rows = await prisma.$queryRawUnsafe<AssistantWhatsappSession[]>(
      `
        SELECT *
        FROM assistant_whatsapp_sessions
        WHERE phoneNumber = ? AND status = 'active'
        ORDER BY lastActivityAt DESC
        LIMIT 1
      `,
      phoneNumber
    );

    return rows[0] || null;
  }

  private async getSessionById(sessionId: string) {
    const rows = await prisma.$queryRawUnsafe<AssistantWhatsappSession[]>(
      `SELECT * FROM assistant_whatsapp_sessions WHERE id = ? LIMIT 1`,
      sessionId
    );

    return rows[0] || null;
  }

  private async getMessageById(messageId: string) {
    const rows = await prisma.$queryRawUnsafe<AssistantWhatsappMessage[]>(
      `SELECT * FROM assistant_whatsapp_messages WHERE id = ? LIMIT 1`,
      messageId
    );

    return rows[0] || null;
  }

  private isExpired(lastActivityAt: Date) {
    const timeoutMs = assistantWhatsappEnv.sessionInactivityMinutes * 60 * 1000;
    return Date.now() - new Date(lastActivityAt).getTime() > timeoutMs;
  }
}

