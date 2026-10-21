import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAPS_LABELS,
  PLAN_MOVE_CHOICES,
  REORDER_TECHS,
  TECH_COLORS,
  asksPlanMove,
  moveInList,
  scheduleOrder,
  scheduleOrderWrites,
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

describe("scheduleOrder (owner, 2026-10-21: reorder techs in the schedule)", () => {
  const m = (user_id: string, name: string | null, schedule_order?: number | null) => ({
    user_id,
    name,
    schedule_order,
  });
  const ids = (list: { user_id: string }[]) => list.map((x) => x.user_id);

  it("without a saved order: me first, then A to Z", () => {
    const team = [m("z", "Zed"), m("a", "ángela"), m("me", "Priya"), m("n", null), m("b", "Ben")];
    expect(ids(scheduleOrder(team, "me"))).toEqual(["me", "a", "b", "z", "n"]);
    expect(ids(scheduleOrder(team))).toEqual(["a", "b", "me", "z", "n"]);
  });

  it("a saved order wins, me included; people without a place follow, A to Z", () => {
    const team = [m("me", "Priya", 3), m("z", "Zed", 1), m("new", "Amy"), m("b", "Ben", 2)];
    expect(ids(scheduleOrder(team, "me"))).toEqual(["z", "b", "me", "new"]);
  });

  it("ties keep names, then the input order; it doesn't change the input", () => {
    const team = [m("x", "Same", 1), m("y", "Same", 1), m("a", "Abe", 1)];
    expect(ids(scheduleOrder(team))).toEqual(["a", "x", "y"]);
    expect(ids(team)).toEqual(["x", "y", "a"]);
  });

  it("writes only the places that changed, 1 first", () => {
    const rows = [
      { id: "a", schedule_order: 1 },
      { id: "b", schedule_order: null },
      { id: "c", schedule_order: 3 },
    ];
    expect(scheduleOrderWrites(rows, ["a", "b", "c"])).toEqual([{ id: "b", schedule_order: 2 }]);
    expect(scheduleOrderWrites(rows, ["c", "a", "b"])).toEqual([
      { id: "c", schedule_order: 1 },
      { id: "a", schedule_order: 2 },
      { id: "b", schedule_order: 3 },
    ]);
    expect(scheduleOrderWrites(rows, ["a", "gone", "c"])).toEqual([]);
  });

  it("moves an item in a list, clamped", () => {
    expect(moveInList(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveInList(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveInList(["a", "b", "c"], 2, 9)).toEqual(["a", "b", "c"]);
    expect(moveInList(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
  });

  it("has the sheet's words", () => {
    expect(REORDER_TECHS.action).toBe("Reorder Techs");
    expect(REORDER_TECHS.title).toBe("Reorder Techs");
  });
});
