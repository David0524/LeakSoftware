import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
  base64ToBytes,
  brandColorChoices,
  decodePng,
  inflate,
  logoPalette,
  suggestedBrandColor,
} from "../src";

type Px = [number, number, number, number];
/** An image as RGBA bytes from runs of [pixel, count]. */
function pixels(...runs: [Px, number][]): number[] {
  return runs.flatMap(([p, n]) => Array.from({ length: n }, () => p).flat());
}
const WHITE: Px = [255, 255, 255, 255];
const BLACK: Px = [10, 10, 10, 255];
const CLEAR: Px = [200, 30, 30, 0];
const GRAY: Px = [128, 128, 128, 255];
const BLUE: Px = [29, 95, 168, 255];
const ORANGE: Px = [217, 102, 31, 255];

describe("logoPalette", () => {
  it("picks the most used real color, skipping white, black, gray and clear pixels", () => {
    const img = pixels(
      [WHITE, 500],
      [BLACK, 300],
      [GRAY, 200],
      [CLEAR, 900],
      [BLUE, 60],
      [ORANGE, 40],
    );
    expect(logoPalette(img)).toEqual(["#1D5FA8", "#D9661F"]);
  });

  it("merges close shades (anti-aliased edges) into one color", () => {
    const img = pixels([BLUE, 50], [[35, 100, 175, 255], 30], [ORANGE, 20]);
    const [top, next] = logoPalette(img);
    expect(next).toBe("#D9661F");
    expect(top).toMatch(/^#(1[D-F]|2[0-1])6[0-2]A[A-C]$/);
  });

  it("drops colors under 3% of the colorful pixels and caps the count", () => {
    const img = pixels([BLUE, 98], [ORANGE, 2]);
    expect(logoPalette(img)).toEqual(["#1D5FA8"]);
    const many = pixels(
      [BLUE, 30],
      [ORANGE, 25],
      [[46, 125, 50, 255], 20],
      [[91, 58, 155, 255], 15],
      [[230, 200, 20, 255], 10],
    );
    expect(logoPalette(many, 3)).toHaveLength(3);
    expect(logoPalette(many)).toHaveLength(5);
  });

  it("gives nothing for a logo without color", () => {
    expect(logoPalette(pixels([WHITE, 100], [BLACK, 100], [GRAY, 50]))).toEqual([]);
    expect(logoPalette([])).toEqual([]);
    // A few stray colored pixels in a big black-and-white logo are noise, not a color.
    expect(logoPalette(pixels([BLACK, 2000], [BLUE, 3]))).toEqual([]);
  });
});

describe("brand color choices", () => {
  it("offers the logo's colors, then the presets, with the current color first when new", () => {
    expect(brandColorChoices([], null)).toEqual([...BRAND_COLOR_PRESETS]);
    const c = brandColorChoices(["#aa3311", "#12263a"], "#010203");
    expect(c.slice(0, 3)).toEqual(["#010203", "#AA3311", "#12263A"]);
    expect(new Set(c).size).toBe(c.length);
  });

  it("fills from a new logo always, from an old one only over the default", () => {
    expect(suggestedBrandColor(["#AA3311"], "#334455", true)).toBe("#AA3311");
    expect(suggestedBrandColor(["#AA3311"], "#334455", false)).toBeNull();
    expect(suggestedBrandColor(["#AA3311"], DEFAULT_BRAND_COLOR, false)).toBe("#AA3311");
    expect(suggestedBrandColor(["#AA3311"], "#aa3311", true)).toBeNull();
    expect(suggestedBrandColor([], DEFAULT_BRAND_COLOR, true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PNG decoding (Android reads its shrunk logo this way)
// ---------------------------------------------------------------------------

function chunk(name: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(name, "ascii"), data, Buffer.alloc(4)]);
}

/** A PNG with each row filtered by `filters[y % filters.length]`. */
function png(
  w: number,
  h: number,
  type: number,
  depth: number,
  rows: number[][],
  opts: { filters?: number[]; level?: number; plte?: number[]; trns?: number[] } = {},
): Uint8Array {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!;
  const bpp = Math.max(1, (channels * depth) >> 3);
  const filters = opts.filters ?? [0];
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const f = filters[y % filters.length]!;
    raw.push(f);
    const prev = rows[y - 1] ?? row.map(() => 0);
    row.forEach((v, x) => {
      const a = x >= bpp ? row[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][f]!;
      raw.push((v - pred) & 0xff);
    });
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth;
  ihdr[9] = type;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      ...(opts.plte ? [chunk("PLTE", Uint8Array.from(opts.plte))] : []),
      ...(opts.trns ? [chunk("tRNS", Uint8Array.from(opts.trns))] : []),
      chunk("IDAT", deflateSync(Buffer.from(raw), { level: opts.level ?? 6 })),
      chunk("IEND", new Uint8Array()),
    ]),
  );
}

describe("decodePng", () => {
  // A 7×5 RGBA picture with every filter type, so each predictor is exercised.
  const w = 7;
  const h = 5;
  const rgba = Array.from({ length: w * h * 4 }, (_, i) => (i * 37 + (i >> 3) * 11) & 0xff);
  const rows = Array.from({ length: h }, (_, y) => rgba.slice(y * w * 4, (y + 1) * w * 4));

  it("reads RGBA with every filter, stored, fixed and dynamic blocks", () => {
    for (const level of [0, 1, 9]) {
      const out = decodePng(png(w, h, 6, 8, rows, { filters: [0, 1, 2, 3, 4], level }));
      expect(out.width).toBe(w);
      expect(out.height).toBe(h);
      expect([...out.rgba]).toEqual(rgba);
    }
  });

  it("reads RGB, gray, gray with alpha, 16-bit and palettes", () => {
    const rgb = decodePng(png(2, 1, 2, 8, [[1, 2, 3, 250, 251, 252]], { filters: [4] }));
    expect([...rgb.rgba]).toEqual([1, 2, 3, 255, 250, 251, 252, 255]);
    const gray = decodePng(png(3, 1, 0, 8, [[0, 128, 255]]));
    expect([...gray.rgba]).toEqual([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
    const ga = decodePng(png(1, 1, 4, 8, [[90, 30]]));
    expect([...ga.rgba]).toEqual([90, 90, 90, 30]);
    const deep = decodePng(png(1, 1, 6, 16, [[200, 1, 100, 2, 50, 3, 255, 255]]));
    expect([...deep.rgba]).toEqual([200, 100, 50, 255]);
    // 2-bit palette: indexes 0..3 packed four to a byte; index 1 half transparent.
    const pal = decodePng(
      png(4, 1, 3, 2, [[0b00011011]], {
        plte: [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9],
        trns: [255, 128],
      }),
    );
    expect([...pal.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 9, 9, 9, 255]);
    const bw = decodePng(png(8, 1, 0, 1, [[0b10100000]]));
    expect(Array.from(bw.rgba).filter((_, i) => i % 4 === 0)).toEqual([255, 0, 255, 0, 0, 0, 0, 0]);
  });

  it("refuses what it can't read", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow();
    const broken = png(w, h, 6, 8, rows);
    expect(() => decodePng(broken.slice(0, broken.length - 30))).toThrow();
  });

  it("inflates a long repetitive stream and decodes base64", () => {
    const data = Buffer.from("logo ".repeat(5000));
    expect(Buffer.from(inflate(new Uint8Array(deflateSync(data)))).equals(data)).toBe(true);
    expect([...base64ToBytes(Buffer.from([0, 1, 2, 250, 255]).toString("base64"))]).toEqual([
      0, 1, 2, 250, 255,
    ]);
    expect([...base64ToBytes("\n")]).toEqual([]);
  });

  it("reads a logo's colors end to end", () => {
    const img = pixels([WHITE, 40], [BLUE, 16], [ORANGE, 8]);
    const out = decodePng(
      png(
        8,
        8,
        6,
        8,
        Array.from({ length: 8 }, (_, y) => img.slice(y * 32, y * 32 + 32)),
      ),
    );
    expect(logoPalette(out.rgba)).toEqual(["#1D5FA8", "#D9661F"]);
  });
});
