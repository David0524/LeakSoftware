import { describe, expect, it } from "vitest";
import {
  estimateDriveMinutes,
  routingSettings,
  zonedTimeToIso,
  type PlanContext,
} from "@leakbook/core";
import {
  EVERYONE,
  buildWeekPlan,
  planDates,
  planForLabel,
  planTechs,
  planWaitingCount,
  togglePlanTech,
  type WeekPlanJob,
} from "../src/lib/weekPlan";
import { dayMap, lockTag, mapAlt, mapUrl, missingNote, weekdayName } from "../src/lib/dayMap";

// Plan Week and day maps on Android (owner, 2026-10-20, docs/plans/route-maps.md), worked out
// on the phone as the website's server action and lib/day-map.ts do.

const tz = "America/Phoenix";
// Monday 2026-10-19 to Friday 2026-10-23; today is Tuesday, 7 AM.
const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
const ctx: PlanContext = {
  timeZone: tz,
  settings: routingSettings({}),
  depot: { lat: 33.45, lng: -112.07 },
  today: "2026-10-20",
  nowMin: 7 * 60,
};
const at = (date: string, time: string) => zonedTimeToIso(date, time, tz);
const north = (i: number) => ({ latitude: 33.65 + i * 0.002, longitude: -112.07 });
const south = (i: number) => ({ latitude: 33.25 - i * 0.002, longitude: -112.07 });

let n = 0;
function job(over: Partial<WeekPlanJob> & { date?: string; time?: string }): WeekPlanJob {
  const { date, time, ...rest } = over;
  n += 1;
  const start = date ? at(date, time ?? "09:00") : null;
  return {
    id: `0190000${String(n).padStart(2, "0")}-0000-7000-8000-000000000000`,
    status: start ? "scheduled" : "unscheduled",
    assigned_user_id: start ? "t1" : null,
    second_tech_id: null,
    scheduled_start: start,
    scheduled_end: start ? new Date(Date.parse(start) + 60 * 60_000).toISOString() : null,
    route_order: null,
    property: north(n),
    ...rest,
  };
}

const team = [
  { user_id: "t1", status: "active" },
  { user_id: "t2", status: "active" },
];

function run(jobs: WeekPlanJob[], over: { tech?: string; tray?: boolean } = {}) {
  const scheduled = jobs.filter((j) => j.status !== "unscheduled" && j.assigned_user_id);
  return buildWeekPlan({
    ctx,
    dates: week,
    techs: [over.tech ?? "t1"],
    name: (id) => ({ t1: "Ana", t2: "Ben" })[id] ?? id,
    tray: over.tray ?? true,
    team,
    dayJobs: (techId, date) =>
      scheduled.filter(
        (j) =>
          (j.assigned_user_id === techId || j.second_tech_id === techId) &&
          j.scheduled_start?.startsWith(date),
      ),
    waiting: jobs.filter((j) => j.status === "unscheduled" || !j.assigned_user_id),
    drive: estimateDriveMinutes,
  });
}

