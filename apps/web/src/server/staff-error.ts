import { SERVER_TROUBLE_MESSAGE, knownFriendlyError } from "@leakbook/core";

// What the Admin portal shows about a failure (owner, 2026-10-27: "Fix that staff admin
// portal"): the same plain sentences the shops see, never a database, Stripe, Supabase or
// provider message. The raw text goes to the server log, where staff with access can read it.

/** A failed send with nothing in the shared list to say why. */
export const SEND_FAILED_MESSAGE = "The message couldn’t be sent.";

/** An Error whose message is already plain words (made by `staffFailure`, or our own sentence). */
export class StaffError extends Error {}

/** An Error whose message is plain words; the technical text is logged here and kept off the page. */
export function staffFailure(raw: unknown, where: string): StaffError {
  const text = raw instanceof Error ? raw.message : String(raw);
  console.error(`[admin] ${where}:`, text);
  return new StaffError(knownFriendlyError(text) ?? SERVER_TROUBLE_MESSAGE);
}

/** What a portal action tells staff when it throws: plain words, the technical text logged. */
export function staffActionError(e: unknown, where: string): string {
  if (e instanceof StaffError) return e.message;
  return staffFailure(e, where).message;
}

/** The plain words for an error saved with a failed email or text, or null when there is none. */
export function failedSendText(raw: string | null | undefined, where: string): string | null {
  if (!raw) return null;
  console.error(`[admin] ${where}:`, raw);
  return knownFriendlyError(raw) ?? SEND_FAILED_MESSAGE;
}

/**
 * The plain words for an error an app reported on a screen (Usage). An error screen's text is
 * the crash's own, so it is named, not repeated; a failed save was already worded for the
 * person who saw it, so it stays, unless it is one of the shared list's raw kinds.
 */
export function reportedErrorText(raw: string | null | undefined, where: string): string | null {
  if (!raw) return null;
  const screen = /^Error screen:\s*/i.exec(raw);
  if (screen) {
    const rest = raw.slice(screen[0].length);
    console.error(`[admin] ${where}:`, rest);
    return `Error screen: ${knownFriendlyError(rest) ?? SERVER_TROUBLE_MESSAGE}`;
  }
  const known = knownFriendlyError(raw);
  if (known) console.error(`[admin] ${where}:`, raw);
  return known ?? raw;
}
