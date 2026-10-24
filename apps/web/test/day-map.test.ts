import { describe, expect, it } from "vitest";
import { tokens } from "@leakbook/tokens";
import {
  donePin,
  mixHex,
  leaderDotImageName,
  parseLeaderDotName,
  parsePinImageName,
  pinHex,
  pinImageName,
  pinImageSize,
  routeHex,
} from "../src/components/map-pins";
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

  it("starts at home for someone who starts there (encoded h:)", () => {
    const home = { lat: 33.4, lng: -111.8 };
    const m = dayMap({
      stops: [{ id: "1", location: a, status: "scheduled" }],
      depot: home,
      startLabel: "home",
      date: "2026-10-21",
      today: "2026-10-20",
    });
    expect(m.pins).toBe("h:33.40000,-111.80000;t1:33.50000,-112.10000");
    expect(m.located).toBe(1);
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
      "/api/map?company=c1&pins=s%3A1.00000%2C2.00000&w=600&h=300&v=3",
    );
    // The tech's color (owner, 2026-10-23); water blue is the default, so it's left out.
    expect(mapSrc("c1", "s", { w: 1, h: 1 }, "light", "orange")).toBe(
      "/api/map?company=c1&pins=s&w=1&h=1&v=3&color=orange",
    );
    expect(mapSrc("c1", "s", { w: 1, h: 1 }, "dark", "blue")).toBe(
      "/api/map?company=c1&pins=s&w=1&h=1&v=3&theme=dark",
    );
    expect(mapSrc("c1", "s", { w: 1, h: 1 }, "light", null)).toBe(
      "/api/map?company=c1&pins=s&w=1&h=1&v=3",
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
  it("says which lock holds it (shown as its icon)", () => {
    expect(lockTag(job)).toBeNull();
    expect(lockTag({ ...job, lock_day: true })).toEqual({ label: "Day locked", kind: "day" });
    expect(lockTag({ ...job, lock_time: true })).toEqual({ label: "Time locked", kind: "time" });
    expect(lockTag({ ...job, lock_day: true, lock_time: true })).toEqual({
      label: "Locked",
      kind: "both",
    });
    // Saved before locks: a told time is both.
    expect(lockTag({ ...job, arrival_fixed: true })).toEqual({ label: "Locked", kind: "both" });
  });
  it("keeps Two techs, and says nothing for a started job", () => {
    expect(lockTag({ ...job, second_tech_id: "u" })).toEqual({
      label: "Two techs",
      kind: "two_techs",
    });
    expect(lockTag({ ...job, status: "in_progress", lock_day: true })).toBeNull();
  });
});

describe("map pins in the tech's color", () => {
  it("names each pin image by its tone, number, color and appearance", () => {
    expect(pinImageName({ tone: "todo", label: "3" }, "orange")).toBe("todo-3-orange");
    expect(pinImageName({ tone: "done", label: "1" }, null, "dark")).toBe("done-1-blue-dark");
    expect(pinImageName({ tone: "shop", label: "" }, "orange")).toBe("shop");
    expect(pinImageName({ tone: "shop", label: "", home: true }, "orange")).toBe("home");
  });

  it("reads the names back, older ones in water blue, and refuses anything else", () => {
    expect(parsePinImageName("todo-3-orange.png")).toEqual({
      tone: "todo",
      label: "3",
      home: false,
      hex: tokens.color.tech.light.orange,
      dark: false,
      tier: "full",
    });
    expect(parsePinImageName("current-12-green-dark.png")?.hex).toBe(tokens.color.tech.dark.green);
    expect(parsePinImageName("todo-3.png")?.hex).toBe(tokens.color.brand.water);
    expect(parsePinImageName("home.png")).toMatchObject({ tone: "shop", home: true });
    expect(parsePinImageName("todo-0-orange.png")).toBeNull();
    expect(parsePinImageName("todo-100.png")).toBeNull();
    expect(parsePinImageName("todo-3-mauve.png")).toBeNull();
    expect(parsePinImageName("todo-3-orange")).toBeNull();
  });

  it("names and reads back the smaller pins of zoomed-out images (owner, 2026-10-23)", () => {
    expect(pinImageName({ tone: "todo", label: "3" }, "orange", "light", "medium")).toBe(
      "todo-3-orange-m",
    );
    // Every size is numbered (owner, 2026-10-24: "the stops aren't numbered").
    expect(pinImageName({ tone: "done", label: "7" }, "green", "dark", "small")).toBe(
      "done-7-green-dark-s",
    );
    expect(pinImageName({ tone: "shop", label: "", home: true }, null, "light", "small")).toBe(
      "home-s",
    );
    expect(parsePinImageName("todo-3-orange-m.png")).toMatchObject({ label: "3", tier: "medium" });
    expect(parsePinImageName("done-7-green-dark-s.png")).toMatchObject({
      tone: "done",
      label: "7",
      dark: true,
      tier: "small",
    });
    expect(parsePinImageName("shop-s.png")).toMatchObject({ tone: "shop", tier: "small" });
    // A stop without its number isn't a pin, at any size.
    expect(parsePinImageName("done-green-dark-s.png")).toBeNull();
    expect(parsePinImageName("todo-orange-m.png")).toBeNull();
    expect(parsePinImageName("todo-orange.png")).toBeNull();
    // The small dot a moved pin's leader line ends at.
    expect(leaderDotImageName("orange", "dark")).toBe("dot-orange-dark");
    expect(parseLeaderDotName("dot-orange-dark.png")).toEqual({
      hex: tokens.color.tech.dark.orange,
    });
    expect(parseLeaderDotName("dot-mauve.png")).toBeNull();
    expect(pinImageSize("todo", "small")).toBeLessThan(pinImageSize("todo", "medium"));
    expect(pinImageSize("current", "small")).toBeGreaterThan(pinImageSize("todo", "small"));
    expect(pinImageSize("todo")).toBe(36);
  });

  it("colors routes by tech, water blue without one, and fades done stops", () => {
    expect(routeHex("orange")).toBe(tokens.color.tech.light.orange);
    expect(routeHex("orange", "dark")).toBe(tokens.color.tech.dark.orange);
    expect(routeHex(null)).toBe(tokens.color.brand.water);
    expect(pinHex("shop", "orange")).toBe(tokens.color.brand.navy);
    expect(pinHex("current", "orange")).toBe(tokens.color.tech.light.orange);
    expect(mixHex("#000000", "#ffffff", 0.45)).toBe("#8c8c8c");
    expect(mixHex("#ffffff", "#161E26", 1)).toBe("#ffffff");
    expect(pinImageSize("current")).toBeGreaterThan(pinImageSize("todo"));
    // A done pin: a light tint ringed in the color, numbered in the text color.
    expect(donePin("#000000")).toEqual({
      fill: "#cccccc",
      ring: "#000000",
      text: tokens.color.role.light.text,
    });
    expect(donePin("#000000", "dark").text).toBe(tokens.color.role.dark.text);
  });
});
