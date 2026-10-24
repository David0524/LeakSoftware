/**
 * An invoice line's quantity as typed ("2.5", "2,5", blank for 1), or null when it isn't a
 * quantity like 1 or 2.5: more than 0, at most two decimals, and a real number ("1e309" is
 * too big to be one).
 */
export function parseLineQuantity(input: string): number | null {
  const quantity = Number(input.replace(",", ".") || "1");
  if (!Number.isFinite(quantity) || !(quantity > 0)) return null;
  // At most two decimals. Most two-decimal numbers aren't exact in floating point (1.1 × 100
  // is 110.00000000000001, 1.15 × 100 is 114.99999999999999), so a whole number of hundredths
  // is one within a millionth; 1.005 is half a hundredth off and stays refused.
  const hundredths = Math.round(quantity * 100);
  return Math.abs(quantity * 100 - hundredths) < 1e-6 ? hundredths / 100 : null;
}
