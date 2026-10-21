/**
 * An invoice line's quantity as typed ("2.5", "2,5", blank for 1), or null when it isn't a
 * quantity like 1 or 2.5: more than 0, at most two decimals, and a real number ("1e309" is
 * too big to be one).
 */
export function parseLineQuantity(input: string): number | null {
  const quantity = Number(input.replace(",", ".") || "1");
  if (!Number.isFinite(quantity) || !(quantity > 0)) return null;
  return Math.round(quantity * 100) === quantity * 100 ? quantity : null;
}
