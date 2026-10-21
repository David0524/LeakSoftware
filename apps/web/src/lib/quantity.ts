/**
 * A line's quantity as typed ("1", "2.5", "2,5"): more than 0, under 100,000, and at most two
 * decimals; blank is 1. Null when it isn't one (letters, "1e309", Infinity, negatives).
 */
export function parseQuantity(input: string): number | null {
  const typed = input.trim().replace(",", ".");
  if (!typed) return 1;
  if (!/^\d*\.?\d+$/.test(typed)) return null;
  const quantity = Number(typed);
  if (!Number.isFinite(quantity) || !(quantity > 0) || quantity >= 100_000) return null;
  return Math.round(quantity * 100) === quantity * 100 ? quantity : null;
}
