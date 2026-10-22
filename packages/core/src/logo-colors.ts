// The shop's colors from its logo (owner, 2026-10-22: "You should auto fill company colors
// based on the logo, and give a picker. A hex code alone is not useful."). No I/O: each app
// decodes the logo to RGBA pixels its own way (a canvas on the website, CGImage on the iPhone,
// decodePng below on Android) and passes them here. Swift port: SundeckCore/LogoColors.swift.

/** The default brand color of a new shop (company.brand_primary's column default). */
export const DEFAULT_BRAND_COLOR = "#12263A";

/** Swatches offered beside the logo's own colors: dark enough for white text, except none. */
export const BRAND_COLOR_PRESETS: readonly string[] = [
  "#12263A",
  "#1D5FA8",
  "#0F7C80",
  "#2E7D32",
  "#B3261E",
  "#C2410C",
  "#5B3A9B",
  "#3C4450",
];

const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
/** Rounded integer average, the same in Swift: floor((2·sum + n) / 2n). */
const avg = (sum: number, n: number) => Math.floor((2 * sum + n) / (2 * n));

interface Cluster {
  n: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The logo's main colors, most used first, as #RRGGBB (at most `max`). Pixels count only when
 * they are mostly opaque and colorful: transparent, near-white, near-black and grayish pixels
 * (backgrounds, outlines, lettering) are left out. Close shades are merged into one color, and
 * colors under 3% of the colorful pixels are dropped as edge noise. A logo with no real color
 * (black on white) gives none, so the shop's color is left alone.
 */
export function logoPalette(rgba: ArrayLike<number>, max = 5): string[] {
  const buckets = new Map<number, Cluster>();
  let opaque = 0;
  let colorful = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 128) continue;
    opaque++;
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (lo >= 225) continue; // near white
    if (hi <= 50) continue; // near black
    if (hi - lo < 40 || (hi - lo) * 100 < 25 * hi) continue; // grayish
    colorful++;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = buckets.get(key);
    if (c) {
      c.n++;
      c.r += r;
      c.g += g;
      c.b += b;
    } else buckets.set(key, { n: 1, r, g, b });
  }
  if (colorful < 4 || colorful * 200 < opaque) return [];

  const sorted = [...buckets.entries()].sort((x, y) => y[1].n - x[1].n || x[0] - y[0]);
  const clusters: Cluster[] = [];
  for (const [, c] of sorted) {
    const cr = avg(c.r, c.n);
    const cg = avg(c.g, c.n);
    const cb = avg(c.b, c.n);
    let best = -1;
    let bestD = 48 * 48 + 1;
    clusters.forEach((k, i) => {
      const d = (avg(k.r, k.n) - cr) ** 2 + (avg(k.g, k.n) - cg) ** 2 + (avg(k.b, k.n) - cb) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const into = clusters[best];
    if (into) {
      into.n += c.n;
      into.r += c.r;
      into.g += c.g;
      into.b += c.b;
    } else clusters.push({ ...c });
  }
  return clusters
    .map((k, i) => ({ k, i }))
    .sort((x, y) => y.k.n - x.k.n || x.i - y.i)
    .filter(({ k }, i) => i === 0 || k.n * 100 >= colorful * 3)
    .slice(0, Math.max(0, max))
    .map(({ k }) => `#${hex2(avg(k.r, k.n))}${hex2(avg(k.g, k.n))}${hex2(avg(k.b, k.n))}`);
}

/**
 * The swatches to offer: the logo's colors first, then the presets, without repeats, and the
 * current color first of all when it's neither (so the owner always sees what's set).
 */
export function brandColorChoices(logo: readonly string[], current?: string | null): string[] {
  const out: string[] = [];
  const add = (c: string | null | undefined) => {
    const v = c?.toUpperCase();
    if (v && /^#[0-9A-F]{6}$/.test(v) && !out.includes(v)) out.push(v);
  };
  const known = [...logo, ...BRAND_COLOR_PRESETS].map((c) => c.toUpperCase());
  if (current && !known.includes(current.toUpperCase())) add(current);
  logo.forEach(add);
  BRAND_COLOR_PRESETS.forEach(add);
  return out;
}

/**
 * What the brand color becomes when a logo's colors are known. A new logo always fills it
 * ("Color picked from your logo."); a logo already there fills it only while the color is
 * still the default, so a color the owner chose by hand stays.
 */
export function suggestedBrandColor(
  palette: readonly string[],
  current: string | null | undefined,
  newLogo: boolean,
): string | null {
  const top = palette[0];
  if (!top) return null;
  const now = (current ?? "").trim().toUpperCase();
  if (now === top) return null;
  if (newLogo || now === "" || now === DEFAULT_BRAND_COLOR) return top;
  return null;
}
