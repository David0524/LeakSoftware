import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  checklistTally,
  formatTime,
  liveStopContent,
  liveStopRuns,
  localDate,
  localMinutes,
  minutesLabel,
  stopDone,
  type LiveStopInput,
  type LiveStopPhase,
} from "@leakbook/core";
import { useSyncStatus } from "../../data/hooks";
import { useJobInspection } from "../../data/inspection";
import { inRouteOrderViews, useJobViews, type JobView } from "../../data/jobs";
import {
  LIVE_STOP_ID,
  dismissLiveStopFor,
  hideLiveStop,
  liveDismissedOn,
  liveOnMyWay,
  useLiveStopVersion,
} from "../../lib/liveStop";
import { NOTIFICATION_COLOR, Notifications, STOP_CATEGORY, STOP_CHANNEL } from "../../lib/push";
import { useCompany, useSession } from "../../state/session";

// The Android Live Activity (owner, 2026-10-19: "Make the live notification look beautiful
// please. Include our logo.", "Do not include a timer or stop watch", and "Live Activity should
// begin at the beginning of the workday"): one ongoing notification on the "current-stop"
// channel, from core liveStopContent, as the iPhone's Live Activity. It starts by itself when
// core liveStopRuns says the tech's day has begun, on the first stop not done ("ahead" with its
// time, or at the pool once started); On My Way puts that stop on the way; after Mark Complete
// it shows the stop done for a minute, then moves to the next; it ends after the last stop.
// Swiped away, it stays away until the next work day. Checked at launch, coming back to the
// app, after a sync, and each minute while open. The app shows it itself (no signal needed).

/** How long a done stop shows before the next one (or the end of the day). */
const DONE_MS = 60_000;
const MINUTE = 60_000;

/** Mounted once while signed in. */
export function LiveStopNotification() {
  if (Platform.OS === "web") return null;
  return <LiveStopDay />;
}

interface Shown {
  job: JobView;
  phase: LiveStopPhase;
  stop: number;
  stops: number;
  next: JobView | undefined;
  arriveMin: number | null;
}

function LiveStopDay() {
  const company = useCompany();
  const { user } = useSession();
  const tz = company.timezone;
  const jobs = useJobViews(company.id);
  const sync = useSyncStatus();
  useLiveStopVersion();

  // "Now", moved on each minute while the app is open and when it comes back to the front.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let tick: ReturnType<typeof setInterval> | null = setInterval(() => setNow(new Date()), MINUTE);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
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
  const onMyWay = liveOnMyWay();

  // The stop on the way (On My Way), else one already started, else the first not done.
  const target =
    (onMyWay && left.find((s) => s.id === onMyWay.jobId)) ??
    left.find((s) => s.status === "in_progress") ??
    left[0];
  // Mark Complete: the stop shows done for a minute, then the next one (or the day ends).
  const [justDone, setJustDone] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    const was = last.current ? stops.find((s) => s.id === last.current) : undefined;
    if (was && stopDone(was, today)) setJustDone(was.id);
    last.current = target?.id ?? null;
  }, [target?.id, stops, today]);
  useEffect(() => {
    if (!justDone) return;
    // Not a timer on screen: when the minute is up, the next stop takes its place.
    const t = setTimeout(() => setJustDone(null), DONE_MS);
    return () => clearTimeout(t);
  }, [justDone]);

  const runs = liveStopRuns({
    settings: company.settings,
    date: today,
    nowMin,
    stopsLeft: left.length,
  });
  const dismissedToday = liveDismissedOn() === today;
  const doneJob = justDone ? stops.find((s) => s.id === justDone) : undefined;

  let shown: Shown | null = null;
  if (!dismissedToday && doneJob) {
    const at = stops.indexOf(doneJob);
    shown = {
      job: doneJob,
      phase: "done",
      stop: at + 1,
      stops: stops.length,
      next: left[0],
      arriveMin: null,
    };
  } else if (!dismissedToday && target && (runs || onMyWay?.jobId === target.id)) {
    const at = stops.indexOf(target);
    const driving = onMyWay?.jobId === target.id && target.status !== "in_progress";
    shown = {
      job: target,
      phase: target.status === "in_progress" ? "on_site" : driving ? "driving" : "ahead",
      stop: at + 1,
      stops: stops.length,
      next: left.find((s) => s !== target && stops.indexOf(s) > at),
      arriveMin: driving ? (onMyWay?.arriveMin ?? null) : null,
    };
  }

  // Swiped away: once it was up, it's gone from the tray without us taking it down. A done
  // card swiped away only ends that card; the stop card swiped away stays away for the day.
  const up = useRef<LiveStopPhase | null>(null);
  useEffect(() => {
    if (!up.current) return;
    void Notifications.getPresentedNotificationsAsync()
      .then((list) => {
        if (!up.current || list.some((n) => n.request.identifier === LIVE_STOP_ID)) return;
        const phase = up.current;
        up.current = null;
        if (phase === "done") setJustDone(null);
        else dismissLiveStopFor(today);
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
      timeZone={tz}
      onUp={(phase) => {
        up.current = phase;
      }}
    />
  );
}

/** One stop's notification: its checklist count comes from its own rows. */
function StopCard({
  shown,
  timeZone,
  onUp,
}: {
  shown: Shown;
  timeZone: string;
  onUp: (phase: LiveStopPhase) => void;
}) {
  const { job } = shown;
  const insp = useJobInspection(job.company_id, job.id);
  const tally = checklistTally(insp.components, insp.results);
  const total = tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending;
  const input: LiveStopInput = {
    phase: shown.phase,
    customer: job.customer?.name ?? "Customer",
    address: job.property?.address_line1 ?? null,
    stop: shown.stop,
    stops: shown.stops,
    eta: shown.arriveMin != null ? minutesLabel(shown.arriveMin) : null,
    scheduled: job.scheduled_start ? formatTime(job.scheduled_start, timeZone) : null,
    checklistDone: total - tally.pending,
    checklistTotal: total,
    next: shown.next
      ? {
          customer: shown.next.customer?.name ?? "Customer",
          time: shown.next.scheduled_start
            ? formatTime(shown.next.scheduled_start, timeZone)
            : null,
        }
      : null,
    access: job.property?.access_notes ?? null,
  };
  const c = liveStopContent(input);
  // Title: the headline. Text: the figure with its label, then the detail and next lines for
  // the expanded view. Never a timer or a stopwatch (owner, 2026-10-19).
  // Access notes (gate code, dogs) right under it, until the stop is done (owner, 2026-10-20).
  const body = [
    [c.figureLabel, c.figure].filter(Boolean).join(" "),
    c.access ? `Access: ${c.access}` : null,
    c.detail,
    c.next,
  ]
    .filter(Boolean)
    .join("\n");
  const phone = job.customer?.phone ?? null;
  const key = JSON.stringify([c.headline, body, phone]);

  const shownKey = useRef("");
  useEffect(() => {
    if (key === shownKey.current) return;
    shownKey.current = key;
    const [title, text] = JSON.parse(key) as [string, string, string | null];
    void Notifications.scheduleNotificationAsync({
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
  }, [key, shown.phase, job.id, phone, onUp]);
  return null;
}
