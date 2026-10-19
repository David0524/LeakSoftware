// Company settings helpers: colors, rates, and config keys (no I/O).

import type { TestField } from "./inspection";
import { formatCents } from "./money";

// ---------------------------------------------------------------------------
// Colors (WCAG 2 contrast)
// ---------------------------------------------------------------------------

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio between two #RRGGBB colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** WCAG AA for normal text is 4.5:1; large text and graphics 3:1. */
export function contrastGrade(ratio: number): "AA" | "AA large" | "Too low" {
  return ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "Too low";
}

// ---------------------------------------------------------------------------
// Rates: percentages are stored as basis points (1% = 100 bps)
// ---------------------------------------------------------------------------

export function percentToBps(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Card fee (owner, 2026-10-19: "Pass on credit card fee to customer setting")
// ---------------------------------------------------------------------------

/** Card surcharges are capped at 3% in the US (card network rules). */
export const CARD_FEE_MAX_BPS = 300;

/** The shop's card fee in basis points: 0 when off; settings.card_fee_bps, at most 3%. */
export function cardFeeBps(settings: unknown): number {
  const v = Number((settings as { card_fee_bps?: unknown } | null)?.card_fee_bps);
  return Number.isInteger(v) && v > 0 ? Math.min(v, CARD_FEE_MAX_BPS) : 0;
}

/** The fee on an amount paid by card, rounded to the cent. */
export function cardFeeCents(amountCents: number, bps: number): number {
  return bps > 0 ? Math.round((amountCents * bps) / 10_000) : 0;
}

/**
 * The two pay buttons when the shop passes on the card fee, and the line under them:
 * "Pay $657.30 by Bank" / "Pay $677.02 by Card". `what` follows the amount (" Deposit").
 */
export function cardFeeChoice(
  amountCents: number,
  bps: number,
  what = "",
): { feeCents: number; bankLabel: string; cardLabel: string; note: string } {
  const feeCents = cardFeeCents(amountCents, bps);
  return {
    feeCents,
    bankLabel: `Pay ${formatCents(amountCents)}${what} by Bank`,
    cardLabel: `Pay ${formatCents(amountCents + feeCents)}${what} by Card`,
    note: `Paying by card adds a ${bpsToPercent(bps)}% card fee (${formatCents(feeCents)}). Bank account payments have no fee and take a few business days to clear. Payments are handled by Stripe.`,
  };
}

// ---------------------------------------------------------------------------
// Config keys
// ---------------------------------------------------------------------------

/** A stable key from a display name, unique among `taken`: "Return Line" -> "return_line". */
export function configKey(name: string, taken: Iterable<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "k_$1") || "item";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}

// ---------------------------------------------------------------------------
// Custom test fields, edited as one line per field:
//   Label                      text
//   Label (unit): number       number with a unit
//   Label: notes               long text
//   Label: Option A / Option B a choice
// A trailing * makes the field required.
// ---------------------------------------------------------------------------

export function parseFieldLines(text: string): { fields: TestField[]; errors: string[] } {
  const fields: TestField[] = [];
  const errors: string[] = [];
  const keys: string[] = [];
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const required = line.endsWith("*");
      const body = required ? line.slice(0, -1).trim() : line;
      const [head = "", spec = ""] = body.split(/:(.*)/s).map((s) => s.trim());
      const unitMatch = head.match(/^(.*?)\s*\(([^)]+)\)$/);
      const label = (unitMatch ? unitMatch[1]! : head).trim();
      if (!label) {
        errors.push(`Line ${i + 1}: give the field a name.`);
        return;
      }
      const key = configKey(label, keys);
      keys.push(key);
      const field: TestField = { key, label, type: "text" };
      if (unitMatch) field.unit = unitMatch[2]!.trim();
      const s = spec.toLowerCase();
      if (s === "number") field.type = "number";
      else if (s === "notes") field.type = "textarea";
      else if (spec.includes("/")) {
        field.type = "select";
        field.options = spec
          .split("/")
          .map((o) => o.trim())
          .filter(Boolean);
        if (field.options.length < 2) errors.push(`Line ${i + 1}: list at least two choices.`);
      } else if (s && s !== "text") {
        errors.push(`Line ${i + 1}: use number, notes, or choices separated by “/”.`);
      }
      if (field.unit && field.type === "text") field.type = "number";
      if (required) field.required = true;
      fields.push(field);
    });
  if (fields.length === 0 && errors.length === 0) errors.push("Add at least one field.");
  return { fields, errors };
}

export function formatFieldLines(fields: TestField[]): string {
  return fields
    .map((f) => {
      const head = f.unit ? `${f.label} (${f.unit})` : f.label;
      const spec =
        f.type === "select"
          ? `: ${(f.options ?? []).join(" / ")}`
          : f.type === "textarea"
            ? ": notes"
            : f.type === "number" && !f.unit
              ? ": number"
              : "";
      return `${head}${spec}${f.required ? " *" : ""}`;
    })
    .join("\n");
}
