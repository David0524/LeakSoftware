/**
 * Errors in plain words (owner, 2026-10-26: "raw error text shown to users"). Anything a person
 * can see about a failure goes through `friendlyError`: a database message ("duplicate key value
 * violates unique constraint"), a browser's ("Failed to fetch"), iOS's ("The operation couldn’t
 * be completed"), a provider's (Stripe, Twilio) or an HTTP status ("The server said 500.") is
 * replaced by a sentence that says what to do. A message the app wrote itself ("Enter the
 * customer’s email.") passes through unchanged. The technical text stays in the logs, Sentry and
 * the Admin portal's Usage, never on screen.
 *
 * One list for the website, the Android app and the iPhone app (SundeckCore/FriendlyError.swift,
 * checked by the same fixtures): the order of the rules and their words are the same everywhere.
 */

export const NO_CONNECTION_MESSAGE = "No connection. Check your signal and try again.";
export const SIGN_IN_AGAIN_MESSAGE = "Your sign-in expired. Sign in again to continue.";
export const SERVER_TROUBLE_MESSAGE = "Something went wrong on our end. Try again in a moment.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";
export const NO_PERMISSION_MESSAGE = "You don’t have permission to do that.";
export const NOT_FOUND_MESSAGE = "That wasn’t found. Refresh and try again.";
export const ALREADY_EXISTS_MESSAGE = "That already exists.";
export const NOT_ALLOWED_MESSAGE = "That isn’t allowed. Check what you entered and try again.";
export const IN_USE_MESSAGE = "That’s in use somewhere else, or it’s gone. Refresh and try again.";
export const BLANK_FIELD_MESSAGE = "A required field is blank.";
export const TOO_LONG_MESSAGE = "That’s too long.";
export const TOO_LARGE_NUMBER_MESSAGE = "That number is too large.";
export const BAD_VALUE_MESSAGE = "That isn’t a valid value. Check it and try again.";
export const TOO_SLOW_MESSAGE = "That took too long. Try again.";
export const TOO_MANY_TRIES_MESSAGE = "Too many tries. Wait a minute and try again.";
export const TOO_BIG_FILE_MESSAGE = "That file is too large.";
export const PAYMENTS_TROUBLE_MESSAGE =
  "Payments are having trouble right now. Try again in a moment.";
export const TEXT_OPTED_OUT_MESSAGE = "This customer has opted out of texts.";
export const TEXT_BAD_NUMBER_MESSAGE = "That isn’t a number we can text. Check it and try again.";
export const TEXT_FAILED_MESSAGE = "The text couldn’t be sent. Try again.";
export const PHONE_STORAGE_FULL_MESSAGE =
  "Phone storage is full. Free up some space; nothing already saved is lost.";
export const PHONE_DATABASE_MESSAGE = "Couldn’t save on this phone. Try again.";

