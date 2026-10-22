/**
 * Activity: what happened in the shop, newest first (owner, 2026-10-20; docs/plans/
 * search-and-activity.md, section 2). The database records the events (public.activity,
 * 20261020000300_activity.sql) and hands them out through activity_feed(); the words are made
 * here so the website and both apps say the same thing.
 */

import { localDate } from "./job-list";
import { dateFormat } from "./intl";
import { formatCents } from "./money";

export type ActivityKind =
  | "quote_accepted"
  | "payment_received"
  | "report_signed"
  | "report_sent"
  | "report_opened"
  | "job_completed"
  | "job_assigned"
  | "job_moved"
  | "text_received";

/** One event as activity_feed() returns it. */
export interface ActivityEvent {
  id: string;
  kind: ActivityKind | string;
  created_at: string;
  job_id?: string | null;
  conversation_id?: string | null;
  customer_name?: string | null;
  job_number?: number | null;
  amount_cents?: number | null;
  scheduled_at?: string | null;
  preview?: string | null;
  actor_name?: string | null;
  assignee_name?: string | null;
}

/** The round symbol for each kind; each platform draws its own (SF Symbols, SVG). */
export type ActivitySymbol =
  "quote" | "payment" | "signature" | "report" | "opened" | "done" | "person" | "calendar" | "text";

export interface ActivityRow {
  id: string;
  symbol: ActivitySymbol;
  title: string;
  detail: string | null;
  /** "9:42 AM" today, "Yesterday", "Oct 14". */
  time: string;
  /** What tapping it opens. */
  open: { screen: "job" | "conversation"; id: string } | null;
}

export const ACTIVITY_TITLE = "Activity";
/** Events per page; more load on scroll. */
export const ACTIVITY_PAGE_SIZE = 50;
/** The latest events on the owner's Dashboard, then See All. */
export const ACTIVITY_DASHBOARD_COUNT = 3;
export const ACTIVITY_OFFLINE = "Activity shows when you’re online.";
export const ACTIVITY_EMPTY =
  "Nothing yet. Accepted quotes, payments, reports, finished jobs, and customer texts show here.";
/** What a screen reader says for the blue dot: there are events since Activity was opened. */
export const ACTIVITY_NEW = "New activity";

/** The Dashboard's Activity button, for screen readers: "Activity, new activity" with the dot. */
export function activityButtonLabel(unread: boolean): string {
  return unread ? `${ACTIVITY_TITLE}, ${ACTIVITY_NEW.toLowerCase()}` : ACTIVITY_TITLE;
}
/** Under More, beside the Activity row. */
export const ACTIVITY_DETAIL = "Quotes, payments, reports, jobs, and texts";

const SYMBOLS: Record<ActivityKind, ActivitySymbol> = {
  quote_accepted: "quote",
  payment_received: "payment",
  report_signed: "signature",
  report_sent: "report",
  report_opened: "opened",
  job_completed: "done",
  job_assigned: "person",
  job_moved: "calendar",
  text_received: "text",
};

/** "Tony Reyes" -> "Tony". */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

/** "9:42 AM" today, "Yesterday", "Oct 14" (or "Oct 14, 2025" in another year). */
export function activityTime(iso: string, now: Date, timeZone: string): string {
  const d = new Date(iso);
  const day = localDate(d, timeZone);
  const today = localDate(now, timeZone);
  if (day === today)
    return dateFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
  if (day === previousDay(today)) return "Yesterday";
  return dateFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(d);
}

/** The day header: "Today", "Yesterday", then "Tue, Oct 14" (with the year when it differs). */
export function activityDay(iso: string, now: Date, timeZone: string): string {
  const d = new Date(iso);
  const day = localDate(d, timeZone);
  const today = localDate(now, timeZone);
  if (day === today) return "Today";
  if (day === previousDay(today)) return "Yesterday";
  return dateFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(d);
}

/** "2026-10-19" for "2026-10-20". */
function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Where a job moved: "Tue 9:30 AM" in the coming week (today included), else "Oct 28, 9:30 AM". */
export function movedTo(iso: string, now: Date, timeZone: string): string {
  const d = new Date(iso);
  const t = dateFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
  const ahead =
    Date.parse(`${localDate(d, timeZone)}T00:00:00Z`) -
    Date.parse(`${localDate(now, timeZone)}T00:00:00Z`);
  if (ahead >= 0 && ahead < 7 * 86_400_000)
    return `${dateFormat("en-US", { timeZone, weekday: "short" }).format(d)} ${t}`;
  const sameYear = localDate(d, timeZone).slice(0, 4) === localDate(now, timeZone).slice(0, 4);
  return `${dateFormat("en-US", { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(d)}, ${t}`;
}

const jobLabel = (n: number | null | undefined) => (n != null ? `Job #${n}` : "Job");

/** One event as a row: its symbol, title, detail, time, and what it opens. */
export function activityRow(e: ActivityEvent, now: Date | string, timeZone: string): ActivityRow {
  const at = typeof now === "string" ? new Date(now) : now;
  const customer = e.customer_name?.trim() || "A customer";
  const money = e.amount_cents != null ? `, ${formatCents(e.amount_cents)}` : "";
  const kind = e.kind as ActivityKind;
  let title: string;
  let detail: string | null = customer;
  switch (kind) {
    case "quote_accepted":
      title = "Quote accepted";
      detail = `${customer}${money}`;
      break;
    case "payment_received":
      title = "Payment received";
      detail = `${customer}${money}`;
      break;
    case "report_signed":
      title = "Report signed";
      break;
    case "report_sent":
      title = "Report sent";
      break;
    case "report_opened":
      // The customer's first open of the report's link (owner, 2026-10-22).
      title = "Report opened";
      break;
    case "job_completed": {
      const by = firstName(e.actor_name);
      title = "Job completed";
      detail = by ? `${customer}, by ${by}` : customer;
      break;
    }
    case "job_assigned": {
      const to = firstName(e.assignee_name);
      title = to
        ? `${jobLabel(e.job_number)} assigned to ${to}`
        : `${jobLabel(e.job_number)} assigned`;
      break;
    }
    case "job_moved":
      title = e.scheduled_at
        ? `${jobLabel(e.job_number)} moved to ${movedTo(e.scheduled_at, at, timeZone)}`
        : `${jobLabel(e.job_number)} moved`;
      break;
    case "text_received":
      title = `Text from ${customer}`;
      detail = e.preview?.trim() || "Sent a picture";
      break;
    default:
      title = "Update";
  }
  const open =
    kind === "text_received"
      ? e.conversation_id
        ? { screen: "conversation" as const, id: e.conversation_id }
        : null
      : e.job_id
        ? { screen: "job" as const, id: e.job_id }
        : null;
  return {
    id: e.id,
    symbol: SYMBOLS[kind] ?? "report",
    title,
    detail,
    time: activityTime(e.created_at, at, timeZone),
    open,
  };
}

export interface ActivityDay {
  /** The shop's local date, "2026-10-20". */
  key: string;
  /** "Today", "Yesterday", "Tue, Oct 14". */
  title: string;
  rows: ActivityRow[];
}

/** Events (newest first) under their day headers. */
export function groupActivity(
  events: readonly ActivityEvent[],
  now: Date | string,
  timeZone: string,
): ActivityDay[] {
  const at = typeof now === "string" ? new Date(now) : now;
  const days: ActivityDay[] = [];
  for (const e of events) {
    const key = localDate(new Date(e.created_at), timeZone);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, title: activityDay(e.created_at, at, timeZone), rows: [] };
      days.push(day);
    }
    day.rows.push(activityRow(e, at, timeZone));
  }
  return days;
}
