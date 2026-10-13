import { SIGNATURE_PURPOSE_LABELS } from "./report";

// Signatures captured on the phone (BUILD_PLAN 6.4). Drawn strokes are saved as a small SVG
// file next to the job's photos, so they work offline and look sharp in the PDF.

export type SignaturePurpose =
  "inspection_ack" | "work_authorization" | "quote_acceptance" | "completion";

/** One finger stroke: points in pad pixels. */
export type SignatureStroke = [number, number][];

const PURPOSES: SignaturePurpose[] = [
  "inspection_ack",
  "work_authorization",
  "quote_acceptance",
  "completion",
];

/**
 * The purposes the shop turned on in settings, in a fixed order. Quote acceptance needs a
 * quote (M8), so it is left out until quotes exist.
 */
export function enabledSignaturePurposes(
  settings: unknown,
): { value: SignaturePurpose; label: string }[] {
  const on = ((settings as { signature_purposes?: Record<string, boolean> } | null)
    ?.signature_purposes ?? { inspection_ack: true }) as Record<string, boolean>;
  return PURPOSES.filter((p) => on[p] && p !== "quote_acceptance").map((p) => ({
    value: p,
    label: SIGNATURE_PURPOSE_LABELS[p] ?? p,
  }));
}

/** media/{company_id}/{job_id}/signature-{id}.svg (immutable, like photos). */
export function signatureStoragePath(
  companyId: string,
  jobId: string,
  signatureId: string,
): string {
  return `${companyId}/${jobId}/signature-${signatureId}.svg`;
}

/** Total drawn length in pixels; too little ink is a tap, not a signature. */
export function inkLength(strokes: SignatureStroke[]): number {
  let total = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) {
      total += Math.hypot(s[i]![0] - s[i - 1]![0], s[i]![1] - s[i - 1]![1]);
    }
  }
  return total;
}

export const MIN_INK = 40;

/** SVG path data for one stroke (a dot when it has a single point). */
export function strokePath(stroke: SignatureStroke): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  if (stroke.length === 0) return "";
  const [x0, y0] = stroke[0]!;
  if (stroke.length === 1) return `M${r(x0)} ${r(y0)}l0.1 0`;
  return (
    `M${r(x0)} ${r(y0)}` +
    stroke
      .slice(1)
      .map(([x, y]) => `L${r(x)} ${r(y)}`)
      .join("")
  );
}

/**
 * The signature as a standalone SVG, cropped to the ink with a small margin. Dark ink on a
 * transparent background, the way it would look signed on paper.
 */
export function signatureSvg(strokes: SignatureStroke[], strokeWidth = 3): string {
  const points = strokes.flat();
  if (points.length === 0) throw new Error("Nothing was drawn.");
  const pad = strokeWidth * 2;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) + pad - minX;
  const h = Math.max(...ys) + pad - minY;
  const view = [minX, minY, w, h].map((n) => Math.round(n * 10) / 10).join(" ");
  const paths = strokes
    .filter((s) => s.length)
    .map((s) => `<path d="${strokePath(s)}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="${Math.round(w)}" height="${Math.round(h)}">` +
    `<g fill="none" stroke="#111111" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`
  );
}

/** What the customer is agreeing to, shown above the box they sign in. */
export function signatureStatement(
  purpose: SignaturePurpose,
  shop: string,
  address: string | null,
): string {
  const at = address ? ` at ${address}` : "";
  switch (purpose) {
    case "inspection_ack":
      return `I confirm ${shop} inspected the pool${at} today and explained what they found.`;
    case "work_authorization":
      return `I authorize ${shop} to do the work we agreed on${at}.`;
    case "quote_acceptance":
      return `I accept ${shop}’s quote for the work${at}.`;
    case "completion":
      return `I confirm ${shop} finished the work${at} today.`;
  }
}
