import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// A send that happens once (owner, 2026-10-26: "taps submit twice"). A double tap, a request the
// phone repeats because the answer was slow, or two devices at once must not email or text a
// customer twice. A send of the same thing to the same address, in the same job, that went out
// a moment ago is answered as if it had just been sent, and nothing is sent again. The buttons
// disable themselves while a send runs (the first line of defense); this is the second, for the
// requests that still arrive twice.
//
// "The same thing" is the message log's own columns: the job, the channel, who it went to, and
// which template (`report_homeowner`, `invoice`, `visit_report`, `receipt`). Sending again on
// purpose a couple of minutes later (the customer lost it) works as before.

/** How long a send counts as "a moment ago". */
export const SEND_ONCE_WINDOW_MS = 2 * 60_000;

export interface SendKey {
  jobId: string;
  /** message.channel: 'email', 'sms' (company number) or 'sms_device'. */
  channel: "email" | "sms" | "sms_device";
  /** message.recipient, as the log writes it. */
  recipient: string;
  /** message.template. */
  template: string;
}

const keyOf = (k: SendKey) => [k.jobId, k.channel, k.recipient.toLowerCase(), k.template].join("|");

/** Sends running now on this server, so two requests at once share one send. */
const running = new Map<string, Promise<unknown>>();

/** Whether the same thing went out to the same place within the window. */
export async function sentRecently(
  db: SupabaseClient,
  key: SendKey,
  now = Date.now(),
): Promise<boolean> {
  const since = new Date(now - SEND_ONCE_WINDOW_MS).toISOString();
  const { data, error } = await db
    .from("message")
    .select("id")
    .eq("job_id", key.jobId)
    .eq("channel", key.channel)
    .eq("recipient", key.recipient)
    .eq("template", key.template)
    .in("status", ["sent", "delivered"])
    .gte("created_at", since)
    .limit(1);
  // A log that can't be read never stops a send that was asked for.
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Runs `send` unless the same send is running (then its answer is shared) or went out a moment
 * ago (then `again` answers, and nothing is sent).
 */
export async function sendOnce<T>(
  db: SupabaseClient,
  key: SendKey,
  send: () => Promise<T>,
  again: () => T,
): Promise<T> {
  const id = keyOf(key);
  const inFlight = running.get(id) as Promise<T> | undefined;
  if (inFlight) return inFlight;
  const run = (async () => {
    if (await sentRecently(db, key)) return again();
    return send();
  })();
  running.set(id, run);
  try {
    return await run;
  } finally {
    running.delete(id);
  }
}