describe("Plan Week on the phone", () => {
  it("plans only working days from today on", () => {
    expect(planDates(ctx, [...week, "2026-10-24", "2026-10-20"])).toEqual(week.slice(1));
    expect(run([], {}).error).toBe(
      "Nothing to plan: every job this week is locked, started, or shared with a second tech.",
    );
    expect(
      buildWeekPlan({
        ctx,
        dates: ["2026-10-18", "2026-10-19"],
        techs: ["t1"],
        tray: true,
        team,
        dayJobs: () => [],
        waiting: [],
        drive: estimateDriveMinutes,
      }).error,
    ).toBe("No working days left this week to plan.");
  });

  it("places Needs a Time jobs and keeps what was there for Undo", () => {
    const waiting = job({ property: south(1) });
    const booked = job({ date: "2026-10-21", time: "10:00", property: south(2) });
    const r = run([waiting, booked]);
    expect(r.error).toBeUndefined();
    const placed = r.updates.find((u) => u.id === waiting.id)!;
    expect(placed.assigned_user_id).toBe("t1");
    expect(placed.status).toBe("scheduled");
    expect(placed.scheduled_start).toBeTruthy();
    // Undo writes back exactly what each changed job was.
    const back = r.undo.find((u) => u.id === waiting.id)!;
    expect(back).toEqual({
      id: waiting.id,
      status: "unscheduled",
      assigned_user_id: null,
      scheduled_start: null,
      scheduled_end: null,
      route_order: null,
    });
    expect(r.undo.map((u) => u.id).sort()).toEqual(r.updates.map((u) => u.id).sort());
    expect(r.message).toMatch(/^Moved \d+ jobs?/);
  });

  it("leaves Needs a Time with nobody on it alone when the switch is off", () => {
    const waiting = job({});
    const r = run([waiting], { tray: false });
    expect(r.error).toBe(
      "Nothing to plan: every job this week is locked, started, or shared with a second tech.",
    );
  });

  it("a job given to another tech is planned only with that tech", () => {
    const theirs = job({ assigned_user_id: "t2" });
    expect(run([theirs]).updates.some((u) => u.id === theirs.id)).toBe(false);
    const r = run([theirs], { tech: EVERYONE });
    expect(r.updates.find((u) => u.id === theirs.id)?.assigned_user_id).toBe("t2");
  });

  it("day locks, both locks, two-tech, started and maintenance jobs stay on their day", () => {
    const stays = [
      job({ date: "2026-10-22", lock_day: true }),
      job({ date: "2026-10-22", time: "11:00", lock_day: true, lock_time: true }),
      job({ date: "2026-10-22", time: "13:00", second_tech_id: "t2" }),
      job({ date: "2026-10-22", time: "14:00", status: "in_progress" }),
      job({ date: "2026-10-22", time: "15:00", service_plan_id: "plan" }),
    ];
    const r = run([...stays, job({ property: south(3) })]);
    for (const s of stays) {
      const u = r.updates.find((x) => x.id === s.id);
      if (!u) continue;
      expect(u.assigned_user_id).toBeUndefined();
      if (u.scheduled_start) expect(u.scheduled_start.slice(0, 10)).toBe("2026-10-22");
    }
    const both = r.updates.find((x) => x.id === stays[1]!.id);
    expect(both?.scheduled_start).toBeUndefined();
  });

  it("a time lock keeps its clock time on whatever day it goes to", () => {
    const timed = job({ date: "2026-10-23", time: "13:30", lock_time: true, property: south(4) });
    const r = run([timed, job({ date: "2026-10-21", property: south(5) })]);
    const u = r.updates.find((x) => x.id === timed.id);
    if (u?.scheduled_start)
      expect(new Date(u.scheduled_start).toISOString().slice(11, 16)).toBe("20:30");
  });

  it("counts the jobs waiting for the switch as the website does", () => {
    const list = [
      job({}),
      job({ assigned_user_id: "t1", status: "unscheduled" }),
      job({ date: "2026-10-21", assigned_user_id: null }),
      job({ date: "2026-10-30", assigned_user_id: null }),
    ];
    expect(planWaitingCount(list, week.slice(1), tz)).toBe(2);
  });
});

