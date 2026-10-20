// The website's checks for edge inputs (apps/web/src/lib/limits.ts, break testing 2026-10-20),
// the same rules and words on the phone. Pure, so they're tested (test/limits.test.ts).

/** Longest quote or invoice line description. */
export const LINE_DESCRIPTION_MAX = 500;
/** Longest name typed to accept a quote or sign a report. */
export const SIGNER_NAME_MAX = 200;
/** Longest price book item name and unit. */
export const PRICE_ITEM_NAME_MAX = 200;
export const PRICE_ITEM_UNIT_MAX = 40;

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

/** A signer's name that's too long, as the website words it. */
export function signerNameError(name: string): string | null {
  return name.trim().length > SIGNER_NAME_MAX
    ? `Keep the name under ${SIGNER_NAME_MAX} characters.`
    : null;
}

/** A price book item's name and unit, as the website checks them. */
export function priceItemErrors(name: string, unit: string): { name?: string; unit?: string } {
  const e: { name?: string; unit?: string } = {};
  if (name.trim().length > PRICE_ITEM_NAME_MAX)
    e.name = `Keep the name under ${PRICE_ITEM_NAME_MAX} characters.`;
  if (unit.trim().length > PRICE_ITEM_UNIT_MAX) e.unit = "Keep the unit short, like each or hour.";
  return e;
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

/** Only web links: a review link goes into customer emails. */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** The review link's error, as the website words it. */
export const REVIEW_URL_ERROR = "Enter a web address that starts with https://.";
