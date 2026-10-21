/** Money is stored and calculated as integer cents. Convert only at the edges. */

export type Cents = number;

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Expected integer cents, got ${value}`);
  }
}

/** Format cents as US dollars, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: Cents, currency = "USD"): string {
  assertCents(cents);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** The largest amount a person can type: $9,999,999.99 (it fits the database's integer cents). */
export const MAX_ENTERED_CENTS: Cents = 999_999_999;

/**
 * Parse a user-entered dollar amount ("1,234.5", "$12") into cents. Returns null if invalid.
 * Commas only group thousands, so "1,5" (a decimal comma) is refused rather than read as $15.
 * Amounts over MAX_ENTERED_CENTS are refused.
 */
export function parseDollars(input: string): Cents | null {
  const trimmed = input.replace(/[$\s]/g, "");
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{0,2})?$/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/,/g, "");
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (cents > MAX_ENTERED_CENTS) return null;
  return negative ? -cents : cents;
}
