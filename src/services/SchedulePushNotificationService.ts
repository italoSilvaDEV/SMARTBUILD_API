import { prisma } from "../utils/prisma";
import { PushNotificationService } from "./PushNotificationService";
import { SocketService } from "./SocketService";

interface SchedulePushPayload {
  userIds?: string[];
  emails?: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
}

export class SchedulePushNotificationService {
  static async sendToEmails(payload: SchedulePushPayload): Promise<void> {
    const uniqueUserIds = Array.from(
      new Set((payload.userIds || []).filter((userId): userId is string => Boolean(userId)))
    );
    const uniqueEmails = Array.from(
      new Set(
        (payload.emails || [])
          .map((email) => email?.trim())
          .filter((email): email is string => Boolean(email))
      )
    );

    if (uniqueUserIds.length === 0 && uniqueEmails.length === 0) return;

    // Funcionarios do Dispatch chegam com o ID do usuario. Buscar diretamente
    // pelo ID evita perder o token quando ha emails duplicados, aliases ou
    // registros antigos da mesma pessoa. Email continua como fallback para os
    // fluxos legados e subcontractors que tambem possuem acesso ao app.
    const users = await prisma.user.findMany({
      where: {
        isDisabled: false,
        OR: [
          ...(uniqueUserIds.length > 0 ? [{ id: { in: uniqueUserIds } }] : []),
          ...(uniqueEmails.length > 0 ? [{ email: { in: uniqueEmails } }] : []),
        ],
      },
      select: { id: true, expoPushToken: true },
    });

    if (users.length === 0) {
      console.warn("[SchedulePushNotificationService] No app user found for assignment", {
        userCount: uniqueUserIds.length,
        emailCount: uniqueEmails.length,
      });
      return;
    }

    try {
      await prisma.scheduleNotification.createMany({
        data: users.map((user) => ({
          userId: user.id,
          type: String(payload.data?.type || "schedule_updated"),
          title: payload.title,
          body: payload.body,
          projectId: payload.data?.projectId ? String(payload.data.projectId) : null,
          serviceProjectId: payload.data?.serviceProjectId ? String(payload.data.serviceProjectId) : null,
          subServiceId: payload.data?.subServiceId ? String(payload.data.subServiceId) : null,
          customServiceId: payload.data?.customServiceId ? String(payload.data.customServiceId) : null,
        })),
      });

      users.forEach((user) => {
        SocketService.emitToUser(user.id, "new_schedule_notification", {
          type: payload.data?.type || "schedule_updated",
        });
      });
    } catch (error) {
      // Notification persistence must never prevent the schedule itself from
      // being created. The deployment logs retain the failure for diagnosis.
      console.error("[SchedulePushNotificationService] Failed to persist schedule notification", error);
    }

    const tokens = Array.from(
      new Set(
        users
          .map((user) => user.expoPushToken)
          .filter((token): token is string => Boolean(token))
      )
    );

    const messages = tokens
      .map((token) => ({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: "default" as const,
        channelId: "default",
      }));

    if (messages.length === 0) {
      console.warn("[SchedulePushNotificationService] No registered device found for assignment", {
        userCount: uniqueUserIds.length,
        emailCount: uniqueEmails.length,
      });
      return;
    }

    await PushNotificationService.sendPushNotifications(messages);
  }
}
