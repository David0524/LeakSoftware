import { describe, expect, it } from "vitest";
import { dayMapPins, decodePins, encodePins } from "../src";

describe("dayMapPins", () => {
  const depot = { lat: 33.45, lng: -112.07 };
  it("numbers stops by their place in the day and tones them", () => {
    const { pins, missing } = dayMapPins({
      depot,
      currentId: "b",
      stops: [
        { id: "a", location: { lat: 33.5, lng: -112.1 }, done: true },
        { id: "x", location: null, done: false },
        { id: "b", location: { lat: 33.6, lng: -112.2 }, done: false },
        { id: "c", location: { lat: 33.7, lng: -112.3 }, done: false },
      ],
    });
    expect(missing).toBe(1);
    expect(pins.map((p) => [p.label, p.tone])).toEqual([
      ["", "shop"],
      ["1", "done"],
      ["3", "current"],
      ["4", "todo"],
    ]);
  });
  it("encodes and decodes the map address", () => {
    const { pins } = dayMapPins({
      depot,
      stops: [{ id: "a", location: { lat: 33.512345, lng: -112.1 }, done: false }],
    });
    const v = encodePins(pins);
    expect(v).toBe("s:33.45000,-112.07000;t1:33.51235,-112.10000");
    expect(decodePins(v)).toEqual([
      { tone: "shop", label: "", at: { lat: 33.45, lng: -112.07 } },
      { tone: "todo", label: "1", at: { lat: 33.51235, lng: -112.1 } },
    ]);
  });
  it("refuses anything else", () => {
    expect(decodePins("")).toBeNull();
    expect(decodePins("x1:1,2")).toBeNull();
    expect(decodePins("t1:91,0")).toBeNull();
    expect(decodePins("t1:1,2;<script>")).toBeNull();
  });
});
