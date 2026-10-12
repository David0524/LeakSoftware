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

/** Parse a user-entered dollar amount ("1,234.5", "$12") into cents. Returns null if invalid. */
export function parseDollars(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}
