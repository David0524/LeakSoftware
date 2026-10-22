/**
 * Notifications and the Live Activity (owner, 2026-10-19; docs/plans/
 * live-activities-and-notifications.md). The words live here so the website (which sends the
 * pushes) and both apps (which show them and the Live Activity) say the same thing.
 */

import { cleaningDueSpoken, cleaningShortLabel, type CleaningKind } from "./maintenance";
import { routingSettings, weekday, workDay } from "./route-plan";

export type NotificationKind = "text" | "job" | "quote" | "payment" | "report" | "opened" | "live";

/** Each kind a person can turn off in More › Notifications or Settings › Notifications. */
export const NOTIFICATION_KINDS: { key: NotificationKind; label: string; hint: string }[] = [
  { key: "text", label: "Customer texts", hint: "A customer texts the shop's number." },
  { key: "job", label: "New and moved jobs", hint: "A job is given to you, or its time changes." },
  { key: "quote", label: "Accepted quotes", hint: "A customer accepts a quote." },
  { key: "payment", label: "Payments", hint: "A customer pays a deposit or an invoice." },
  { key: "report", label: "Signed reports", hint: "A customer signs a report." },
  // Owner, 2026-10-22: "Techs never hear the outcome." The first time a customer opens a
  // report's link (not visit reports), to the job's techs and the owners and admins.
  {
    key: "opened",
    label: "Opened reports",
    hint: "A customer opens a report for the first time.",
  },
  // Owner, 2026-10-20: "Add a Live Activities toggle in the notifications setting." The stop
  // you're on, on the Lock Screen during the workday (iPhone's Live Activity, Android's ongoing
  // notification).
  {
    key: "live",
    label: "Live Activity",
    hint: "Your current stop on the Lock Screen during the workday.",
  },
];

/** Whether a person gets a kind: on unless their profile.notification_prefs turns it off. */
export function notificationOn(prefs: unknown, kind: NotificationKind): boolean {
  const p = prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
  return p[kind] !== false;
}

/** The kinds owners and admins get for the whole shop; techs get them for their own jobs. */
export const SHOP_KINDS: readonly NotificationKind[] = ["payment"];

