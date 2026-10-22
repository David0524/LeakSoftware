import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { dayStartAlert, localDate, localMinutes, notificationOn, stopDone } from "@leakbook/core";
import { inRouteOrderViews, useJobViews } from "../../data/jobs";
import { useNotificationPrefs } from "../../data/notificationPrefs";
import { ALERTS_CHANNEL, NOTIFICATION_COLOR, Notifications } from "../../lib/push";
import { useCompany, useSession } from "../../state/session";

// The start of the day (owner, 2026-10-22: "Techs: the first stop of the day opens in one tap
// from the notification"; docs/design/2026-10-22-first-win.md). The phone schedules one
// notification for itself at the start of the next working day with stops (Settings ›
// Scheduling), so it comes even when the app is closed and there's no signal: "5 stops today ·
// First: Smith, 123 Palm Ln". A tap opens that first stop's job, or Today when it's gone
// (lib/push handleResponse). It's replaced whenever the person's stops change, and taken down
// when More › Notifications › Start of the Day is off. As the iPhone app.

export const DAY_START_ID = "day-start";
/** How far ahead to look for the next working day with stops. */
const DAYS_AHEAD = 8;

/** Mounted once while signed in. */
export function DayStartNotification() {
  if (Platform.OS === "web") return null;
  return <DayStart />;
}

function DayStart() {
  const company = useCompany();
  const { user } = useSession();
  const jobs = useJobViews(company.id);
  const { prefs } = useNotificationPrefs();
  const on = !prefs || notificationOn(prefs, "day");
  const tz = company.timezone;
  const me = user?.id;

  const alert = useMemo(() => {
    if (!on || !me) return null;
    const now = new Date();
    const today = localDate(now, tz);
    const byDay = new Map<string, typeof jobs>();
    for (const j of jobs) {
      if (j.deleted_at || j.status === "canceled" || j.sample || !j.scheduled_start) continue;
      if (j.assigned_user_id !== me && j.second_tech_id !== me) continue;
      const day = localDate(new Date(j.scheduled_start), tz);
      if (day < today || stopDone(j, day)) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), j]);
    }
    const days = [...byDay.entries()]
      .filter(([day]) => day <= localDate(new Date(now.getTime() + DAYS_AHEAD * 86_400_000), tz))
      .map(([date, list]) => ({
        date,
        stops: inRouteOrderViews(list).map((j) => ({
          id: j.id,
          customer: j.customer?.name ?? "Customer",
          address: j.property?.address_line1 ?? null,
        })),
      }));
    return dayStartAlert({
      settings: company.settings,
      timeZone: tz,
      today,
      nowMin: localMinutes(now.toISOString(), tz),
      days,
    });
  }, [jobs, on, me, tz, company.settings]);

  const key = alert ? JSON.stringify(alert) : "";
  useEffect(() => {
    void (async () => {
      await Notifications.cancelScheduledNotificationAsync(DAY_START_ID).catch(() => undefined);
      if (!key) return;
      const a = JSON.parse(key) as NonNullable<typeof alert>;
      await Notifications.scheduleNotificationAsync({
        identifier: DAY_START_ID,
        content: {
          title: a.text.title,
          body: a.text.body,
          color: NOTIFICATION_COLOR,
          data: { kind: "day", job: a.jobId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(a.at),
          channelId: ALERTS_CHANNEL,
        },
      }).catch(() => undefined);
    })();
  }, [key]);
  return null;
}
