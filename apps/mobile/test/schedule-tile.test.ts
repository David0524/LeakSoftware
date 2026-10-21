import { describe, expect, it } from "vitest";
import {
  driveChipMinutes,
  driveFromOffMap,
  driveHomeLine,
  driveSpoken,
} from "../src/lib/scheduleTile";

// Schedule tiles: the drive as a chip on the stop, the drive home as the block's last line
// (docs/design/2026-10-21-schedule-tile.md).

describe("schedule tile drive chip", () => {
  it("shows the drive in, rounded, and nothing when it isn't known", () => {
    expect(driveChipMinutes(23, false)).toBe(23);
    expect(driveChipMinutes(13.6, false)).toBe(14);
    expect(driveChipMinutes(0, false)).toBe(0);
    expect(driveChipMinutes(null, false)).toBeNull();
    // Not on the map: drive times leave it out, so no chip.
    expect(driveChipMinutes(12, true)).toBeNull();
  });

  it("shows nothing when the drive starts off the map (the stop before, or the start)", () => {
    expect(driveChipMinutes(12, false, true)).toBeNull();
    // Stop 2 is off the map: no chip on stop 2 (its own) or stop 3 (the drive starts there).
    const offMap = [false, true, false];
    const chips = [10, 12, 14].map((leg, i) =>
      driveChipMinutes(leg, offMap[i]!, driveFromOffMap(i, offMap, true)),
    );
    expect(chips).toEqual([10, null, null]);
    // The shop (or home) has no map point: no chip on the first stop.
    expect(driveFromOffMap(0, offMap, false)).toBe(true);
    expect(driveFromOffMap(0, offMap, true)).toBe(false);
  });

  it("is read as a minute drive", () => {
    expect(driveSpoken(23)).toBe("23 minute drive");
  });

  it("puts the drive home on the block's last line, or nothing", () => {
    expect(driveHomeLine(27, "shop")).toBe("27 min back to the shop");
    expect(driveHomeLine(72, "home")).toBe("1 hr 12 min back home");
    expect(driveHomeLine(null, "shop")).toBeNull();
    expect(driveHomeLine(0, "shop")).toBeNull();
  });
});
