import { describe, expect, it } from "vitest";
import {
  CANCELED,
  LAST,
  PAST_DAY,
  STARTED,
  autoScrollStep,
  clampScroll,
  insertIndex,
  planDrop,
  scrolled,
  zoneAt,
  type DragItem,
  type DropZone,
  type Slot,
} from "../src/lib/scheduleDrag";

// Schedule drag and drop (owner, 2026-10-20: "bring back drag/drop on mobile").

const today = "2026-10-20";
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const route = (tech: string, date: string, y: number, open = date >= today): DropZone => ({
  kind: "route",
  id: `${tech}|${date}`,
  tech,
  date,
  open,
  rect: rect(16, y, 360, 400),
});
const day = (date: string, x: number): DropZone => ({
  kind: "day",
  id: `day:${date}`,
  date,
  rect: rect(x, 100, 48, 56),
});
const tray: DropZone = { kind: "tray", id: "tray", rect: rect(16, 170, 360, 120) };

const fromRoute = (status = "scheduled", index = 1): DragItem => ({
  id: "b",
  status,
  from: { kind: "route", route: `ann|${today}`, tech: "ann", date: today, index },
});
const fromTray: DragItem = { id: "t", status: "unscheduled", from: { kind: "tray" } };

describe("zoneAt", () => {
  const zones = [route("ann", today, 300), day("2026-10-21", 70), tray];
  it("finds the zone under the finger", () => {
    expect(zoneAt(zones, 90, 120)?.id).toBe("day:2026-10-21");
    expect(zoneAt(zones, 100, 200)?.id).toBe("tray");
    expect(zoneAt(zones, 100, 500)?.id).toBe(`ann|${today}`);
    expect(zoneAt(zones, 5, 500)).toBeNull();
  });
  it("prefers the smallest of overlapping zones", () => {
    const inner = { ...day("2026-10-22", 40), rect: rect(40, 350, 40, 40) };
    expect(zoneAt([route("ann", today, 300), inner], 50, 360)?.id).toBe("day:2026-10-22");
  });
  it("follows the page as it scrolls", () => {
    expect(scrolled(rect(0, 500, 10, 10), 120).y).toBe(380);
    expect(scrolled(rect(0, 500, 10, 10), 0).y).toBe(500);
  });
});

describe("insertIndex", () => {
  const r = `ann|${today}`;
  const slots: Slot[] = [
    { id: "a", route: r, rect: rect(16, 400, 360, 100) },
    { id: "b", route: r, rect: rect(16, 520, 360, 100) },
    { id: "c", route: r, rect: rect(16, 640, 360, 100) },
    { id: "x", route: "bob|2026-10-20", rect: rect(16, 900, 360, 100) },
  ];
  it("counts the other stops above the finger's middle", () => {
    expect(insertIndex(slots, r, "z", 300)).toBe(0);
    expect(insertIndex(slots, r, "z", 460)).toBe(1);
    expect(insertIndex(slots, r, "z", 800)).toBe(3);
  });
  it("leaves out the stop being dragged and other routes", () => {
    expect(insertIndex(slots, r, "a", 800)).toBe(2);
    expect(insertIndex(slots, r, "b", 575)).toBe(1);
  });
});

describe("planDrop", () => {
  const base = { index: 0, today, fallbackTech: "ann" };
  it("moves to a place in a tech's day, or another tech's", () => {
    expect(
      planDrop({ ...base, item: fromRoute(), zone: route("bob", today, 0), index: 2 }),
    ).toEqual({ kind: "move", tech: "bob", date: today, index: 2 });
    expect(
      planDrop({ ...base, item: fromRoute(), zone: route("ann", today, 0), index: 0 }),
    ).toEqual({ kind: "move", tech: "ann", date: today, index: 0 });
  });
  it("does nothing where it already is, or nowhere", () => {
    expect(
      planDrop({ ...base, item: fromRoute(), zone: route("ann", today, 0), index: 1 }),
    ).toEqual({ kind: "none" });
    expect(planDrop({ ...base, item: fromRoute(), zone: null })).toEqual({ kind: "none" });
    expect(planDrop({ ...base, item: fromTray, zone: tray })).toEqual({ kind: "none" });
    expect(planDrop({ ...base, item: fromRoute(), zone: day(today, 0) })).toEqual({
      kind: "none",
    });
  });
  it("refuses past days", () => {
    const past = route("ann", "2026-10-19", 0);
    expect(planDrop({ ...base, item: fromRoute(), zone: past })).toEqual({
      kind: "refuse",
      error: PAST_DAY,
    });
    expect(planDrop({ ...base, item: fromRoute(), zone: day("2026-10-19", 0) })).toEqual({
      kind: "refuse",
      error: PAST_DAY,
    });
  });
  it("goes last on a day in the week strip, with the same tech", () => {
    expect(planDrop({ ...base, item: fromRoute(), zone: day("2026-10-23", 0) })).toEqual({
      kind: "move",
      tech: "ann",
      date: "2026-10-23",
      index: LAST,
    });
    expect(planDrop({ ...base, item: fromTray, zone: day("2026-10-23", 0) })).toEqual({
      kind: "move",
      tech: "ann",
      date: "2026-10-23",
      index: LAST,
    });
    expect(
      planDrop({ ...base, fallbackTech: null, item: fromTray, zone: day("2026-10-23", 0) }),
    ).toEqual({ kind: "move", tech: null, date: "2026-10-23", index: LAST });
  });
  it("sends only an unstarted job back to Needs a Time", () => {
    expect(planDrop({ ...base, item: fromRoute(), zone: tray })).toEqual({ kind: "tray" });
    expect(planDrop({ ...base, item: fromRoute("in_progress"), zone: tray })).toEqual({
      kind: "refuse",
      error: STARTED,
    });
    expect(planDrop({ ...base, item: fromRoute("completed"), zone: tray })).toEqual({
      kind: "refuse",
      error: STARTED,
    });
  });
  it("moves a started or finished job without changing it, but never a canceled one", () => {
    expect(
      planDrop({ ...base, item: fromRoute("in_progress"), zone: route("bob", today, 0) }).kind,
    ).toBe("move");
    expect(
      planDrop({ ...base, item: fromRoute("canceled"), zone: route("bob", today, 0) }),
    ).toEqual({ kind: "refuse", error: CANCELED });
  });
});

describe("auto-scroll near the edges", () => {
  it("scrolls up near the top and down near the bottom, faster closer to the edge", () => {
    expect(autoScrollStep(400, 100, 800)).toBe(0);
    expect(autoScrollStep(150, 100, 800)).toBeLessThan(0);
    expect(autoScrollStep(100, 100, 800)).toBe(-14);
    expect(autoScrollStep(760, 100, 800)).toBeGreaterThan(0);
    expect(autoScrollStep(900, 100, 800)).toBe(14);
    expect(Math.abs(autoScrollStep(170, 100, 800))).toBeLessThan(
      Math.abs(autoScrollStep(110, 100, 800)),
    );
  });
  it("stays inside the page", () => {
    expect(clampScroll(-10, 2000, 800)).toBe(0);
    expect(clampScroll(1500, 2000, 800)).toBe(1200);
    expect(clampScroll(50, 500, 800)).toBe(0);
  });
});
