import { describe, expect, it } from "vitest";
import {
  cleanUsageEvents,
  featureLabel,
  formatScreenTime,
  MAX_SCREEN_MS,
  normalizeScreen,
  screenLabel,
} from "../src";

const session = "0192f0a0-0000-7000-8000-000000000001";
const now = new Date("2026-10-22T18:00:00Z");

describe("screens", () => {
  it("takes ids out of paths, so every job page is one screen", () => {
    expect(normalizeScreen("/jobs/0192f0a0-1234-7000-8000-00000000abcd?tab=photos")).toBe(
      "/jobs/:id",
    );
    expect(normalizeScreen("/Customers/42/")).toBe("/customers/:id");
    expect(normalizeScreen("/r/AbC9xYz12345678901234567890")).toBe("/r/:id");
    expect(normalizeScreen("")).toBe("/");
    expect(normalizeScreen("/a/b/c/d/e/f/g/h")).toBe("/a/b/c/d/e/f");
  });

  it("names them the way the apps do", () => {
    expect(screenLabel("/jobs/:id")).toBe("Job");
    expect(screenLabel("/jobs/:id/checklist")).toBe("Job › Checklist");
    expect(screenLabel("/settings/price-book")).toBe("Settings › Price Book");
    expect(screenLabel("/more/chemical-log")).toBe("More › Chemical Log");
    expect(screenLabel("/today")).toBe("Today");
    expect(screenLabel("/something/new")).toBe("Something › New");
  });

  it("names features and formats time", () => {
    expect(featureLabel("photo_added")).toBe("Took a photo");
    expect(featureLabel("brand_new_thing")).toBe("Brand New Thing");
    expect(formatScreenTime(40_000)).toBe("40 s");
    expect(formatScreenTime(14 * 60_000)).toBe("14 m");
    expect(formatScreenTime(125 * 60_000)).toBe("2 h 05 m");
  });
});

describe("cleanUsageEvents", () => {
  it("keeps sane events and caps a screen left open", () => {
    const out = cleanUsageEvents(
      [
        { kind: "screen", screen: "/jobs/42", ms: 90_000, at: now.toISOString(), session },
        { kind: "screen", screen: "/today", ms: 10 * 3_600_000, at: now.toISOString(), session },
        {
          kind: "error",
          screen: "/jobs/42",
          detail: "  Couldn’t\nsave ",
          at: now.toISOString(),
          session,
        },
      ],
      now,
    );
    expect(out.map((e) => [e.kind, e.screen, e.ms, e.detail])).toEqual([
      ["screen", "/jobs/:id", 90_000, null],
      ["screen", "/today", MAX_SCREEN_MS, null],
      ["error", "/jobs/:id", 0, "Couldn’t save"],
    ]);
  });

  it("drops what can't be right", () => {
    const old = new Date(now.getTime() - 8 * 86_400_000).toISOString();
    expect(
      cleanUsageEvents(
        [
          { kind: "click", screen: "/x", at: now.toISOString(), session },
          { kind: "screen", screen: "/x", ms: 100, at: now.toISOString(), session },
          { kind: "screen", screen: "/x", ms: 5000, at: old, session },
          { kind: "screen", screen: "/x", ms: 5000, at: now.toISOString(), session: "nope" },
          null,
        ],
        now,
      ),
    ).toEqual([]);
    expect(cleanUsageEvents("not a list", now)).toEqual([]);
  });
});