/** The rules, in order: a pattern (case-insensitive) and what to say instead. First match wins. */
export const FRIENDLY_RULES: readonly (readonly [string, string])[] = [
  [
    "SQLITE_FULL|database or disk is full|ENOSPC|no space left|not enough (free )?space|disk full|storage is full",
    PHONE_STORAGE_FULL_MESSAGE,
  ],
  [
    "failed to fetch|fetch failed|load failed|network ?request failed|network ?error|net::err_|econn(refused|reset|aborted)|etimedout|enotfound|eai_again|socket hang up|internet connection appears to be offline|request timed out|(connection|operation) timed out|connection (was )?(lost|reset|refused|aborted|closed)|NSURLErrorDomain|URLError|could not connect to the server|hostname could not be found",
    NO_CONNECTION_MESSAGE,
  ],
  // Text a customer can't get: the carrier's or Twilio's words, never shown as they are.
  ["\\b21610\\b|unsubscribed recipient", TEXT_OPTED_OUT_MESSAGE],
  [
    "21211|21614|not a valid phone number|not a mobile number|invalid ?'?to'? ?(phone )?number",
    TEXT_BAD_NUMBER_MESSAGE,
  ],
  ["^not sent:|^unable to create record|twilio", TEXT_FAILED_MESSAGE],
  ["^the server said (401)\\.?$", SIGN_IN_AGAIN_MESSAGE],
  ["^the server said (403)\\.?$", NO_PERMISSION_MESSAGE],
  ["^the server said (404)\\.?$", NOT_FOUND_MESSAGE],
  ["^the server said (413)\\.?$", TOO_BIG_FILE_MESSAGE],
  ["^the server said (429)\\.?$", TOO_MANY_TRIES_MESSAGE],
  ["^the server said \\d{3}\\.?$", SERVER_TROUBLE_MESSAGE],
  [
    "jwt (expired|malformed)|invalid jwt|invalid (refresh )?token|refresh token (not found|already used)|not authenticated|session (expired|not found|missing)|auth session missing|sign in to sync|permission denied for (function|table|schema|sequence|relation)",
    SIGN_IN_AGAIN_MESSAGE,
  ],
  ["unique constraint|duplicate key value", ALREADY_EXISTS_MESSAGE],
  ["row-level security|violates row level", NO_PERMISSION_MESSAGE],
  ["not-null constraint|null value in column|NOT NULL constraint", BLANK_FIELD_MESSAGE],
  ["foreign key constraint", IN_USE_MESSAGE],
  ["check constraint|constraint failed", NOT_ALLOWED_MESSAGE],
  ["value too long for type", TOO_LONG_MESSAGE],
  ["out of range for type|numeric field overflow", TOO_LARGE_NUMBER_MESSAGE],
  ["invalid input syntax for type uuid", NOT_FOUND_MESSAGE],
  ["invalid input syntax|invalid input value for enum|malformed array literal", BAD_VALUE_MESSAGE],
  ["JSON object requested, multiple \\(or no\\) rows returned|\\bPGRST\\d+", NOT_FOUND_MESSAGE],
  [
    "deadlock detected|could not serialize|canceling statement due to|lock timeout",
    TOO_SLOW_MESSAGE,
  ],
  [
    "^stripe said|\\breq_[A-Za-z0-9]{6,}|^No such (customer|price|product|subscription|account)|Stripe(Invalid|API|Card|Connection|Authentication)",
    PAYMENTS_TROUBLE_MESSAGE,
  ],
  [
    "internal server error|bad gateway|service unavailable|gateway time-?out|FUNCTION_INVOCATION|error occurred in the server components render|unexpected token '?<|is not valid JSON|unexpected end of JSON|\\b(relation|column|function|table|schema) .* does not exist|could not find the .* in the schema cache|syntax error at or near|could not find the function",
    SERVER_TROUBLE_MESSAGE,
  ],
  ["UNIQUE constraint failed", ALREADY_EXISTS_MESSAGE],
  ["SQLite|database is locked", PHONE_DATABASE_MESSAGE],
  [
    "Error Domain=|NSError|couldn.t be completed|^(Type|Reference|Range|Syntax|Eval|URI)Error\\b|\\n\\s+at |DecodingError|keyNotFound\\(|typeMismatch\\(|valueNotFound\\(|dataCorrupted\\(|^[A-Za-z0-9_.]+\\(.*\\)$",
    GENERIC_ERROR_MESSAGE,
  ],
];

const COMPILED = FRIENDLY_RULES.map(([pattern, text]) => [new RegExp(pattern, "i"), text] as const);

/** The words of an error value: an Error's message, a string, or an object's `message`. */
function textOf(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message;
  if (raw && typeof raw === "object" && "message" in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

/**
 * The plain sentence for an error that matches a rule (a database, browser, system or provider
 * message), or null for text no rule knows: that is either our own sentence or a code's message,
 * which only the caller can tell apart (the server shows an unknown one as "something went
 * wrong on our end").
 */
export function knownFriendlyError(raw: unknown): string | null {
  // "TypeError: Failed to fetch" and "Error: …" read as the message they carry.
  const text = textOf(raw)
    .replace(/^\s*(Error|[A-Z][A-Za-z]*Error)\s*:\s*/, "")
    .trim();
  if (!text) return null;
  for (const [pattern, words] of COMPILED) if (pattern.test(text)) return words;
  // A code name ("invalidDate") or a wall of text isn't something to read out.
  if (!/\s/.test(text) || text.length > 240 || text.includes("\n")) return GENERIC_ERROR_MESSAGE;
  return null;
}

/**
 * What to show a person for an error (or a raw message): a plain sentence, never database,
 * browser, provider or system text. Our own sentences pass through; `fallback` is for an error
 * with no words at all.
 */
export function friendlyError(raw: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
  const known = knownFriendlyError(raw);
  if (known) return known;
  const text = textOf(raw)
    .replace(/^\s*(Error|[A-Z][A-Za-z]*Error)\s*:\s*/, "")
    .trim();
  return text || fallback;
}
