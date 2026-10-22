/**
 * Today's card for the stop a tech is on (owner, 2026-10-20; docs/plans/today-hero.md): the Live
 * Activity's stop, words and figure, brought into the app, with the buttons for that moment. The
 * Live Activity (iPhone) and the ongoing notification (Android) use the same rule, so all three
 * pick the same stop. No timer or countdown (owner, 2026-10-19).
 */
import { localDate } from "./job-list";
import { stopDone } from "./models";
import {
  liveStopContent,
  type LiveStopContent,
  type LiveStopPhase,
  type StopCleaning,
} from "./notifications";
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
  /** The plan's cleanings on this visit, with how soon each is due. */
  cleanings?: StopCleaning[];
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
  /**
   * The stop the day is on (what the card shows unless the tech swiped to another), for Back to
   * Now. Null when the day is done.
   */
  currentId: string | null;
  /** Whether the card shows a stop the tech picked, not the one the day is on. */
  browsing: boolean;
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
  /**
   * A stop the tech swiped or tapped to (owner, 2026-10-20: "a better way to move the hero tile
   * back to a previous job"): the card shows it, done or not, until they go Back to Now.
   */
  viewing?: string | null;
}): TodayHero | null {
  const hero = dayHero(input);
  if (!hero) return null;
  const viewed = input.viewing ? input.stops.find((s) => s.id === input.viewing) : null;
  if (!viewed || viewed.id === hero.stopId) return hero;
  return { ...stopHero(input, viewed), currentId: hero.currentId, browsing: true };
}

/** The card for one stop the tech picked: done, at the pool, on the way, or still ahead. */
function stopHero(
  input: { stops: HeroStop[]; today: string; timeZone: string },
  s: HeroStop,
): Omit<TodayHero, "currentId" | "browsing"> {
  const { stops, today, timeZone } = input;
  const done = (x: HeroStop) => stopDone(x, today);
  const at = stops.indexOf(s);
  const left = stops.filter((x) => !done(x));
  const next = left.find((x) => stops.indexOf(x) > at);
  const phase: LiveStopPhase = done(s)
    ? "done"
    : s.status === "in_progress"
      ? "on_site"
      : onTheWay(s, today, timeZone)
        ? "driving"
        : "ahead";
  return {
    moment: phase,
    stopId: s.id,
    stop: at + 1,
    stops: stops.length,
    content: liveStopContent({
      phase,
      customer: s.customer,
      address: s.address,
      stop: at + 1,
      stops: stops.length,
      doneStops: stops.length - left.length,
      eta: phase === "driving" && s.arrive_at ? formatTime(s.arrive_at, timeZone) : null,
      scheduled: s.scheduled_start ? formatTime(s.scheduled_start, timeZone) : null,
      checklistDone: s.checklistDone,
      checklistTotal: s.checklistTotal,
      next: next
        ? {
            customer: next.customer,
            time: next.scheduled_start ? formatTime(next.scheduled_start, timeZone) : null,
          }
        : null,
      access: s.access ?? null,
      cleanings: s.cleanings ?? [],
    }),
    segments: stops.map((x) => (x === s ? "current" : done(x) ? "done" : "todo")),
    doneCount: stops.length - left.length,
  };
}

function dayHero(input: {
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
          cleanings: [],
        },
        segments: stops.map(() => "done"),
        doneCount,
        currentId: null,
        browsing: false,
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
        doneStops: doneCount,
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
      currentId: s.id,
      browsing: false,
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
      doneStops: stops.length - left.length,
      eta: phase === "driving" && target.arrive_at ? formatTime(target.arrive_at, timeZone) : null,
      scheduled: target.scheduled_start ? formatTime(target.scheduled_start, timeZone) : null,
      checklistDone: target.checklistDone,
      checklistTotal: target.checklistTotal,
      next: nextAfter(at),
      access: target.access ?? null,
      cleanings: target.cleanings ?? [],
    }),
    segments: stops.map((x) => segment(x, target)),
    doneCount,
    currentId: target.id,
    browsing: false,
  };
}

/**
 * The card's buttons for its moment: the main one, whether Mark Complete shows beside it,
 * whether Message starts as the On My Way text, and whether a finished stop offers its undo
 * (Reopen Visit or Mark Not Complete). Start is the main button from the start, so a tech who
 * doesn't send On My Way never has to (owner, 2026-10-20: "not every tech is going to use every
 * function all the time"). A finished stop's card is only about that stop: no Start for another
 * one (owner, 2026-10-20: "I don't understand when a job goes from marked completed to when it
 * starts the next job"). Someone looking at another tech's day (owners and admins, "Whose
 * day") gets no On My Way, Start or undo: those are the tech's to press (decision 4).
 */
export function heroActions(
  moment: HeroMoment,
  mine: boolean,
  checklistDone = false,
): {
  primary: "start_job" | "open_checklist" | null;
  complete: boolean;
  onMyWay: boolean;
  undo: boolean;
  /**
   * The checklist is all done, so Mark Complete is the last thing: the filled button, full
   * width, under COMPLETE_READY_LINE, and Open Checklist steps aside (owner, 2026-10-22).
   */
  ready: boolean;
} {
  const off = { complete: false, onMyWay: false, undo: false, ready: false };
  if (moment === "ahead") return { ...off, primary: mine ? "start_job" : null, onMyWay: mine };
  if (moment === "driving") return { ...off, primary: mine ? "start_job" : null };
  if (moment === "on_site")
    return checklistDone
      ? { ...off, primary: null, complete: true, ready: true }
      : { ...off, primary: "open_checklist", complete: true };
  if (moment === "done") return { ...off, primary: null, undo: mine };
  return { ...off, primary: null };
}

export const HERO_ACTION_LABELS = {
  on_my_way: "On My Way",
  start_job: "Start",
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

/**
 * The card's top line: the moment, then the stop's place in the day unless the figure already
 * shows it (before arriving, the figure is "2 of 3"): "Up next", "At the pool · Stop 2 of 3".
 */
export function heroTopLine(h: Pick<TodayHero, "moment" | "content" | "stop" | "stops">): string {
  const head = heroHeadline(h);
  if (h.moment === "day_done" || h.content.figureLabel === "Stop") return head;
  return `${head} · Stop ${h.stop} of ${h.stops}`;
}
