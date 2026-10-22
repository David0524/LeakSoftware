import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  liveStopRuns,
  localDate,
  notificationOn,
  localMinutes,
  stopDone,
  type LiveStopContent,
  type LiveStopPhase,
  type StopCleaning,
} from "@leakbook/core";
import { useSyncStatus } from "../../data/hooks";
import { useNotificationPrefs } from "../../data/notificationPrefs";
import { inRouteOrderViews, useJobViews, type JobView } from "../../data/jobs";
import {
  LIVE_STOP_ID,
  dismissLiveStopFor,
  foregroundLiveStop,
  hideLiveStop,
  liveDismissedOn,
  liveForegrounds,
  useLiveStopVersion,
} from "../../lib/liveStop";
import { liveStopPhase } from "../../lib/liveStopRule";
import { liveStopBody } from "../../lib/todayHero";
import { NOTIFICATION_COLOR, Notifications, STOP_CATEGORY, STOP_CHANNEL } from "../../lib/push";
import { useCompany, useSession } from "../../state/session";
import { useTodayHero } from "./useTodayHero";

// The Android Live Activity (owner, 2026-10-19: "Make the live notification look beautiful
// please. Include our logo.", "Do not include a timer or stop watch", and "Live Activity should
// begin at the beginning of the workday"): one ongoing notification on the "current-stop"
// channel, from core liveStopContent, as the iPhone's Live Activity. It starts by itself when
// core liveStopRuns says the tech's day has begun, on the first stop not done ("ahead" with its
// time, or at the pool once started); On My Way puts that stop on the way; after Mark Complete
// it goes straight to the next stop (owner, 2026-10-20, gestures spec section 9: nothing waits
// on a timer); it ends after the last stop.
// Swiped away, it stays away while the app stays in the background; whenever the app is opened
// or comes to the front during the working day, it's shown again if it isn't up (owner,
// 2026-10-20: "It should run anytime you have the app open during the work day"). Timers and
// background syncs never bring back one swiped away. Checked at launch, coming back to the
// app, after a sync, and each minute while open. The app shows it itself (no signal needed).
// Which stop and moment come from core todayHero (owner, 2026-10-20), as Today's card, and On
// My Way is read from the job (job.on_my_way_at, arrive_at), so a second phone agrees.

const MINUTE = 60_000;

/** Mounted once while signed in. */
export function LiveStopNotification() {
  if (Platform.OS === "web") return null;
  return <LiveStopDay />;
}

interface Shown {
  job: JobView;
  phase: LiveStopPhase;
  content: LiveStopContent;
  /** The stop's plan cleanings, for their words ("Filter overdue · Salt cell 2 weeks"). */
  cleanings: StopCleaning[];
}

