/**
 * Skip a Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md). A maintenance visit
 * that can't be done is skipped, with a reason from the shop's list, an optional note and
 * photo. The office reschedules it or dismisses it. The database enforces the status rules
 * (supabase/migrations/20261022004500_skip_visit.sql); the words live here so the website and
 * both apps say the same thing.
 */
import type { NotificationText } from "./notifications";

export const SKIP_VISIT_LABEL = "Skip Visit";
export const SKIP_UNDO_LABEL = "Undo Skip";
export const SKIP_DISMISS_LABEL = "Dismiss";
export const SKIP_RESCHEDULE_LABEL = "Reschedule";
export const SKIP_TEXT_LABEL = "Text the Customer";
export const SKIP_NOTE_MAX = 1000;
/** The reason the day-end auto-skip gives (a system reason, never offered to pick). */
export const NOT_DONE_REASON = "Not Done";
/** The banner after a skip, with Undo for the usual five seconds (removal.ts). */
export const SKIP_BANNER = "Visit skipped";
export const SKIP_REASON_REQUIRED = "Pick a reason for skipping this visit.";

export interface SkipReason {
  id: string;
  company_id?: string;
  label: string;
  sort_order: number;
  active: boolean;
  system?: boolean;
  deleted_at?: string | null;
}

/** The reasons a person can pick: live, offered, and not the server's own, in the shop's order. */
export function pickableSkipReasons(rows: SkipReason[]): SkipReason[] {
  return rows
    .filter((r) => r.active && !r.system && !r.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** Whether Skip Visit is offered: a maintenance visit that hasn't been done yet. */
export function canSkipVisit(job: { type?: string | null; status: string }): boolean {
  return (
    job.type === "maintenance" &&
    (job.status === "unscheduled" || job.status === "scheduled" || job.status === "in_progress")
  );
}

/** The job columns Skip writes. `at` is the phone's clock (it may be offline). */
export function skipValues(input: { reason: string; note?: string | null; at: string }): {
  status: "skipped";
  skip_reason: string;
  skip_note: string | null;
  skipped_at: string;
} {
  const note = (input.note ?? "").trim().slice(0, SKIP_NOTE_MAX);
  return {
    status: "skipped",
    skip_reason: input.reason.trim(),
    skip_note: note || null,
    skipped_at: input.at,
  };
}

/** Whether the skip still waits for the office (Reschedule or Dismiss). */
export function skipNeedsOffice(job: { status: string; skip_handled_at?: string | null }): boolean {
  return job.status === "skipped" && !job.skip_handled_at;
}

/** The badge on a stop: "Skipped" (a dismissed skip too: it's still not done). */
export function skipBadge(job: { status: string }): "Skipped" | null {
  return job.status === "skipped" ? "Skipped" : null;
}

/** Whether Reschedule, Dismiss and Undo Skip are on offer to this person. Dismiss is the office's. */
export function skipActions(
  job: { status: string; skip_handled_at?: string | null },
  isManager: boolean,
): { reschedule: boolean; dismiss: boolean; undo: boolean } {
  const skipped = job.status === "skipped";
  return {
    reschedule: skipped && isManager,
    dismiss: skipped && isManager && !job.skip_handled_at,
    undo: skipped,
  };
}

/**
 * The text Skip offers to send the customer (the tech's own phone, as On My Way does): the
 * reason in the shop's words, lowercased into the sentence.
 */
export function skipCustomerText(input: {
  customer: string | null;
  tech: string;
  shop: string;
  reason: string;
}): string {
  const hi = input.customer ? `Hi ${input.customer.split(" ")[0]}, ` : "Hi, ";
  const shop = input.shop.replace(/\.$/, "");
  const reason = input.reason.trim().toLowerCase();
  return `${hi}this is ${input.tech.split(" ")[0]} from ${shop}. We had to skip today’s pool service (${reason}). We’ll be in touch to reschedule.`;
}

/** The owners' and admins' push: "Visit skipped" · "Smith: Dog in Yard". */
export function skipNotification(input: {
  customer: string;
  reason: string;
  by: string | null;
}): NotificationText {
  return {
    title: "Visit skipped",
    body: `${input.customer}: ${input.reason}${input.by ? `, skipped by ${input.by}` : ""}.`,
  };
}

/** The push when the day-end run skips visits nobody did: "3 visits weren't done". */
export function autoSkipNotification(count: number): NotificationText {
  return {
    title: count === 1 ? "A visit wasn’t done" : `${count} visits weren’t done`,
    body: `${count === 1 ? "It was" : "They were"} skipped at the end of the day. Reschedule or dismiss ${count === 1 ? "it" : "them"} in Jobs › Skipped.`,
  };
}

/** Skip Unfinished Visits at Day's End: off unless the shop turned it on. */
export function skipsUnfinishedVisits(settings: unknown): boolean {
  return (settings as { skip_unfinished_visits?: unknown } | null)?.skip_unfinished_visits === true;
}

export const SKIP_UNFINISHED_LABEL = "Skip Unfinished Visits at Day’s End";
export const SKIP_UNFINISHED_HINT =
  "At the end of each day, visits that were never started are skipped as Not Done, so you can reschedule or dismiss them.";

/** The line under a skipped visit's name: "Dog in Yard · Alex, Nov 16, 9:05 AM". */
export function skipSummary(
  job: { skip_reason?: string | null; skipped_at?: string | null },
  by: string | null,
  when: string | null,
): string {
  const who = [by, when].filter(Boolean).join(", ");
  return [job.skip_reason, who || null].filter(Boolean).join(" · ");
}