export interface NotificationText {
  title: string;
  body: string;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A text from a customer: their name (or number) and what they wrote, cut to fit. */
export function textNotification(from: string, body: string): NotificationText {
  const text = body.trim().replace(/\s+/g, " ");
  return {
    title: from,
    body: text.length > 180 ? `${text.slice(0, 177)}…` : text || "Sent a picture",
  };
}

/** A job given to you or moved: "New stop Tue 9:30 AM" / "Stop moved to Tue 9:30 AM". */
export function jobNotification(input: {
  moved: boolean;
  customer: string;
  address: string | null;
  when: string | null;
}): NotificationText {
  const at = input.when ? ` ${input.when}` : "";
  return {
    title: input.moved ? `Stop moved to${at || " another day"}` : `New stop${at}`,
    body: [input.customer, input.address].filter(Boolean).join(", "),
  };
}

export function quoteNotification(customer: string, totalCents: number): NotificationText {
  return { title: "Quote accepted", body: `${customer} accepted the ${money(totalCents)} quote.` };
}

export function paymentNotification(
  customer: string,
  amountCents: number,
  what: string,
): NotificationText {
  return { title: "Payment received", body: `${customer} paid ${money(amountCents)} (${what}).` };
}

export function reportNotification(customer: string): NotificationText {
  return { title: "Report signed", body: `${customer} signed the report.` };
}

/** The customer opened a report's link for the first time: "Rebecca Soto opened the report." */
export function reportOpenedNotification(customer: string): NotificationText {
  return { title: "Report opened", body: `${customer} opened the report.` };
}

// ---------------------------------------------------------------------------
// The weekly summary email (owner, 2026-10-22: "Owners get no weekly summary")
// ---------------------------------------------------------------------------

/**
 * The Weekly Summary switch in Notifications, for owners and admins only. It's an email, not a
 * push, so it isn't one of NOTIFICATION_KINDS; it's kept in the same notification_prefs as
 * "weekly".
 */
export const WEEKLY_SUMMARY_PREF = {
  key: "weekly",
  label: "Weekly summary",
  hint: "An email on Monday morning: last week's jobs and money, and quotes waiting.",
  section: "Email",
} as const;

/**
 * Whether this person gets the weekly summary: their choice, else on for owners and off for
 * admins; never techs (the database's app.wants_weekly_summary says the same).
 */
export function weeklySummaryOn(prefs: unknown, role: string | null | undefined): boolean {
  if (role !== "owner" && role !== "admin") return false;
  const p = prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
  return typeof p.weekly === "boolean" ? p.weekly : role === "owner";
}

// ---------------------------------------------------------------------------
// The Live Activity: the stop a tech is on
// ---------------------------------------------------------------------------

/**
 * What the Live Activity (iPhone) and the ongoing notification (Android) show. No timer or
 * stopwatch (owner, 2026-10-19): before leaving, the stop's scheduled time ("ahead", from the
 * start of the workday); on the way, the arrival time of day; at the pool, the checklist; done,
 * the next stop.
 */
export type LiveStopPhase = "ahead" | "driving" | "on_site" | "done";

export interface LiveStopInput {
  phase: LiveStopPhase;
  customer: string;
  address: string | null;
  stop: number;
  stops: number;
  /**
   * How many of the day's stops are done, for the progress bar (owner, 2026-10-22: stops done
   * of all). Without it, the stops before this one.
   */
  doneStops?: number;
  /** Arrival, as a time of day ("9:42 AM"), when driving. */
  eta: string | null;
  /** The stop's scheduled time of day ("9:00 AM"), shown before On My Way. */
  scheduled?: string | null;
  checklistDone: number;
  checklistTotal: number;
  next: { customer: string; time: string | null } | null;
  /** The pool's access notes: gate code, which gate, dogs (property.access_notes). */
  access?: string | null;
  /** The plan's cleanings on this visit (filter, salt cell), with how soon each is due. */
  cleanings?: StopCleaning[];
}

/** A cleaning on a stop's visit: its name, its kind (for the icon) and how soon it's due. */
export interface StopCleaning {
  name: string;
  kind: CleaningKind;
  days: number;
  weeks: number;
}

/** A cleaning as the card and the Live Activity show it: its icon, a few words, and aloud. */
export interface CleaningBadge {
  kind: CleaningKind;
  /** "Overdue", "Today", "3 days", "2 weeks". */
  label: string;
  /** "Clean filter due in 3 days". */
  spoken: string;
  overdue: boolean;
}

export interface LiveStopContent {
  /** "On the way to Smith", "At Smith", "Smith done". */
  headline: string;
  /** The one large figure: "9:42 AM", "4 of 9", or the check. */
  figure: string;
  /** Under the figure: "Arriving", "Checklist", "Next stop". */
  figureLabel: string;
  /** "Stop 3 of 7 · 123 Palm Ln" */
  detail: string;
  /** "Then: Jones at 10:30 AM", or null when this is the last stop. */
  next: string | null;
  /** 0..1: the day's stops done of all, for the progress bar. */
  progress: number;
  /** The compact Dynamic Island's few characters: "9:42", "4/9", "✓". */
  compact: string;
  /** One sentence for VoiceOver and TalkBack. */
  spoken: string;
  /**
   * The stop's access notes on one line ("Side gate code 4821. Dog in yard."), with a key on
   * the Lock Screen, until the stop is done (owner, 2026-10-20: gate key, "go through right
   * gate", "has dogs" belong on the Live Activity). Null when there are none.
   */
  access: string | null;
  /**
   * The cleanings on this visit (owner, 2026-10-20: "The filter/salt cell cleaning alert needs
   * to be on the new Today tile and the live activity"), soonest first, until the stop is done.
   */
  cleanings: CleaningBadge[];
}

/** A visit's cleanings as badges, soonest first. */
export function cleaningBadges(list: StopCleaning[] | null | undefined): CleaningBadge[] {
  return [...(list ?? [])]
    .sort((a, b) => a.days - b.days)
    .map((c) => ({
      kind: c.kind,
      label: cleaningShortLabel(c),
      spoken: cleaningDueSpoken(c.name, c),
      overdue: c.days < 0,
    }));
}

/** Access notes as one short line: spaces and line breaks collapsed, at most 90 characters. */
export function accessLine(notes: string | null | undefined): string | null {
  const one = (notes ?? "").replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > 90 ? `${one.slice(0, 89).trimEnd()}…` : one;
}

export function liveStopContent(s: LiveStopInput): LiveStopContent {
  const base = liveStopBase(s);
  const access = s.phase === "done" ? null : accessLine(s.access);
  const cleanings = s.phase === "done" ? [] : cleaningBadges(s.cleanings);
  const spoken = [
    base.spoken,
    access ? `Access: ${access}` : null,
    cleanings.length ? `${cleanings.map((c) => c.spoken).join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { ...base, access, cleanings, spoken };
}

function liveStopBase(s: LiveStopInput): Omit<LiveStopContent, "access" | "cleanings"> {
  // No clock times (owner, 2026-10-20: "I don't like times in the live activity. Pool Jobs
  // aren't really scheduled for a certain time"): before arriving, the figure is the stop's place
  // in the day, and the next stop is named without a time. `eta` and `scheduled` are ignored.
  const of = `Stop ${s.stop} of ${s.stops}`;
  const detail = [of, s.address].filter(Boolean).join(" · ");
  const next = s.next ? `Then: ${s.next.customer}` : null;
  const doneStops = s.doneStops ?? (s.phase === "done" ? s.stop : s.stop - 1);
  const progress = s.stops > 0 ? Math.min(1, Math.max(0, doneStops / s.stops)) : 0;
  const place = s.stops > 0 ? `${s.stop} of ${s.stops}` : "";
  if (s.phase === "ahead") {
    return {
      headline: `Up next: ${s.customer}`,
      figure: place || "Today",
      figureLabel: place ? "Stop" : "",
      detail,
      next,
      progress,
      compact: place ? `${s.stop}/${s.stops}` : "…",
      spoken: `Up next: ${s.customer}. ${of}.`,
    };
  }
  if (s.phase === "driving") {
    return {
      headline: `On the way to ${s.customer}`,
      figure: place || "On the way",
      figureLabel: place ? "Stop" : "",
      detail,
      next,
      progress,
      compact: place ? `${s.stop}/${s.stops}` : "…",
      spoken: `On the way to ${s.customer}. ${of}.`,
    };
  }
  if (s.phase === "on_site") {
    const list = s.checklistTotal > 0 ? `${s.checklistDone} of ${s.checklistTotal}` : "";
    return {
      headline: `At ${s.customer}`,
      figure: list || "On site",
      figureLabel: list ? "Checklist" : "",
      detail,
      next,
      progress,
      compact: s.checklistTotal > 0 ? `${s.checklistDone}/${s.checklistTotal}` : "•",
      spoken: `At ${s.customer}.${list ? ` Checklist ${list}.` : ""} ${of}.${next ? ` ${next}.` : ""}`,
    };
  }
  return {
    headline: `${s.customer} done`,
    figure: "✓",
    figureLabel: next ? "Next stop" : "Last stop",
    detail: of,
    next: next ?? "That was the last stop today.",
    progress,
    compact: "✓",
    spoken: `${s.customer} done. ${next ? `${next}.` : "That was the last stop today."}`,
  };
}

/**
 * Whether the Live Activity runs now (owner, 2026-10-19: "Live Activity should begin at the
 * beginning of the workday"): on one of the shop's work days, from the start of its working
 * day (Settings › Scheduling), while any of the tech's stops today aren't done.
 */
export function liveStopRuns(input: {
  /** company.settings */
  settings: unknown;
  /** The shop's local date ("2026-10-19") and minutes since its midnight. */
  date: string;
  nowMin: number;
  stopsLeft: number;
}): boolean {
  const r = routingSettings(input.settings);
  if (!r.workDays.includes(weekday(input.date))) return false;
  return input.nowMin >= workDay(r).startMin && input.stopsLeft > 0;
}