function LiveStopDay() {
  const company = useCompany();
  const { user } = useSession();
  const tz = company.timezone;
  const jobs = useJobViews(company.id);
  const sync = useSyncStatus();
  useLiveStopVersion();
  // Settings › Notifications › Live Activity (owner, 2026-10-20): off takes the notification
  // down and keeps it down; on again shows it at once during the workday.
  const { prefs } = useNotificationPrefs();
  const liveOn = !prefs || notificationOn(prefs, "live");

  // "Now", moved on each minute while the app is open and when it comes back to the front.
  const [now, setNow] = useState(() => new Date());
  // Whether the notification was up; the swipe check reads it (below).
  const up = useRef<LiveStopPhase | null>(null);
  useEffect(() => {
    // Opened or back in front: forget a swipe-away and show the stop again if it isn't up. The
    // swipe check mustn't count that missing notification as a new swipe.
    const foreground = () => {
      up.current = null;
      foregroundLiveStop();
    };
    if (AppState.currentState === "active") foreground();
    let tick: ReturnType<typeof setInterval> | null = setInterval(() => setNow(new Date()), MINUTE);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        foreground();
        setNow(new Date());
        tick ??= setInterval(() => setNow(new Date()), MINUTE);
      } else if (tick) {
        clearInterval(tick);
        tick = null;
      }
    });
    return () => {
      if (tick) clearInterval(tick);
      sub.remove();
    };
  }, []);

  const today = localDate(now, tz);
  const nowMin = localMinutes(now.toISOString(), tz);
  const me = user?.id;
  const stops = useMemo(
    () =>
      inRouteOrderViews(
        jobs.filter(
          (j) =>
            !j.deleted_at &&
            j.status !== "canceled" &&
            j.scheduled_start &&
            localDate(new Date(j.scheduled_start), tz) === today &&
            (j.assigned_user_id === me || j.second_tech_id === me),
        ),
      ),
    [jobs, tz, today, me],
  );
  const left = stops.filter((s) => !stopDone(s, today));

  const { hero, job, cleanings } = useTodayHero({
    companyId: company.id,
    stops,
    today,
    timeZone: tz,
  });

  const runs = liveStopRuns({
    settings: company.settings,
    date: today,
    nowMin,
    stopsLeft: left.length,
    // A stop on the way or started runs it at any hour (owner, 2026-10-22).
    underway: hero?.moment === "driving" || hero?.moment === "on_site",
  });
  const phase = liveStopPhase({
    moment: hero && job ? hero.moment : null,
    runs,
    dismissedOn: liveDismissedOn(),
    today,
  });
  const shown: Shown | null =
    liveOn && phase && hero && job ? { job, phase, content: hero.content, cleanings } : null;

  // Swiped away: once it was up, it's gone from the tray without us taking it down. A done
  // card swiped away only ends that card; the stop card swiped away stays away for the day.
  useEffect(() => {
    if (!up.current) return;
    void Notifications.getPresentedNotificationsAsync()
      .then((list) => {
        if (!up.current || list.some((n) => n.request.identifier === LIVE_STOP_ID)) return;
        const phase = up.current;
        up.current = null;
        if (phase !== "done") dismissLiveStopFor(today);
      })
      .catch(() => undefined);
  }, [now, sync.phase, sync.lastSyncedAt, today]);

  const showing = shown !== null;
  useEffect(() => {
    if (showing) return;
    up.current = null;
    void hideLiveStop();
  }, [showing]);

  if (!shown) return null;
  return (
    <StopCard
      key={shown.job.id}
      shown={shown}
      foregrounds={liveForegrounds()}
      onUp={(phase) => {
        up.current = phase;
      }}
    />
  );
}

/** One stop's notification, from todayHero's content (the checklist count included). */
function StopCard({
  shown,
  foregrounds,
  onUp,
}: {
  shown: Shown;
  /** Changes each time the app comes to the front: the card is shown again if it isn't up. */
  foregrounds: number;
  onUp: (phase: LiveStopPhase) => void;
}) {
  const { job } = shown;
  const c = shown.content;
  // Title: the headline. Text: the figure with its label, then the detail and next lines for
  // the expanded view. Never a timer or a stopwatch (owner, 2026-10-19).
  // Access notes (gate code, dogs) right under it, then the visit's cleanings ("Filter overdue ·
  // Salt cell 2 weeks"), until the stop is done (owner, 2026-10-20). The collapsed line stays
  // the figure.
  const body = liveStopBody(c, shown.cleanings);
  const phone = job.customer?.phone ?? null;
  const key = JSON.stringify([c.headline, body, phone]);

  const shownKey = useRef("");
  const shownAt = useRef(foregrounds);
  useEffect(() => {
    const post = () => {
      const [title, text] = JSON.parse(key) as [string, string, string | null];
      return Notifications.scheduleNotificationAsync({
        identifier: LIVE_STOP_ID,
        content: {
          title,
          body: text,
          color: NOTIFICATION_COLOR,
          // Ongoing for the day; the done card can be swiped away.
          sticky: shown.phase !== "done",
          autoDismiss: false,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.LOW,
          categoryIdentifier: STOP_CATEGORY,
          data: { kind: "live", job: job.id, phone },
        },
        trigger: { channelId: STOP_CHANNEL },
      })
        .then(() => onUp(shown.phase))
        .catch(() => undefined);
    };
    if (key !== shownKey.current) {
      shownKey.current = key;
      shownAt.current = foregrounds;
      void post();
      return;
    }
    if (foregrounds === shownAt.current) return;
    // Back in front with the same card: shown again only if it's no longer up.
    shownAt.current = foregrounds;
    void Notifications.getPresentedNotificationsAsync()
      .then((list) =>
        list.some((n) => n.request.identifier === LIVE_STOP_ID) ? onUp(shown.phase) : post(),
      )
      .catch(() => undefined);
  }, [key, foregrounds, shown.phase, job.id, phone, onUp]);
  return null;
}
