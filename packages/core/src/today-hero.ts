/**
 * Today's card for the stop a tech is on (owner, 2026-10-20; docs/plans/today-hero.md): the Live
 * Activity's stop, words and figure, brought into the app, with the buttons for that moment. The
 * Live Activity (iPhone) and the ongoing notification (Android) use the same rule, so all three
 * pick the same stop. No timer or countdown (owner, 2026-10-19).
 */
import { localDate } from "./job-list";
import { stopDone } from "./models";
import { liveStopContent, type LiveStopContent, type LiveStopPhase } from "./notifications";
import { formatTime } from "./office";

export interface HeroStop {
  id: string;
  type: string;
  status: string;
  stop_done_on?: string | null;
  scheduled_start?: string | null;
  /** When On My Way was sent, and the arrival it promised (job.on_my_way_at, arrive_at). */
  on_my_way_at?: string | null;
  arrive_at?: string | null;
  customer: string;
  address: string | null;
  access?: string | null;
  checklistDone: number;
  checklistTotal: number;
}

export type HeroMoment = LiveStopPhase | "day_done";

export interface TodayHero {
  moment: HeroMoment;
  /** The stop on the card (none when the day is done). */
  stopId: string | null;
  /** Its place in the day, from 1. */
  stop: number;
  stops: number;
  /** What it says: the Live Activity's content, or the day's end. */
  content: LiveStopContent;
  /** One segment per stop, in route order. */
  segments: ("done" | "current" | "todo")[];
  doneCount: number;
}

/** Whether On My Way was sent for this stop today (in the shop's time zone). */
export function onTheWay(s: HeroStop, today: string, timeZone: string): boolean {
  return (
    !!s.on_my_way_at &&
    localDate(new Date(s.on_my_way_at), timeZone) === today &&
    s.status !== "in_progress" &&
    !stopDone(s, today)
  );
}

/**
 * The card for a tech's day. Stops come in route order. The stop shown: the one on the way (On
 * My Way today), else one already started, else the first not done. `justDone` is a stop
 * completed in the last minute, shown done with the next one before the card moves on (the
 * phones pass it; the website shows the next stop at once). Null when there are no stops.
 */
export function todayHero(input: {
  stops: HeroStop[];
  today: string;
  timeZone: string;
  justDone?: string | null;
}): TodayHero | null {
  const { stops, today, timeZone } = input;
  if (stops.length === 0) return null;
  const done = (s: HeroStop) => stopDone(s, today);
  const left = stops.filter((s) => !done(s));
  const doneCount = stops.length - left.length;
  const target =
    left.find((s) => onTheWay(s, today, timeZone)) ??
    left.find((s) => s.status === "in_progress") ??
    left[0];
  const justDone = input.justDone ? stops.find((s) => s.id === input.justDone && done(s)) : null;
  const segment = (s: HeroStop, current: HeroStop | null | undefined) =>
    s === current ? ("current" as const) : done(s) ? ("done" as const) : ("todo" as const);
  const nextAfter = (at: number) => {
    const n = left.find((s) => stops.indexOf(s) > at);
    return n
      ? {
          customer: n.customer,
          time: n.scheduled_start ? formatTime(n.scheduled_start, timeZone) : null,
        }
      : null;
  };

  if (justDone || !target) {
    if (!justDone && !target) {
      const n = stops.length;
      return {
        moment: "day_done",
        stopId: null,
        stop: n,
        stops: n,
        content: {
          headline: n === 1 ? "The stop is done" : `All ${n} stops done`,
          figure: "✓",
          figureLabel: "Day done",
          detail: "",
          next: null,
          progress: 1,
          compact: "✓",
          spoken: `All ${n} ${n === 1 ? "stop" : "stops"} done today.`,
          access: null,
        },
        segments: stops.map(() => "done"),
        doneCount,
      };
    }
    const s = justDone!;
    const at = stops.indexOf(s);
    return {
      moment: "done",
      stopId: s.id,
      stop: at + 1,
      stops: stops.length,
      content: liveStopContent({
        phase: "done",
        customer: s.customer,
        address: s.address,
        stop: at + 1,
        stops: stops.length,
        eta: null,
        checklistDone: s.checklistDone,
        checklistTotal: s.checklistTotal,
        next: left[0]
          ? {
              customer: left[0].customer,
              time: left[0].scheduled_start ? formatTime(left[0].scheduled_start, timeZone) : null,
            }
          : null,
      }),
      segments: stops.map((x) => segment(x, null)),
      doneCount,
    };
  }

  const at = stops.indexOf(target);
  const phase: LiveStopPhase =
    target.status === "in_progress"
      ? "on_site"
      : onTheWay(target, today, timeZone)
        ? "driving"
        : "ahead";
  return {
    moment: phase,
    stopId: target.id,
    stop: at + 1,
    stops: stops.length,
    content: liveStopContent({
      phase,
      customer: target.customer,
      address: target.address,
      stop: at + 1,
      stops: stops.length,
      eta: phase === "driving" && target.arrive_at ? formatTime(target.arrive_at, timeZone) : null,
      scheduled: target.scheduled_start ? formatTime(target.scheduled_start, timeZone) : null,
      checklistDone: target.checklistDone,
      checklistTotal: target.checklistTotal,
      next: nextAfter(at),
      access: target.access ?? null,
    }),
    segments: stops.map((x) => segment(x, target)),
    doneCount,
  };
}

