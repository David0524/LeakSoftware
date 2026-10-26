import { SERVER_TROUBLE_MESSAGE, friendlyError, knownFriendlyError } from "@leakbook/core";
import { friendlyDbError } from "@/lib/limits";
import { EmailNotConfigured } from "./email";
import { TextingError } from "./texting";

// The phone apps keep a queued send and try again later when the server answers 401, 408, 429
// or 5xx, and drop it as refused on any other 4xx (apps/mobile/src/data/reports.ts
// tryAgainLater). So the routes they call answer 400 only for a real refusal (a missing email,
// a shop rule, the database saying no) and 500 for anything unexpected (the database or a
// provider unreachable, a bug), with the same message either way.

/** A request the server refuses for good: sending it again won't help. */
export class Refusal extends Error {}

// Postgres refusals: data exceptions (22), integrity (23), invalid authorization (28), access
// and syntax (42, e.g. 42501 row security), raised exceptions (P0); PostgREST request errors
// (PGRST1xx, e.g. PGRST116 no row for .single()). Connection faults (PGRST0xx), schema cache
// (PGRST2xx) and network failures (no code) are faults.
const REFUSED = /^(22|23|28|42|P0|PGRST1)/;

/** The Error for a Supabase error: a Refusal when the database refused, else a fault. */
export function dbFailure(error: { message: string; code?: string | null }): Error {
  return error.code && REFUSED.test(error.code)
    ? new Refusal(friendlyDbError(error.message))
    : new Error(error.message);
}

/** The HTTP status for an error thrown while handling a phone's request. */
export function failureStatus(e: unknown): 400 | 500 {
  return e instanceof Refusal || e instanceof EmailNotConfigured || e instanceof TextingError
    ? 400
    : 500;
}

/**
 * A problem on our side or a provider's (the phone tries again later, status 500) whose message
 * was written for people to read ("The email didn’t go through. Text the link instead.").
 */
export class Fault extends Error {}

/**
 * What a phone is told about an error thrown while handling its request: our own messages (a
 * refusal, a fault we worded, texting and email setup) in plain words, and for anything else
 * (a database, provider or code error) one plain line, with the technical text logged here.
 */
export function failureMessage(e: unknown): string {
  if (
    e instanceof Refusal ||
    e instanceof Fault ||
    e instanceof EmailNotConfigured ||
    e instanceof TextingError
  )
    return friendlyError(e.message);
  const raw =
    e instanceof Error
      ? e.message
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  console.error("[server fault]", raw);
  // Text no rule knew is a code or provider message: never shown as it is.
  return knownFriendlyError(raw) ?? SERVER_TROUBLE_MESSAGE;
}
