import { describe, expect, it } from "vitest";
import { WAVE_HEIGHT, waterPath } from "../src/lib/poolWave";
import { firstDownloadStep } from "../src/state/firstDownload";

// Getting Ready, the first download's pool that fills (owner, 2026-10-20; gestures spec
// section 11).

/** The y values of a path's points after the first two (the surface). */
const surface = (d: string) =>
  [...d.matchAll(/L([\d.]+) ([\d.-]+)/g)].slice(1, -1).map((m) => Number(m[2]));

describe("the pool's water", () => {
  it("fills from the bottom to the level, with a wave on its surface", () => {
    const d = waterPath(220, 120, 0.5, 0.25);
    expect(d.startsWith("M0 120")).toBe(true);
    expect(d.endsWith("L220 120 Z")).toBe(true);
    const ys = surface(d);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(60 - WAVE_HEIGHT - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(60 + WAVE_HEIGHT + 0.01);
    expect(new Set(ys.map((y) => y.toFixed(1))).size).toBeGreaterThan(1);
  });

  it("is flat under Reduce Motion, nothing when empty, and never past the top", () => {
    expect(new Set(surface(waterPath(220, 120, 0.25, 0.7, 0))).size).toBe(1);
    expect(waterPath(220, 120, 0, 0.5)).toBe("");
    expect(Math.min(...surface(waterPath(220, 120, 1.5, 0.5, 0)))).toBe(0);
  });
});

describe("finishing the first download", () => {
  it("shows the check once the download is done, then opens; a set-up phone opens at once", () => {
    expect(firstDownloadStep("downloading", false)).toBe("downloading");
    expect(firstDownloadStep("downloading", true)).toBe("finishing");
    expect(firstDownloadStep("finishing", true)).toBe("finishing");
    expect(firstDownloadStep("open", true)).toBe("open");
    // Signed out and in again: downloading again.
    expect(firstDownloadStep("open", false)).toBe("downloading");
  });
});
