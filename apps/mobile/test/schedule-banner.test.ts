import { describe, expect, it } from "vitest";
import { formatAddress, type Property } from "@leakbook/core";
import {
  BANNER_MS,
  BANNER_UNDO_MS,
  bannerDuration,
  bannerSpoken,
  bannerText,
} from "../src/lib/resultBanner";
import { poolsToLocate } from "../src/lib/locateMissing";

// Owner, 2026-10-20: Schedule's results in a banner at the top, and pools not on the map
// looked up in the background.

describe("the result banner's words", () => {
  it("says Optimize's result in one short line", () => {
    expect(
      bannerText(
        "Planned: 2 hr 8 min of driving, 1 hr 6 min less than before, back at the shop by 4:28 PM.",
      ),
    ).toEqual({ message: "Optimized · 1 hr 6 min less driving · Back by 4:28 PM" });
  });
  it("gives the driving when nothing was saved, and the notes as a second line", () => {
    expect(
      bannerText(
        "Planned: 48 min of driving, back at the shop by 3:10 PM. Note: runs 20 min past the end of the day; some pools have no location, so driving to them isn’t counted.",
      ),
    ).toEqual({
      message: "Optimized · 48 min driving · Back by 3:10 PM",
      detail: "Runs 20 min past the end of the day. Driving to pools not on the map isn’t counted.",
    });
  });
  it("splits a move's note from its result", () => {
    expect(bannerText("Moved to 9:15 AM. Note: the day runs 15 min late.")).toEqual({
      message: "Moved to 9:15 AM.",
      detail: "The day runs 15 min late.",
    });
    expect(bannerText("Taken off the schedule.")).toEqual({ message: "Taken off the schedule." });
  });
  it("stays 4 s, 8 s with Undo, and an error until it's dismissed", () => {
    expect(bannerDuration({ tone: "success" })).toBe(BANNER_MS);
    expect(bannerDuration({ tone: "success", undo: () => {} })).toBe(BANNER_UNDO_MS);
    expect(bannerDuration({ tone: "error" })).toBeNull();
  });
  it("reads the line aloud without the dots", () => {
    expect(
      bannerSpoken({ message: "Optimized · 1 hr less driving · Back by 4:28 PM", undo: () => {} }),
    ).toBe("Optimized, 1 hr less driving, Back by 4:28 PM. Undo is available.");
  });
});

const pool = (id: string, over: Partial<Property> = {}): Property =>
  ({
    id,
    company_id: "c",
    customer_id: "x",
    address_line1: `${id} Main St`,
    city: "Mesa",
    state: "AZ",
    postal_code: "85201",
    has_pool: true,
    has_spa: false,
    ...over,
  }) as Property;

describe("pools not on the map are looked up", () => {
  it("picks pools with an address and no location, once each, at most ten", () => {
    const list = Array.from({ length: 14 }, (_, i) => pool(`p${i}`));
    expect(poolsToLocate([...list, list[0]], new Set())).toHaveLength(10);
  });
  it("skips placed pools, pools tried this session, and ones already tried at this address", () => {
    const placed = pool("a", { latitude: 33.4, longitude: -111.8 });
    const tried = pool("b");
    const missed = pool("c");
    missed.geocoded_address = formatAddress(missed);
    const moved = pool("d", { geocoded_address: "1 Old Rd, Mesa, AZ 85201" });
    const blank = pool("e", { address_line1: " " });
    expect(
      poolsToLocate([placed, tried, missed, moved, blank, undefined], new Set(["b"])).map(
        (p) => p.id,
      ),
    ).toEqual(["d"]);
  });
});
