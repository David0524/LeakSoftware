import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tokens } from "../src/generated";
// @ts-expect-error -- plain JS build script without types
import { iosFonts, render, swiftPath } from "../scripts/build.mjs";

const pkg = join(import.meta.dirname, "..");

describe("generated tokens", () => {
  it("match brand/tokens.json (run `pnpm tokens` if this fails)", () => {
    const { ts, css, swift } = render();
    expect(readFileSync(join(pkg, "src", "generated.ts"), "utf8")).toBe(ts);
    expect(readFileSync(join(pkg, "tokens.css"), "utf8")).toBe(css);
    expect(readFileSync(swiftPath, "utf8")).toBe(swift);
  });

  it("copy the brand fonts into the iPhone app (run `pnpm tokens` if this fails)", () => {
    for (const f of iosFonts as { from: string; to: string }[])
      expect(readFileSync(f.to).equals(readFileSync(f.from)), f.to).toBe(true);
  });
});

describe("tech colors", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const { tech, role } = tokens.color;

  it("have the same ten keys in light and dark", () => {
    const keys = ["blue", "green", "orange", "purple", "pink", "teal", "red", "olive", "brown"];
    expect(Object.keys(tech.light)).toEqual([...keys, "slate"]);
    expect(Object.keys(tech.dark)).toEqual(Object.keys(tech.light));
  });

  it("keep at least 3:1 against the surface in both appearances", () => {
    for (const [k, v] of Object.entries(tech.light))
      expect(contrast(v, role.light.surface), k).toBeGreaterThanOrEqual(3);
    for (const [k, v] of Object.entries(tech.dark))
      expect(contrast(v, role.dark.surface), k).toBeGreaterThanOrEqual(3);
  });
});
