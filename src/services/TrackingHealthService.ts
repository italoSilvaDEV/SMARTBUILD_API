import { prisma } from "../utils/prisma";
import { PushNotificationService } from "./PushNotificationService";

const prismaAny = prisma as any;

export const TRACKING_SILENT_AFTER_MINUTES = 25;
export const TRACKING_REMINDER_INTERVAL_MINUTES = 25;

type OpenAttendanceRecord = {
  id: string;
  company_id: string | null;
  user_id: string;
  check_in_time: Date;
  user?: {
    id: string;
    name: string;
    expoPushToken?: string | null;
  } | null;
};

type LiveLocationRecord = {
  companyId: string;
  userId: string;
  recordedAt: Date;
};

type TrackingReminderRecord = {
  attendanceId: string;
  reminderNumber: number;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  restoredAt: Date | null;
};

const TRACKING_REMINDER_VARIANTS = [
  {
    firstTitle: "Hey {firstName}, just checking in",
    firstFallbackTitle: "Just checking in",
    firstBody: "Tap here to do a quick check in the app and confirm everything is okay.",
    secondTitle: "{firstName}, just following up",
    secondFallbackTitle: "Just following up",
    secondBody: "We still haven't seen a recent check. Tap here to open the app and confirm you're okay.",
  },
  {
    firstTitle: "Hi {firstName}, everything okay?",
    firstFallbackTitle: "Everything okay?",
    firstBody: "Please tap here for a quick check in so we know all is well.",
    secondTitle: "{firstName}, quick follow-up",
    secondFallbackTitle: "Quick follow-up",
    secondBody: "When you have a second, tap here and open the app for a quick confirmation.",
  },
  {
    firstTitle: "Hey {firstName}, just making sure you're good",
    firstFallbackTitle: "Just making sure you're good",
    firstBody: "Tap here for a fast check in and let us know everything is okay.",
    secondTitle: "{firstName}, can you confirm you're okay?",
    secondFallbackTitle: "Can you confirm you're okay?",
    secondBody: "Please tap here to open the app and do a quick confirmation.",
  },
  {
    firstTitle: "Quick check, {firstName}",
    firstFallbackTitle: "Quick check",
    firstBody: "Tap here to open the app and do a quick all-good check.",
    secondTitle: "Checking back in, {firstName}",
    secondFallbackTitle: "Checking back in",
    secondBody: "We'd like one more quick confirmation. Tap here when you can.",
  },
  {
    firstTitle: "Hi {firstName}, just a quick check",
    firstFallbackTitle: "Just a quick check",
    firstBody: "Tap here to confirm everything is okay on your end.",
    secondTitle: "{firstName}, still okay over there?",
    secondFallbackTitle: "Still okay over there?",
    secondBody: "Tap here to open the app and send a quick confirmation.",
  },
  {
    firstTitle: "Hey {firstName}, give us a quick check in",
    firstFallbackTitle: "Give us a quick check in",
    firstBody: "A quick tap here lets us know everything is still okay.",
    secondTitle: "{firstName}, one more quick check",
    secondFallbackTitle: "One more quick check",
    secondBody: "If you can, tap here and open the app for a quick all-good confirmation.",
  },
  {
    firstTitle: "Just checking that you're okay, {firstName}",
    firstFallbackTitle: "Just checking that you're okay",
    firstBody: "Tap here for a quick check in on the app.",
    secondTitle: "{firstName}, please check in when you can",
    secondFallbackTitle: "Please check in when you can",
    secondBody: "Tap here to open the app and let us know everything is alright.",
  },
] as const;

function formatReminderTitle(template: string, firstName: string | null) {
  return template.replace("{firstName}", firstName || "");
}

function getReminderVariantIndex(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % TRACKING_REMINDER_VARIANTS.length;
}

function getTrackingReminderMessage(
  reminderNumber: number,
  workerName?: string | null,
  attendanceId?: string
) {
  const firstName = workerName?.trim()?.split(" ")?.[0] || null;
  const seed = `${attendanceId || "attendance"}:${workerName || "worker"}:${reminderNumber}`;
  const variant = TRACKING_REMINDER_VARIANTS[getReminderVariantIndex(seed)];

  if (reminderNumber === 1) {
    return {
      title: firstName
        ? formatReminderTitle(variant.firstTitle, firstName)
        : variant.firstFallbackTitle,
      body: variant.firstBody,
    };
  }

  return {
    title: firstName
      ? formatReminderTitle(variant.secondTitle, firstName)
      : variant.secondFallbackTitle,
    body: variant.secondBody,
  };
}

export function getTrackingSilentReferenceTime(
  attendance: Pick<OpenAttendanceRecord, "check_in_time">,
  liveLocation?: Pick<LiveLocationRecord, "recordedAt"> | null
) {
  return liveLocation?.recordedAt || attendance.check_in_time;
}

export function getTrackingHealthSnapshot(
  attendance: Pick<OpenAttendanceRecord, "check_in_time">,
  liveLocation?: Pick<LiveLocationRecord, "recordedAt"> | null,
  now = new Date()
) {
  const lastPingAt = liveLocation?.recordedAt || null;
  const referenceTime = getTrackingSilentReferenceTime(attendance, liveLocation);
  const ageMs = Math.max(0, now.getTime() - referenceTime.getTime());
  const ageMinutes = Math.floor(ageMs / 60000);
  const isSilent = ageMinutes >= TRACKING_SILENT_AFTER_MINUTES;
  const silentSince = isSilent
    ? new Date(referenceTime.getTime() + TRACKING_SILENT_AFTER_MINUTES * 60000)
    : null;

  return {
    lastPingAt,
    lastPingAgeMinutes: liveLocation ? ageMinutes : null,
    trackingHealth: (isSilent ? "silent" : "healthy") as "healthy" | "silent",
    silentSince,
    ageMinutes,
  };
}