/**
 * The card's buttons for its moment: the main one, and whether Mark Complete shows beside it.
 * Someone looking at another tech's day (owners and admins, "Whose day") gets no On My Way or
 * Start Job: those are the tech's to press (decision 4).
 */
export function heroActions(
  moment: HeroMoment,
  mine: boolean,
): { primary: "on_my_way" | "start_job" | "open_checklist" | null; complete: boolean } {
  if (moment === "ahead" || moment === "done")
    return { primary: mine ? "on_my_way" : null, complete: false };
  if (moment === "driving") return { primary: mine ? "start_job" : null, complete: false };
  if (moment === "on_site") return { primary: "open_checklist", complete: true };
  return { primary: null, complete: false };
}

export const HERO_ACTION_LABELS = {
  on_my_way: "On My Way",
  start_job: "Start Job",
  open_checklist: "Open Checklist",
} as const;

/** "Leak detection · Stop 3 of 7", under the name. */
export function heroSubtitle(typeLabel: string, h: Pick<TodayHero, "stop" | "stops" | "moment">) {
  return h.moment === "day_done" ? "" : `${typeLabel} · Stop ${h.stop} of ${h.stops}`;
}

/** "14 min drive", under the address before leaving (decision 5). Null without a drive. */
export function heroDrive(moment: HeroMoment, driveMin: number | null | undefined): string | null {
  if (moment !== "ahead" || !driveMin || driveMin <= 0) return null;
  if (driveMin < 60) return `${driveMin} min drive`;
  const h = Math.floor(driveMin / 60);
  const m = driveMin % 60;
  return `${h} hr${m ? ` ${m} min` : ""} drive`;
}

/** What each progress segment says to VoiceOver and TalkBack. */
export function heroSegmentsSpoken(h: Pick<TodayHero, "doneCount" | "stops">): string {
  return `${h.doneCount} of ${h.stops} ${h.stops === 1 ? "stop" : "stops"} done`;
}

/**
 * The card's headline: the moment, since the customer's name is right under it (owner,
 * 2026-10-20: "At Derek Jeter" over "Derek Jeter" said it twice). The Lock Screen keeps
 * `content.headline`, which has the name. Day done keeps its own ("All 6 stops done").
 */
export function heroHeadline(h: Pick<TodayHero, "moment" | "content">): string {
  switch (h.moment) {
    case "ahead":
      return "Up next";
    case "driving":
      return "On the way";
    case "on_site":
      return "At the pool";
    case "done":
      return "Done";
    default:
      return h.content.headline;
  }
}
