import { describe, expect, it, vi } from "vitest";
import {
  LONG_PRESS_MS,
  createLongPress,
  hasLock,
  menuIndex,
  opensMenu,
  placeMenu,
  toggleLock,
  typeAhead,
  visibleEntries,
} from "@/lib/row-menu";

// Swipe actions and touch-and-hold menus on every list (gestures.md section 12): the rules the
// shared row menu follows.

describe("visibleEntries", () => {
  it("hides the actions a row can't take, and keeps separators only between groups", () => {
    const open = { label: "Open" };
    const call = { label: "Call" };
    const del = { label: "Delete…", destructive: true };
    expect(
      visibleEntries(["separator", open, null, false, "", 0, undefined, "separator", del]),
    ).toEqual([open, "separator", del]);
    expect(visibleEntries([open, "separator", "separator", call])).toEqual([
      open,
      "separator",
      call,
    ]);
    expect(visibleEntries([open, "separator", false && del])).toEqual([open]);
    expect(visibleEntries([null, "separator"])).toEqual([]);
  });
});

describe("placeMenu", () => {
  const viewport = { width: 400, height: 800 };
  const size = { width: 240, height: 300 };
  it("opens below and to the right of the point", () => {
    expect(placeMenu({ x: 20, y: 40 }, size, viewport)).toEqual({ left: 20, top: 40 });
  });
  it("flips left and up near the window's edges", () => {
    expect(placeMenu({ x: 300, y: 700 }, size, viewport)).toEqual({ left: 60, top: 400 });
  });
  it("stays inside the window when it fits neither way", () => {
    const p = placeMenu({ x: 120, y: 200 }, { width: 380, height: 900 }, viewport);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 380).toBeLessThanOrEqual(400 - 8 + 0.5);
    expect(p.top).toBe(8);
  });
});

describe("menuIndex", () => {
  it("moves with the arrow keys, wrapping, and jumps with Home and End", () => {
    expect(menuIndex("ArrowDown", -1, 4)).toBe(0);
    expect(menuIndex("ArrowDown", 3, 4)).toBe(0);
    expect(menuIndex("ArrowUp", 0, 4)).toBe(3);
    expect(menuIndex("ArrowUp", -1, 4)).toBe(3);
    expect(menuIndex("Home", 2, 4)).toBe(0);
    expect(menuIndex("End", 0, 4)).toBe(3);
  });
  it("leaves other keys alone", () => {
    expect(menuIndex("Enter", 1, 4)).toBeNull();
    expect(menuIndex("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("typeAhead", () => {
  const labels = ["Open", "Call", "Message", "Copy Job Number"];
  it("finds the next item starting with the letter, after the current one", () => {
    expect(typeAhead(labels, "c", -1)).toBe(1);
    expect(typeAhead(labels, "C", 1)).toBe(3);
    expect(typeAhead(labels, "c", 3)).toBe(1);
    expect(typeAhead(labels, "z", 0)).toBe(-1);
  });
});

describe("opensMenu", () => {
  it("is the menu key or Shift+F10", () => {
    expect(opensMenu({ key: "ContextMenu", shiftKey: false })).toBe(true);
    expect(opensMenu({ key: "F10", shiftKey: true })).toBe(true);
    expect(opensMenu({ key: "F10", shiftKey: false })).toBe(false);
    expect(opensMenu({ key: "Enter", shiftKey: false })).toBe(false);
  });
});

describe("createLongPress", () => {
  it("opens after half a second held still, and the lift that ends it isn't a tap", () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    const press = createLongPress({ onPress });
    press.down(100, 100);
    press.move(104, 103);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPress).toHaveBeenCalledWith({ x: 104, y: 103 });
    expect(press.up()).toBe(true);
    vi.useRealTimers();
  });
  it("is a scroll or a swipe once the finger moves past 10 px", () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    const press = createLongPress({ onPress });
    press.down(100, 100);
    press.move(100, 112);
    vi.advanceTimersByTime(1000);
    expect(onPress).not.toHaveBeenCalled();
    expect(press.up()).toBe(false);
    vi.useRealTimers();
  });
  it("is a tap when lifted early", () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    const press = createLongPress({ onPress });
    press.down(10, 10);
    vi.advanceTimersByTime(200);
    expect(press.waiting).toBe(true);
    expect(press.up()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("toggleLock", () => {
  it("turns one part on or off and keeps the other", () => {
    expect(toggleLock("none", "day")).toBe("day");
    expect(toggleLock("day", "time")).toBe("both");
    expect(toggleLock("both", "day")).toBe("time");
    expect(toggleLock("time", "time")).toBe("none");
    expect(hasLock("both", "time")).toBe(true);
    expect(hasLock("day", "time")).toBe(false);
  });
});