describe("day maps on the phone", () => {
  it("numbers stops by their place in the day and rings the current one today", () => {
    const m = dayMap({
      stops: [
        { id: "a", location: { lat: 33.5, lng: -112.1 }, status: "completed" },
        { id: "b", location: null, status: "scheduled" },
        { id: "c", location: { lat: 33.6, lng: -112.2 }, status: "scheduled" },
      ],
      depot: ctx.depot,
      date: "2026-10-20",
      today: "2026-10-20",
    });
    expect(m.pins).toBe("s:33.45000,-112.07000;d1:33.50000,-112.10000;t3:33.60000,-112.20000");
    expect(m.missing).toBe(1);
    expect(m.located).toBe(2);
    const today = dayMap({
      stops: [{ id: "c", location: { lat: 33.6, lng: -112.2 }, status: "scheduled" }],
      depot: null,
      date: "2026-10-20",
      today: "2026-10-20",
    });
    expect(today.pins).toBe("c1:33.60000,-112.20000");
  });

  it("asks the website for the image and words it", () => {
    expect(mapUrl("https://x.test", "co", "s:1.00000,2.00000", { w: 640, h: 320 })).toBe(
      "https://x.test/api/map?company=co&pins=s%3A1.00000%2C2.00000&w=640&h=320&v=3",
    );
    expect(mapUrl("https://x.test", "co", "s", { w: 1, h: 1 }, "dark")).toBe(
      "https://x.test/api/map?company=co&pins=s&w=1&h=1&v=3&theme=dark",
    );
    // The tech's color (owner, 2026-10-23); water blue, the default, is left out.
    expect(mapUrl("https://x.test", "co", "s", { w: 1, h: 1 }, "dark", "orange")).toBe(
      "https://x.test/api/map?company=co&pins=s&w=1&h=1&v=3&color=orange&theme=dark",
    );
    expect(mapUrl("https://x.test", "co", "s", { w: 1, h: 1 }, "light", "blue")).toBe(
      "https://x.test/api/map?company=co&pins=s&w=1&h=1&v=3",
    );
    expect(mapUrl(null, "co", "s", { w: 1, h: 1 })).toBeNull();
    expect(mapAlt("Priya Shah", "Monday", 1)).toBe("Map of Priya Shah’s stops on Monday: 1 stop");
    expect(missingNote(0)).toBeNull();
    expect(missingNote(2)).toBe("2 stops aren’t on the map");
    expect(weekdayName("2026-10-19")).toBe("Monday");
  });

  it("tags locks on cards, and says nothing for started jobs", () => {
    const base = job({ date: "2026-10-21" });
    expect(lockTag({ ...base, lock_day: true })).toEqual({ label: "Day locked", kind: "day" });
    expect(lockTag({ ...base, lock_time: true })).toEqual({ label: "Time locked", kind: "time" });
    expect(lockTag({ ...base, arrival_fixed: true })).toEqual({ label: "Locked", kind: "both" });
    expect(lockTag({ ...base, second_tech_id: "t2" })).toEqual({
      label: "Two techs",
      kind: "two_techs",
    });
    expect(lockTag({ ...base, status: "in_progress", lock_day: true })).toBeNull();
    expect(lockTag(base)).toBeNull();
  });
});

// Plan Week for several techs, split evenly (owner, 2026-10-20; gestures spec section 7).
describe("Plan Week for several techs", () => {
  const techs = [
    { id: "t1", name: "Ana" },
    { id: "t2", name: "Ben" },
  ];

  it("reads Everyone, the tech's name, or how many when closed", () => {
    expect(planForLabel(["t1", "t2"], techs)).toBe("Everyone");
    expect(planForLabel([EVERYONE], techs)).toBe("Everyone");
    expect(planForLabel(["t2"], techs)).toBe("Ben");
    expect(planForLabel([], techs)).toBe("");
    const three = [...techs, { id: "t3", name: "Cy" }];
    expect(planForLabel(["t1", "t3"], three)).toBe("2 Techs");
  });

  it("Everyone selects or clears all; a tech's row turns them on or off", () => {
    expect(togglePlanTech(["t1"], EVERYONE, techs)).toEqual(["t1", "t2"]);
    expect(togglePlanTech(["t1", "t2"], EVERYONE, techs)).toEqual([]);
    expect(togglePlanTech(["t1"], "t2", techs)).toEqual(["t1", "t2"]);
    expect(togglePlanTech(["t1", "t2"], "t1", techs)).toEqual(["t2"]);
    expect(togglePlanTech([EVERYONE], "t2", techs)).toEqual(["t1"]);
  });

  it("plans the picked techs, or every active one for Everyone", () => {
    const team = [
      { user_id: "t1", status: "active" },
      { user_id: "t2", status: "active" },
      { user_id: "t3", status: "inactive" },
    ];
    expect(planTechs([EVERYONE], team)).toEqual(["t1", "t2"]);
    expect(planTechs(["t2", "t2", "nobody"], team)).toEqual(["t2"]);
  });

  it("splits open jobs evenly between two techs, with the split for the banner", () => {
    const open = Array.from({ length: 6 }, (_, i) => job({ property: north(i) }));
    const r = run(open, { tech: EVERYONE });
    expect(r.error).toBeUndefined();
    const count = (t: string) =>
      r.updates.filter((u) => open.some((j) => j.id === u.id) && u.assigned_user_id === t).length;
    expect(Math.abs(count("t1") - count("t2"))).toBeLessThanOrEqual(1);
    expect(r.detail).toMatch(/^Ana \d+ jobs? · Ben \d+ jobs?$/);
    // One tech: no split line.
    expect(run(open, { tech: "t1" }).detail).toBeUndefined();
  });
});
