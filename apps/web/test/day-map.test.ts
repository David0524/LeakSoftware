import { describe, expect, it } from "vitest";
import { dayMap, lockTag, mapAlt, mapSrc, missingNote, weekdayName } from "../src/lib/day-map";

const shop = { lat: 33.45, lng: -112.07 };
const a = { lat: 33.5, lng: -112.1 };
const b = { lat: 33.6, lng: -112.2 };

describe("day map", () => {
  it("numbers stops by their place in the day and marks the one you're on today", () => {
    const m = dayMap({
      stops: [
        { id: "1", location: a, status: "report_sent" },
        { id: "2", location: null, status: "scheduled" },
        { id: "3", location: b, status: "scheduled" },
      ],
      depot: shop,
      date: "2026-10-20",
      today: "2026-10-20",
    });
    // Stop 2 has no location: it's counted in the numbers but left off the map.
    expect(m.pins).toBe("s:33.45000,-112.07000;d1:33.50000,-112.10000;t3:33.60000,-112.20000");
    expect(m.located).toBe(2);
    expect(m.missing).toBe(1);
  });

  it("marks the first stop not done as current only on today", () => {
    const stops = [
      { id: "1", location: a, status: "completed" },
      { id: "2", location: b, status: "scheduled" },
    ];
    expect(dayMap({ stops, depot: null, date: "2026-10-20", today: "2026-10-20" }).pins).toBe(
      "d1:33.50000,-112.10000;c2:33.60000,-112.20000",
    );
    expect(dayMap({ stops, depot: null, date: "2026-10-21", today: "2026-10-20" }).pins).toBe(
      "d1:33.50000,-112.10000;t2:33.60000,-112.20000",
    );
  });

  it("has no map when no stop has a location", () => {
    const m = dayMap({
      stops: [{ id: "1", location: null, status: "scheduled" }],
      depot: shop,
      date: "2026-10-20",
      today: "2026-10-20",
    });
    expect(m).toEqual({ pins: null, located: 0, missing: 1 });
  });

  it("builds the image address and its words", () => {
    expect(mapSrc("c1", "s:1.00000,2.00000", { w: 600, h: 300 })).toBe(
      "/api/map?company=c1&pins=s%3A1.00000%2C2.00000&w=600&h=300",
    );
    expect(mapAlt("Priya Shah", "Monday", 1)).toBe("Map of Priya Shah’s stops on Monday: 1 stop");
    expect(mapAlt("Priya Shah", "Monday", 5)).toBe("Map of Priya Shah’s stops on Monday: 5 stops");
    expect(missingNote(0)).toBeNull();
    expect(missingNote(1)).toBe("1 stop isn’t on the map");
    expect(missingNote(2)).toBe("2 stops aren’t on the map");
    expect(weekdayName("2026-10-19")).toBe("Monday");
  });
});

describe("lock tag", () => {
  const job = {
    id: "j",
    status: "scheduled" as const,
    assigned_user_id: "t",
    second_tech_id: null,
    scheduled_start: null,
    scheduled_end: null,
    route_order: null,
    arrival_fixed: false,
    lock_day: false,
    lock_time: false,
    property: null,
  };
  it("says what the lock holds, with a padlock", () => {
    expect(lockTag(job)).toBeNull();
    expect(lockTag({ ...job, lock_day: true })).toEqual({ label: "Day locked", icon: true });
    expect(lockTag({ ...job, lock_time: true })).toEqual({ label: "Time locked", icon: true });
    expect(lockTag({ ...job, lock_day: true, lock_time: true })).toEqual({
      label: "Locked",
      icon: true,
    });
    // Saved before locks: a told time is both.
    expect(lockTag({ ...job, arrival_fixed: true })).toEqual({ label: "Locked", icon: true });
  });
  it("keeps Two techs, and says nothing for a started job", () => {
    expect(lockTag({ ...job, second_tech_id: "u" })).toEqual({ label: "Two techs", icon: false });
    expect(lockTag({ ...job, status: "in_progress", lock_day: true })).toBeNull();
  });
});
