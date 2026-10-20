import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAPS_LABELS,
  PLAN_MOVE_CHOICES,
  TECH_COLORS,
  asksPlanMove,
  dayMapsLabel,
  nextTechColor,
  planMovedBanner,
  planVisitMoveChoices,
  teamOrder,
  techColor,
  visitMovedBanner,
} from "../src";

const tokens = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "brand", "tokens.json"), "utf8"),
) as { color: { tech: { light: Record<string, string> } } };

describe("tech colors", () => {
  it("are the ten token colors, in order, with names", () => {
    expect(TECH_COLORS.map((c) => c.key)).toEqual(Object.keys(tokens.color.tech.light));
    expect(TECH_COLORS.map((c) => c.label)).toEqual([
      "Blue",
      "Green",
      "Orange",
      "Purple",
      "Pink",
      "Teal",
      "Red",
      "Olive",
      "Brown",
      "Slate",
    ]);
  });

  it("read anything that isn't a key as Slate", () => {
    expect(techColor("teal")).toBe("teal");
    for (const v of [null, undefined, "", "Blue", "navy", 3, {}])
      expect(techColor(v)).toBe("slate");
  });

  it("give a new member the first unused color", () => {
    expect(nextTechColor([])).toBe("blue");
    expect(nextTechColor(["blue", "green"])).toBe("orange");
    expect(nextTechColor(["green", null, undefined, "nope"])).toBe("blue");
    expect(nextTechColor(["blue", "blue", "orange"])).toBe("green");
  });

  it("when all are used, the least used, earliest in the palette", () => {
    const all = TECH_COLORS.map((c) => c.key);
    expect(nextTechColor(all)).toBe("blue");
    expect(nextTechColor([...all, "blue", "green"])).toBe("orange");
    expect(nextTechColor([...all, ...all.filter((k) => k !== "red")])).toBe("red");
  });
});

describe("teamOrder", () => {
  const m = (name: string | null, status: string, disabled_at: string | null = null) => ({
    name,
    status,
    disabled_at,
  });

  it("puts active members A to Z, ignoring case and accents, no name last", () => {
    const { active } = teamOrder([
      m("tony", "active"),
      m(null, "active"),
      m("Ángela", "active"),
      m("Priya", "active"),
      m("  ", "active"),
      m("Luis", "active"),
      m("Dana", "active"),
    ]);
    expect(active.map((x) => x.name)).toEqual([
      "Ángela",
      "Dana",
      "Luis",
      "Priya",
      "tony",
      null,
      "  ",
    ]);
  });

  it("puts those turned off below, most recent first, never-dated last, then by name", () => {
    const { active, off } = teamOrder([
      m("Old", "disabled", "2026-01-01T00:00:00Z"),
      m("Zed", "disabled", null),
      m("Amy", "disabled", null),
      m("Recent", "disabled", "2026-10-01T00:00:00Z"),
      m("Same B", "disabled", "2026-05-01T00:00:00Z"),
      m("Same A", "disabled", "2026-05-01T00:00:00Z"),
      m("Here", "active"),
    ]);
    expect(active.map((x) => x.name)).toEqual(["Here"]);
    expect(off.map((x) => x.name)).toEqual(["Recent", "Same A", "Same B", "Old", "Amy", "Zed"]);
  });
});

describe("moving a plan visit", () => {
  const visit = { service_plan_id: "p1", status: "scheduled" };
  const slot = (date: string, techId: string | null) => ({ date, techId });

  it("asks only for a scheduled plan visit", () => {
    expect(asksPlanMove(visit)).toBe(true);
    expect(asksPlanMove({ ...visit, service_plan_id: null })).toBe(false);
    expect(asksPlanMove({ status: "scheduled" })).toBe(false);
    for (const status of ["unscheduled", "in_progress", "done", "canceled", "invoiced"])
      expect(asksPlanMove({ ...visit, status })).toBe(false);
    expect(planVisitMoveChoices).toBe(asksPlanMove);
  });

  it("asks for another day or tech, not a new place in the same day", () => {
    const from = slot("2026-10-21", "luis");
    expect(asksPlanMove(visit, { from, to: slot("2026-10-21", "luis") })).toBe(false);
    expect(asksPlanMove(visit, { from, to: slot("2026-10-22", "luis") })).toBe(true);
    expect(asksPlanMove(visit, { from, to: slot("2026-10-21", "priya") })).toBe(true);
    expect(asksPlanMove(visit, { from, to: slot("2026-10-21", null) })).toBe(true);
  });

  it("words the sheet and the banners", () => {
    expect(PLAN_MOVE_CHOICES.title("Rivera")).toBe("Move Rivera’s visits?");
    expect([
      PLAN_MOVE_CHOICES.changeSchedule,
      PLAN_MOVE_CHOICES.justThisVisit,
      PLAN_MOVE_CHOICES.cancel,
    ]).toEqual(["Change Schedule", "Just This Visit", "Cancel"]);
    expect(planMovedBanner("Rivera", "Tuesday", "Luis")).toBe(
      "Rivera is now on Tuesdays with Luis",
    );
    expect(planMovedBanner("Rivera", "Tuesday", " ")).toBe("Rivera is now on Tuesdays");
    expect(visitMovedBanner).toBe("Moved this visit only");
  });
});

describe("maps wording", () => {
  it("never names the maps company on buttons", () => {
    for (const k of ["openInMaps", "directions", "nextStop", "openRoute", "maps"] as const)
      expect(MAPS_LABELS[k]).not.toMatch(/Apple|Google/);
    expect(dayMapsLabel("google")).toBe("Open Route in Maps");
    expect(dayMapsLabel("apple")).toBe("Next Stop in Maps");
    expect([MAPS_LABELS.automatic, MAPS_LABELS.apple, MAPS_LABELS.google]).toEqual([
      "Automatic",
      "Maps (Apple)",
      "Maps (Google)",
    ]);
  });
});
