// Office view helpers: schedule dates and the job timeline (no I/O).

import { JOB_STATUS_LABELS, type JobStatus } from "./job-status";
import { zonedTimeToIso } from "./forms";
import { dateFormat } from "./intl";

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export type ScheduleView = "day" | "week" | "month";

const DAY_MS = 86_400_000;

function parse(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDateString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v));
}

export function addDays(date: string, days: number): string {
  return format(parse(date) + days * DAY_MS);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = new Date(parse(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** The same day of the month, `months` later (clamped: Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return format(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

/** The month's calendar: whole weeks, Monday first, from the week of the 1st to the last. */
export function monthGrid(date: string): string[] {
  const first = `${date.slice(0, 8)}01`;
  const last = addDays(addMonths(first, 1), -1);
  const days: string[] = [];
  for (let d = weekStart(first); d <= last || days.length % 7 !== 0; d = addDays(d, 1))
    days.push(d);
  return days;
}

/** The dates a schedule view covers. */
export function scheduleDays(view: ScheduleView, date: string): string[] {
  if (view === "day") return [date];
  if (view === "month") return monthGrid(date);
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** UTC instants bounding the view in the company's time zone: [from, to). */
export function scheduleBounds(days: string[], timeZone: string): { from: string; to: string } {
  return {
    from: zonedTimeToIso(days[0]!, "00:00", timeZone),
    to: zonedTimeToIso(addDays(days[days.length - 1]!, 1), "00:00", timeZone),
  };
}

export function formatTime(iso: string, timeZone: string): string {
  return dateFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function formatDay(date: string, style: "short" | "long" = "short"): string {
  return dateFormat("en-US", {
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parse(date)));
}

// ---------------------------------------------------------------------------
// Timeline (from audit_log)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  user_id: string | null;
  table_name: string;
  row_id: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface TimelineEvent {
  at: string;
  userId: string | null;
  text: string;
}

const NOUN: Record<string, string> = {
  job: "job",
  job_component: "component",
  checklist_item_result: "checklist item",
  test_result: "test",
  finding: "finding",
  media: "capture",
  customer: "customer",
  property: "property",
};

const KIND_NOUN: Record<string, string> = { photo: "photo", video: "video", audio: "voice note" };

/** Fields that are bookkeeping, not something a person did. */
const QUIET = new Set(["company_id", "id", "job_id", "sort_order", "instance_number"]);

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Turns field-level audit rows into one readable line per change. Rows written in the same
 * statement (same time, person, and record) are one event. `labelFor` names a record
 * (e.g. a component's label) when the change itself does not carry a name.
 */
export function timeline(
  entries: AuditEntry[],
  labelFor: (table: string, rowId: string) => string | undefined,
): TimelineEvent[] {
  const groups = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const key = `${e.created_at}|${e.user_id}|${e.table_name}|${e.row_id}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const events: TimelineEvent[] = [];
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const fields = new Map(rows.filter((r) => r.field).map((r) => [r.field!, r]));
    const created = rows.every((r) => r.old_value === null || r.old_value === undefined);
    const label = labelFor(first.table_name, first.row_id);
    const text = describe(first.table_name, fields, created, label);
    if (text) events.push({ at: first.created_at, userId: first.user_id, text });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

function describe(
  table: string,
  fields: Map<string, AuditEntry>,
  created: boolean,
  label: string | undefined,
): string | null {
  const v = (f: string) => fields.get(f)?.new_value;
  const noun = NOUN[table] ?? table.replace(/_/g, " ");

  if (fields.has("deleted_at") && v("deleted_at")) {
    return `Removed ${noun}${label ? ` “${label}”` : ""}`;
  }

  if (table === "job") {
    if (fields.has("status")) {
      const to = JOB_STATUS_LABELS[v("status") as JobStatus] ?? str(v("status"));
      if (created) return `Job created (${to})`;
      const from = JOB_STATUS_LABELS[fields.get("status")!.old_value as JobStatus];
      return from ? `Status: ${from} → ${to}` : `Status: ${to}`;
    }
    if (fields.has("assigned_user_id")) return "Reassigned";
    if (fields.has("scheduled_start")) return "Rescheduled";
    if (fields.has("summary_notes")) return "Job notes updated";
  }

  if (table === "checklist_item_result" && fields.has("status")) {
    const status = str(v("status"));
    if (status === "pending" && created) return null; // created with the component
    const what = label ?? "Checklist item";
    if (status === "inspected") {
      const method = str(v("method"));
      return `${what} inspected${method ? ` (${method})` : ""}`;
    }
    if (status === "excluded") {
      const reason = str(v("exclusion_reason"));
      return `${what} excluded${reason ? `: ${reason}` : ""}`;
    }
    return `${what} set back to to-do`;
  }

  if (table === "job_component" && created)
    return `Added ${label ?? str(v("label")) ?? "component"}`;

  if (table === "test_result") {
    const outcome = str(v("outcome"));
    if (created) return `${label ?? "Test"} recorded${outcome ? `: ${outcome}` : ""}`;
    if (fields.has("outcome")) return `${label ?? "Test"} outcome changed to ${outcome}`;
    return `${label ?? "Test"} edited`;
  }

  if (table === "finding") {
    const title = str(v("title")) || label || "finding";
    if (created) return `Finding added: ${title}`;
    if (fields.has("status")) return `Finding “${label ?? title}” marked ${str(v("status"))}`;
    return `Finding “${label ?? title}” edited`;
  }

  if (table === "media") {
    const kind = KIND_NOUN[str(v("kind"))] ?? label ?? "capture";
    if (created) return `Added a ${kind}`;
    if (fields.has("upload_state") && v("upload_state") === "uploaded") return null;
    if (fields.has("markup")) return `Marked up a ${label ?? "photo"}`;
    if (fields.has("transcript")) return "Voice note transcribed";
    if (fields.has("caption")) return `Captioned a ${label ?? "capture"}`;
  }

  const changed = [...fields.keys()].filter((f) => !QUIET.has(f));
  if (changed.length === 0) return null;
  if (created) return `Added ${noun}${label ? ` “${label}”` : ""}`;
  return `Updated ${noun}${label ? ` “${label}”` : ""}: ${changed.map((f) => f.replace(/_/g, " ")).join(", ")}`;
}

/**
 * A same-site path to go to after signing in, or the fallback: only "/path", never "//host",
 * "/\\host" (browsers read the backslash as a slash), or anything with control characters
 * (security review 2026-10-16: open redirect).
 */
export function safePath(next: unknown, fallback = "/home"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  const unsafe = [...next].some(
    (c) => c === "\\" || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
  );
  if (next.startsWith("//") || unsafe) return fallback;
  try {
    const url = new URL(next, "https://tidemark.invalid");
    return url.origin === "https://tidemark.invalid" ? next : fallback;
  } catch {
    return fallback;
  }
}
