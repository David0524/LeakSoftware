import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
