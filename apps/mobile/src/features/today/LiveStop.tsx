import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import {
  checklistTally,
  formatTime,
  liveStopContent,
  localDate,
  minutesLabel,
  stopDone,
  type Customer,
  type Job,
  type LiveStopInput,
  type Property,
} from "@leakbook/core";
import { useRow } from "../../data/hooks";
import { useJobInspection } from "../../data/inspection";
import { inRouteOrderViews, useJobViews } from "../../data/jobs";
import { LIVE_STOP_ID, endLiveStop, useLiveState, type LiveStopState } from "../../lib/liveStop";
import { NOTIFICATION_COLOR, Notifications, STOP_CATEGORY, STOP_CHANNEL } from "../../lib/push";
import { useCompany, useSession } from "../../state/session";

// The Android Live Activity (owner, 2026-10-19: "Make the live notification look beautiful
// please. Include our logo." and "Do not include a timer or stop watch"): one ongoing
// notification on the "current-stop" channel for the stop the tech is on, from core
// liveStopContent, as the iPhone's Live Activity. On My Way starts it; Start Job, the checklist
// and Mark Complete update it; it goes a minute after the stop is done, and at sign out. The
// app shows it itself, so it works with no signal. The current stop is lib/liveStop.ts.

/** How long the done card stays before it goes. */
const DONE_MS = 60_000;

/** Mounted once while signed in: keeps the ongoing notification in step with the stop. */
export function LiveStopNotification() {
  const live = useLiveState();
  if (!live || Platform.OS === "web") return null;
  return <LiveStop key={live.jobId} live={live} />;
}

function LiveStop({ live }: { live: LiveStopState }) {
  const company = useCompany();
  const { user } = useSession();
  const tz = company.timezone;
  const job = useRow<Job>("job", live.jobId);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const insp = useJobInspection(company.id, live.jobId);
  const jobs = useJobViews(company.id);
  const today = localDate(new Date(), tz);

  const input = useMemo((): LiveStopInput | null => {
    if (!job || job.deleted_at || job.status === "canceled") return null;
    // The day's route this stop is on: the tech's own stops that day, in route order.
    const me = user?.id;
    const day = job.scheduled_start ? localDate(new Date(job.scheduled_start), tz) : today;
    const stops = inRouteOrderViews(
      jobs.filter(
        (j) =>
          !j.deleted_at &&
          j.status !== "canceled" &&
          j.scheduled_start &&
          localDate(new Date(j.scheduled_start), tz) === day &&
          (j.assigned_user_id === me || j.second_tech_id === me),
      ),
    );
    const at = stops.findIndex((s) => s.id === job.id);
    const following = stops.slice(at + 1).find((s) => !stopDone(s, today));
    const tally = checklistTally(insp.components, insp.results);
    const total =
      tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending;
    return {
      phase: stopDone(job, today) ? "done" : job.status === "in_progress" ? "on_site" : "driving",
      customer: customer?.name ?? "Customer",
      address: property?.address_line1 ?? null,
      stop: at >= 0 ? at + 1 : 1,
      stops: at >= 0 ? stops.length : 1,
      eta: live.arriveMin != null ? minutesLabel(live.arriveMin) : null,
      checklistDone: total - tally.pending,
      checklistTotal: total,
      next: following
        ? {
            customer: following.customer?.name ?? "Customer",
            time: following.scheduled_start ? formatTime(following.scheduled_start, tz) : null,
          }
        : null,
    };
  }, [job, customer, property, insp, jobs, user, tz, today, live.arriveMin]);

  const shown = useRef("");
  useEffect(() => {
    if (!input) {
      void endLiveStop();
      return;
    }
    const c = liveStopContent(input);
    // Title: the headline. Text: the figure with its label, then the detail and next lines
    // for the expanded view. Never a timer (owner, 2026-10-19).
    const body = [[c.figureLabel, c.figure].filter(Boolean).join(" "), c.detail, c.next]
      .filter(Boolean)
      .join("\n");
    const key = `${c.headline}|${body}`;
    if (key === shown.current) return;
    shown.current = key;
    const done = input.phase === "done";
    void Notifications.scheduleNotificationAsync({
      identifier: LIVE_STOP_ID,
      content: {
        title: c.headline,
        body,
        color: NOTIFICATION_COLOR,
        // Ongoing while working; the done card can be swiped away.
        sticky: !done,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        categoryIdentifier: STOP_CATEGORY,
        data: { kind: "live", job: live.jobId, phone: customer?.phone ?? null },
      },
      trigger: { channelId: STOP_CHANNEL },
    }).catch(() => undefined);
  }, [input, live.jobId, customer?.phone]);

  // A minute after the stop is done, the notification goes (On My Way to the next stop
  // replaces it sooner).
  const done = input?.phase === "done";
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => void endLiveStop(), DONE_MS);
    return () => clearTimeout(t);
  }, [done]);
  return null;
}
