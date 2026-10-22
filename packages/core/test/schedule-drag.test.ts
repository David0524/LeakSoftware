import { describe, expect, it } from "vitest";
import { SCHEDULE_DRAG } from "../src";

describe("SCHEDULE_DRAG", () => {
  it("rests on the grip briefly, well short of the tile's hold", () => {
    expect(SCHEDULE_DRAG).toEqual({
      gripDwellMs: 130,
      holdMs: 400,
      slopPt: 8,
      scrollSettleMs: 100,
    });
    expect(SCHEDULE_DRAG.gripDwellMs).toBeGreaterThanOrEqual(120);
    expect(SCHEDULE_DRAG.gripDwellMs).toBeLessThanOrEqual(150);
    expect(SCHEDULE_DRAG.gripDwellMs).toBeLessThan(SCHEDULE_DRAG.holdMs);
  });
});
