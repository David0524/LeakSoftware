import { describe, expect, it } from "vitest";
import {
  lastOtherReading,
  lastVisitNote,
  pickList,
  readingHints,
  usualChemicalIds,
  usualVisit,
  type ChemicalItem,
} from "../src";

const TZ = "America/New_York";

describe("reading hints", () => {
  it("shows the last value of each reading the pool has, never filling the box", () => {
    expect(readingHints({ fc: 3, ph: 7.6, ta: 90, ch: null, cya: 40, salt: undefined })).toEqual({
      fc: "Last 3",
      ph: "Last 7.6",
      ta: "Last 90",
      cya: "Last 40",
    });
    expect(readingHints({ ph: 8 })).toEqual({ ph: "Last 8.0" });
    expect(readingHints({ fc: 0.5, salt: 3200 })).toEqual({ fc: "Last 0.5", salt: "Last 3200" });
    expect(readingHints(null)).toEqual({});
  });

  it("takes the newest reading from another visit", () => {
    const rows = [
      { job_id: "now", recorded_at: "2026-10-26T14:00:00Z" },
      { job_id: "a", recorded_at: "2026-10-12T14:00:00Z" },
      { job_id: "b", recorded_at: "2026-10-19T14:00:00Z" },
    ];
    expect(lastOtherReading(rows, "now")?.job_id).toBe("b");
    expect(lastOtherReading(rows, null)?.job_id).toBe("now");
    expect(lastOtherReading([], "now")).toBeNull();
  });
});

describe("a pool's usual chemicals", () => {
  const add = (item: string, job: string, at: string) => ({
    price_book_item_id: item,
    job_id: job,
    added_at: at,
  });
  it("ranks by visits, then recency, counting an item once a visit", () => {
    const past = [
      add("cl", "j1", "2026-10-05T10:00:00Z"),
      add("cl", "j1", "2026-10-05T10:01:00Z"),
      add("acid", "j1", "2026-10-05T10:02:00Z"),
      add("cl", "j2", "2026-10-12T10:00:00Z"),
      add("tabs", "j2", "2026-10-12T10:01:00Z"),
      add("acid", "j3", "2026-10-19T10:00:00Z"),
      { price_book_item_id: null, job_id: "j3", added_at: "2026-10-19T10:00:00Z" },
    ];
    expect(usualChemicalIds(past)).toEqual(["acid", "cl", "tabs"]);
    expect(usualChemicalIds(past, 1)).toEqual(["acid"]);
    expect(usualChemicalIds([])).toEqual([]);
  });
});

describe("Add Chemical's list", () => {
  const item = (id: string, name: string): ChemicalItem => ({
    id,
    name,
    unit: "gal",
    price_cents: 100,
  });
  const items = [item("a", "Algaecide"), item("b", "Baking soda"), item("c", "Liquid chlorine")];
  it("puts the usual ones first and leaves them out of the rest", () => {
    const l = pickList(items, ["c", "gone", "a"]);
    expect(l.usual.map((i) => i.id)).toEqual(["c", "a"]);
    expect(l.rest.map((i) => i.id)).toEqual(["b"]);
  });
  it("filters both groups by the search", () => {
    const l = pickList(items, ["c", "a"], " AL");
    expect(l.usual.map((i) => i.id)).toEqual(["a"]);
    expect(l.rest.map((i) => i.id)).toEqual([]);
    expect(pickList(items, [], "").rest).toHaveLength(3);
  });
});

describe("last visit's notes", () => {
  it("shows the newest note from another visit, with its day", () => {
    const note = lastVisitNote({
      jobId: "now",
      jobs: [
        { id: "j1", summary_notes: "  Dog in the yard. ", when: "2026-10-12T14:00:00Z" },
        { id: "now", summary_notes: "today's", when: "2026-10-26T14:00:00Z" },
        { id: "j0", summary_notes: "", when: "2026-10-19T14:00:00Z" },
      ],
      readings: [
        { job_id: "j1", recorded_at: "2026-10-19T15:00:00Z", notes: "Gate sticks" },
        { job_id: "now", recorded_at: "2026-10-26T15:00:00Z", notes: "ignored" },
      ],
      timeZone: TZ,
    });
    expect(note).toEqual({ label: "Last visit · Mon, Oct 19", text: "Gate sticks" });
  });
  it("is null with nothing written", () => {
    expect(
      lastVisitNote({
        jobId: "now",
        jobs: [{ id: "j", summary_notes: " " }],
        readings: [],
        timeZone: TZ,
      }),
    ).toBeNull();
  });
});

describe("a customer's usual tech and time", () => {
  const job = (tech: string | null, start: string) => ({
    assigned_user_id: tech,
    scheduled_start: start,
  });
  it("uses what most of the last visits share", () => {
    expect(
      usualVisit(
        [
          job("marco", "2026-10-26T13:00:00Z"),
          job("marco", "2026-10-19T13:00:00Z"),
          job("rosa", "2026-10-12T14:00:00Z"),
          job("marco", "2026-10-05T13:00:00Z"),
          job("rosa", "2026-09-28T13:00:00Z"),
        ],
        TZ,
      ),
    ).toEqual({ techId: "marco", time: "09:00" });
  });
  it("says nothing when it isn't obvious", () => {
    expect(usualVisit([job("marco", "2026-10-26T13:00:00Z")], TZ)).toBeNull();
    expect(
      usualVisit([job("marco", "2026-10-26T13:00:00Z"), job("rosa", "2026-10-19T15:30:00Z")], TZ),
    ).toBeNull();
    expect(usualVisit([], TZ)).toBeNull();
  });
  it("can know only the time, or only the tech", () => {
    expect(
      usualVisit([job(null, "2026-10-26T13:00:00Z"), job(null, "2026-10-19T13:00:00Z")], TZ),
    ).toEqual({ techId: null, time: "09:00" });
    expect(
      usualVisit([job("marco", "2026-10-26T13:00:00Z"), job("marco", "2026-10-19T15:30:00Z")], TZ),
    ).toEqual({ techId: "marco", time: null });
  });
});
