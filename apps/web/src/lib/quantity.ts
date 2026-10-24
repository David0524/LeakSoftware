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
  // At most two decimals. Most two-decimal numbers aren't exact in floating point (1.1 × 100
  // is 110.00000000000001, 1.15 × 100 is 114.99999999999999), so a whole number of hundredths
  // is one within a millionth; 1.005 is half a hundredth off and stays refused.
  const hundredths = Math.round(quantity * 100);
  return Math.abs(quantity * 100 - hundredths) < 1e-6 ? hundredths / 100 : null;
}
