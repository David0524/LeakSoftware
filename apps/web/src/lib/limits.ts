import { friendlyError } from "@leakbook/core";
import { isUuid } from "./uuid";

// Checks the website's forms share for edge inputs (break testing, 2026-10-20). Pure, so
// they're unit-tested in test/limits.test.ts.

/** Longest quote or invoice line description. */
export const LINE_DESCRIPTION_MAX = 500;
/** Longest name typed to accept a quote or sign a report. */
export const SIGNER_NAME_MAX = 200;

/** A discount can't be more than what it comes off (it would make the total $0). */
export function discountTooLarge(discountCents: number, subtotalCents: number): string | null {
  return discountCents > subtotalCents ? "The discount can’t be more than the subtotal." : null;
}

export function lineDescriptionError(description: string): string | null {
  if (!description.trim()) return "Describe the work.";
  if (description.trim().length > LINE_DESCRIPTION_MAX)
    return `Keep the description under ${LINE_DESCRIPTION_MAX} characters.`;
  return null;
}

/** Job dates are 2000 through 2100: anything else is a typo (year 0001, 9999). */
export function jobDateError(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return "Pick a date.";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // The range first: Date.UTC reads years 0 to 99 as 1900 to 1999.
  if (y < 2000 || y > 2100) return "Pick a date between 2000 and 2100.";
  const real = new Date(Date.UTC(y, mo - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d)
    return "Pick a date.";
  return null;
}

/** A schedule link's date, or null to use today (a bad link shows today, not an error). */
export function scheduleDate(date: string | undefined | null): string | null {
  return date && !jobDateError(date) ? date : null;
}

/** Only web links: a review link goes into customer emails. */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * What to show for a database message: a malformed id (a link with a typo) reads as not found,
 * and everything raw (a duplicate key, a failed constraint, row security, a JWT) is put in plain
 * words by `friendlyError` (packages/core). Our own sentences pass through.
 */
export function friendlyDbError(message: string, notFound = "That wasn’t found."): string {
  if (/invalid input syntax for type uuid/i.test(message)) return notFound;
  return friendlyError(message);
}

/** The pages under /jobs/ that aren't a job id. */
const JOB_PAGES = new Set(["new", "reports"]);

/** Customer links carry a share link's token: 16 random bytes as hex. */
const SHARE_TOKEN = /^[0-9a-f]{32}$/;

/**
 * A link whose id or token can't exist: a job, customer, or conversation id that isn't a
 * UUID, or a customer page token in the wrong shape (break testing, 2026-10-20).
 */
export function malformedLink(path: string): boolean {
  const record = /^\/(jobs|customers|messages)\/([^/]+)$/.exec(path);
  if (record) {
    const [, kind, id] = record as unknown as [string, string, string];
    if (kind === "jobs" && JOB_PAGES.has(id)) return false;
    if (kind === "messages" && id === "new") return false;
    // Email Customers (2026-10-22).
    if (kind === "customers" && id === "email") return false;
    return !isUuid(id);
  }
  const share = /^\/(q|i|r|stop)\/([^/]+)(\/pdf)?$/.exec(path);
  return !!share && !SHARE_TOKEN.test(share[2]!);
}
