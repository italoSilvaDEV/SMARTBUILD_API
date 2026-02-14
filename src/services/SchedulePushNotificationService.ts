import { prisma } from "../utils/prisma";
import { PushNotificationService } from "./PushNotificationService";

interface SchedulePushPayload {
  emails: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
}

export class SchedulePushNotificationService {
  static async sendToEmails(payload: SchedulePushPayload): Promise<void> {
    const uniqueEmails = Array.from(
      new Set(
        (payload.emails || [])
          .map((email) => email?.trim())
          .filter((email): email is string => Boolean(email))
      )
    );

    if (uniqueEmails.length === 0) return;

    const tokens: string[] = [];

    for (const email of uniqueEmails) {
      const rows = await prisma.$queryRaw<Array<{ expoPushToken: string | null }>>`
        SELECT expoPushToken
        FROM User
        WHERE email = ${email}
          AND expoPushToken IS NOT NULL
        LIMIT 1
      `;

      const token = rows?.[0]?.expoPushToken;
      if (token) tokens.push(token);
    }

    const messages = tokens
      .map((token) => ({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: "default" as const,
        channelId: "default",
      }));

    if (messages.length === 0) return;

    await PushNotificationService.sendPushNotifications(messages);
  }
}