export async function acknowledgeTrackingReminderForAttendance(
  userId: string,
  attendanceId: string
) {
  const now = new Date();
  await prismaAny.workerTrackingReminder.updateMany({
    where: {
      userId,
      attendanceId,
      acknowledgedAt: null,
      restoredAt: null,
    },
    data: {
      acknowledgedAt: now,
    },
  });
}

export async function markTrackingReminderRestored(
  userId: string,
  attendanceId?: string | null
) {
  const now = new Date();

  let resolvedAttendanceId = attendanceId || null;
  if (!resolvedAttendanceId) {
    const openAttendance = await prisma.userAttendance.findFirst({
      where: {
        user_id: userId,
        check_out_time: null,
      },
      orderBy: {
        check_in_time: "desc",
      },
      select: { id: true },
    });
    resolvedAttendanceId = openAttendance?.id || null;
  }

  if (!resolvedAttendanceId) return;

  await prismaAny.workerTrackingReminder.updateMany({
    where: {
      userId,
      attendanceId: resolvedAttendanceId,
      acknowledgedAt: null,
      restoredAt: null,
    },
    data: {
      restoredAt: now,
    },
  });
}

export async function runTrackingHealthCheckJob() {
  const batchSize = 200;
  let cursorId: string | undefined;
  const now = new Date();

  while (true) {
    const attendances = (await prisma.userAttendance.findMany({
      where: {
        check_out_time: null,
        company_id: { not: null },
      },
      select: {
        id: true,
        company_id: true,
        user_id: true,
        check_in_time: true,
        user: {
          select: {
            id: true,
            name: true,
            expoPushToken: true,
          },
        },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursorId
        ? {
            skip: 1,
            cursor: { id: cursorId },
          }
        : {}),
    })) as OpenAttendanceRecord[];

    if (!attendances.length) break;
    cursorId = attendances[attendances.length - 1]?.id;

    const companyIds = Array.from(
      new Set(attendances.map((attendance) => attendance.company_id).filter(Boolean) as string[])
    );
    const userIds = Array.from(new Set(attendances.map((attendance) => attendance.user_id)));
    const attendanceIds = attendances.map((attendance) => attendance.id);

    const [liveLocations, reminders] = await Promise.all([
      prisma.workerLiveLocation.findMany({
        where: {
          companyId: { in: companyIds },
          userId: { in: userIds },
        },
        select: {
          companyId: true,
          userId: true,
          recordedAt: true,
        },
      }) as Promise<LiveLocationRecord[]>,
      prismaAny.workerTrackingReminder.findMany({
        where: {
          attendanceId: { in: attendanceIds },
        },
        select: {
          attendanceId: true,
          reminderNumber: true,
          triggeredAt: true,
          acknowledgedAt: true,
          restoredAt: true,
        },
      }) as Promise<TrackingReminderRecord[]>,
    ]);

    const liveLocationMap = new Map(
      liveLocations.map((location) => [`${location.companyId}:${location.userId}`, location])
    );
    const remindersByAttendance = reminders.reduce<Record<string, TrackingReminderRecord[]>>(
      (acc, reminder) => {
        if (!acc[reminder.attendanceId]) {
          acc[reminder.attendanceId] = [];
        }
        acc[reminder.attendanceId].push(reminder);
        return acc;
      },
      {}
    );

    for (const attendance of attendances) {
      if (!attendance.company_id) continue;

      const liveLocation =
        liveLocationMap.get(`${attendance.company_id}:${attendance.user_id}`) || null;
      const snapshot = getTrackingHealthSnapshot(attendance, liveLocation, now);

      if (snapshot.trackingHealth !== "silent") {
        continue;
      }

      const reminderChain = remindersByAttendance[attendance.id] || [];
      const activeReminderChain = reminderChain.filter((reminder) => !reminder.restoredAt);
      const lastActiveReminder = activeReminderChain
        .slice()
        .sort((left, right) => right.triggeredAt.getTime() - left.triggeredAt.getTime())[0];

      const shouldSendInitialReminder =
        activeReminderChain.length === 0 && snapshot.ageMinutes >= TRACKING_SILENT_AFTER_MINUTES;
      const shouldSendRecurringReminder =
        !!lastActiveReminder &&
        now.getTime() - lastActiveReminder.triggeredAt.getTime() >=
          TRACKING_REMINDER_INTERVAL_MINUTES * 60000;

      if (!shouldSendInitialReminder && !shouldSendRecurringReminder) {
        continue;
      }

      const reminderNumberToSend =
        reminderChain.reduce((max, reminder) => Math.max(max, reminder.reminderNumber), 0) + 1;

      const expoPushToken = attendance.user?.expoPushToken || null;
      if (!expoPushToken) {
        continue;
      }

      await PushNotificationService.sendPushNotifications([
        {
          to: expoPushToken,
          ...getTrackingReminderMessage(
            reminderNumberToSend,
            attendance.user?.name,
            attendance.id
          ),
          data: {
            type: "tracking_health_check",
            attendanceId: attendance.id,
          },
          sound: "default",
          channelId: "default",
        },
      ]);

      try {
        await prismaAny.workerTrackingReminder.create({
          data: {
            companyId: attendance.company_id,
            userId: attendance.user_id,
            attendanceId: attendance.id,
            reminderNumber: reminderNumberToSend,
            triggeredAt: now,
          },
        });
      } catch (error: any) {
        const code = error?.code || error?.meta?.cause;
        if (code !== "P2002") {
          throw error;
        }
      }
    }
  }
}
