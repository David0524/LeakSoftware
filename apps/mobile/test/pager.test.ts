import { describe, expect, it } from "vitest";
import { messageKind, messageRoute } from "../src/lib/heroMessage";
import { pagerFollow, pagerStep, rubberBand } from "../src/lib/pager";
import {
  SWIPE_TAP_QUIET_MS,
  swipeEnded,
  swipeStarted,
  swipeTapBlocked,
  unlessSwiping,
} from "../src/ui/swipeQuiet";

// Schedule's pages follow the finger, a swipe is never a tap, and Message on a teammate's stop
// goes to that customer (owner, 2026-10-21).

describe("a page that follows the finger", () => {
  it("moves 1:1, and gives like a rubber band where there's no page", () => {
    expect(pagerFollow(-120, 400, true, true)).toBe(-120);
    const band = pagerFollow(-120, 400, true, false);
    expect(band).toBeLessThan(0);
    expect(band).toBeGreaterThan(-120);
    expect(rubberBand(-4000, 400)).toBeGreaterThan(-400);
  });

  it("turns past a third on a slow drag, or on a flick the way the finger went", () => {
    expect(pagerStep(-200, 0, 400, true, true)).toBe(1);
    expect(pagerStep(150, 0, 400, true, true)).toBe(-1);
    expect(pagerStep(-133, 0, 400, true, true)).toBe(0);
    expect(pagerStep(-134, 0, 400, true, true)).toBe(1);
    expect(pagerStep(-30, -800, 400, true, true)).toBe(1);
    expect(pagerStep(-30, 800, 400, true, true)).toBe(0);
    expect(pagerStep(-20, -900, 400, true, true)).toBe(0);
    expect(pagerStep(-300, 0, 400, true, false)).toBe(0);
    expect(pagerStep(300, 0, 400, false, true)).toBe(0);
  });
});

describe("a swipe is not a tap", () => {
  it("blocks presses while a row is dragged sideways and just after", () => {
    let pressed = 0;
    const press = unlessSwiping(() => (pressed += 1));
    swipeStarted();
    press();
    expect(pressed).toBe(0);
    const end = Date.now();
    swipeEnded(end);
    expect(swipeTapBlocked(end + SWIPE_TAP_QUIET_MS - 1)).toBe(true);
    expect(swipeTapBlocked(end + SWIPE_TAP_QUIET_MS)).toBe(false);
    expect(unlessSwiping(undefined)).toBeUndefined();
  });
});

describe("Message on a teammate's stop", () => {
  it("is a blank text to that customer: their conversation, or New Message to them", () => {
    const kind = messageKind({
      mine: false,
      moment: "ahead",
      onMyWayAt: null,
      today: "2026-10-21",
      timeZone: "America/Phoenix",
    });
    expect(kind).toBe("blank");
    expect(messageRoute({ conversationId: "c9", customerId: "u1", jobId: "j1" })).toBe(
      "/messages/c9",
    );
    expect(messageRoute({ customerId: "u1", jobId: "j1" })).toBe(
      "/messages/new?customer=u1&job=j1",
    );
  });
});
