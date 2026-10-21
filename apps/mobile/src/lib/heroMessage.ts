import { localDate, stopDone, type HeroMoment } from "@leakbook/core";

// On My Way lives in Message (owner, 2026-10-20: "the message button should default to the 'on
// my way' text when you're actually on your [way], but the tech can always edit the message. So
// let's just remove the car icon and have the one text icon"; docs/design/2026-10-20-gestures.md
// section 2). The parts with no React, so they're tested without a phone.

/** What Message opens: the On My Way text filled in, or a blank text. */
export type MessageKind = "on_my_way" | "blank";

/**
 * Message on the tech's own stop before they arrive (`ahead`, `driving`) opens the On My Way
 * text, until On My Way has gone out today. On site, after the stop, once it has gone out, or
 * for an owner looking at a tech's day: a blank text.
 */
export function messageKind(input: {
  mine: boolean;
  moment: HeroMoment | null;
  /** job.on_my_way_at */
  onMyWayAt: string | null | undefined;
  today: string;
  timeZone: string;
}): MessageKind {
  const { mine, moment, onMyWayAt, today, timeZone } = input;
  if (!mine || (moment !== "ahead" && moment !== "driving")) return "blank";
  if (onMyWayAt && localDate(new Date(onMyWayAt), timeZone) === today) return "blank";
  return "on_my_way";
}

/**
 * Where a stop is, for Message: done, on site (started), or still to come (`ahead`; On My Way
 * already sent today is read from `on_my_way_at` by messageKind).
 */
export function stopMoment(
  job: { status: string; stop_done_on?: string | null },
  today: string,
): HeroMoment {
  if (stopDone(job, today)) return "done";
  return job.status === "in_progress" ? "on_site" : "ahead";
}

/** The route parameters that make a compose screen an On My Way text. */
export interface OnMyWayDraft {
  /** The stop it's for: sending records On My Way on it. */
  jobId: string;
  /** The drive to it in minutes, for the arrival it promises. */
  driveMin: number;
  /** The text filled in; the tech can change it. */
  body: string;
}

/**
 * Where Message goes with the shop's number: the customer's conversation, or a new message to
 * them, with the On My Way text filled in when there is one.
 */
export function messageRoute(input: {
  conversationId?: string | null;
  customerId: string;
  jobId: string;
  draft?: OnMyWayDraft | null;
}): string {
  const { conversationId, customerId, jobId, draft } = input;
  const q = new URLSearchParams();
  if (!conversationId) {
    q.set("customer", customerId);
    q.set("job", jobId);
  }
  if (draft) {
    q.set("omw", draft.jobId);
    q.set("drive", String(Math.max(0, Math.round(draft.driveMin))));
    q.set("body", draft.body);
  }
  const query = q.toString();
  const path = conversationId ? `/messages/${conversationId}` : "/messages/new";
  return query ? `${path}?${query}` : path;
}

/** The On My Way draft a compose screen was opened with, from its route parameters. */
export function readOnMyWayDraft(params: {
  omw?: string | string[];
  drive?: string | string[];
  body?: string | string[];
}): OnMyWayDraft | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const jobId = one(params.omw);
  if (!jobId) return null;
  const drive = Number(one(params.drive));
  return {
    jobId,
    driveMin: Number.isFinite(drive) && drive >= 0 ? drive : 0,
    body: one(params.body) ?? "",
  };
}

/** The phone's own Messages with the text filled in ("?&body=" works on iPhone and Android). */
export function smsUrl(phone: string, body?: string | null): string {
  const number = phone.replace(/[^\d+]/g, "");
  return body ? `sms:${number}?&body=${encodeURIComponent(body)}` : `sms:${number}`;
}
