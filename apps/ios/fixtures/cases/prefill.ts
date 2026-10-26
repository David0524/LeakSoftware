import {
  lastOtherReading,
  lastVisitNote,
  pickList,
  readingHints,
  usualChemicalIds,
  usualVisit,
  type ChemicalItem,
  type ReadingKey,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// prefill.ts (owner, 2026-10-26): hints and defaults from what the app already knows.

const TZ = "America/New_York";
type Readings = Partial<Record<ReadingKey, number | null>>;

const item = (id: string, name: string, sort_order: number): ChemicalItem => ({
  id,
  name,
  unit: "gal",
  price_cents: 800,
  sort_order,
  category: "Chemicals",
});
const items = [
  item("alg", "Algaecide", 1),
  item("bs", "Baking soda", 2),
  item("cl", "Liquid chlorine", 3),
  item("acid", "Muriatic acid", 4),
];
const add = (id: string | null, job: string | null, at: string) => ({
  price_book_item_id: id,
  job_id: job,
  added_at: at,
});
const past = [
  add("cl", "j1", "2026-10-05T10:00:00Z"),
  add("cl", "j1", "2026-10-05T10:01:00Z"),
  add("acid", "j1", "2026-10-05T10:02:00Z"),
  add("cl", "j2", "2026-10-12T10:00:00Z"),
  add("alg", "j2", "2026-10-12T10:01:00.000Z"),
  add("acid", "j3", "2026-10-19T10:00:00Z"),
  add(null, "j3", "2026-10-19T10:00:00Z"),
  add("bs", "j3", "2026-10-19T10:00:00Z"),
];
const readings = [
  { job_id: "now", recorded_at: "2026-10-26T14:00:00Z", notes: "ignored" },
  { job_id: "a", recorded_at: "2026-10-12T14:00:00Z", notes: null },
  { job_id: "b", recorded_at: "2026-10-19T14:00:00Z", notes: "Gate sticks" },
  { job_id: null, recorded_at: "2026-10-20T14:00:00Z" },
];
const visit = (tech: string | null, start: string | null) => ({
  assigned_user_id: tech,
  scheduled_start: start,
});

export const prefill: ModuleCases = {
  lastOtherReading: rule(
    (rows: { job_id?: string | null; recorded_at: string }[], jobId: string | null) =>
      lastOtherReading(rows, jobId),
    [
      [readings, "now"],
      [readings, null],
      [readings, ""],
      [[], "now"],
      [[{ job_id: "now", recorded_at: "2026-10-26T14:00:00Z" }], "now"],
    ],
  ),
  readingHints: rule(
    (r: Readings | null) => readingHints(r),
    [
      [{ fc: 3, ph: 7.6, ta: 90, ch: null, cya: 40 }],
      [{ ph: 8 }],
      [{ fc: 0.5, salt: 3200, ph: 7.25 }],
      [{}],
      [null],
    ],
  ),
  usualChemicalIds: rule(
    (rows: ReturnType<typeof add>[], limit?: number) =>
      limit === undefined ? usualChemicalIds(rows) : usualChemicalIds(rows, limit),
    [
      [past],
      [past, 1],
      [past, 2],
      [[]],
      [[add("cl", null, "2026-10-05T10:00:00Z"), add("cl", null, "2026-10-06T10:00:00Z")]],
    ],
  ),
  pickList: rule(
    (rows: ChemicalItem[], usual: string[], query: string) => pickList(rows, usual, query),
    [
      [items, ["cl", "gone", "alg"], ""],
      [items, ["cl", "alg"], " AL"],
      [items, [], "acid"],
      [items, ["acid"], "zzz"],
    ],
  ),
  lastVisitNote: rule(
    (
      jobId: string | null,
      jobs: { id: string; summary_notes?: string | null; when?: string | null }[],
      rows: { job_id?: string | null; recorded_at: string; notes?: string | null }[],
      timeZone: string,
    ) => lastVisitNote({ jobId, jobs, readings: rows, timeZone }),
    [
      [
        "now",
        [
          { id: "j1", summary_notes: "  Dog in the yard. ", when: "2026-10-12T14:00:00Z" },
          { id: "now", summary_notes: "today", when: "2026-10-26T14:00:00Z" },
          { id: "j0", summary_notes: "", when: "2026-10-19T14:00:00Z" },
        ],
        readings,
        TZ,
      ],
      [
        "now",
        [{ id: "j1", summary_notes: "Dog in the yard.", when: "2026-10-27T03:30:00Z" }],
        [],
        TZ,
      ],
      ["now", [{ id: "j", summary_notes: " " }], [], TZ],
      [null, [{ id: "j", summary_notes: "No date" }], [], TZ],
      [null, [], [{ job_id: "x", recorded_at: "2026-10-19T14:00:00Z", notes: "Gate sticks" }], TZ],
    ],
  ),
  usualVisit: rule(
    (
      jobs: { assigned_user_id?: string | null; scheduled_start?: string | null }[],
      timeZone: string,
    ) => usualVisit(jobs, timeZone),
    [
      [
        [
          visit("marco", "2026-10-26T13:00:00Z"),
          visit("marco", "2026-10-19T13:00:00Z"),
          visit("rosa", "2026-10-12T14:00:00Z"),
          visit("marco", "2026-10-05T13:00:00Z"),
          visit("rosa", "2026-09-28T13:00:00Z"),
        ],
        TZ,
      ],
      [[visit("marco", "2026-10-26T13:00:00Z")], TZ],
      [[visit("marco", "2026-10-26T13:00:00Z"), visit("rosa", "2026-10-19T15:30:00Z")], TZ],
      [[visit(null, "2026-10-26T13:00:00Z"), visit(null, "2026-10-19T13:00:00Z")], TZ],
      [[visit("marco", "2026-10-26T13:00:00Z"), visit("marco", "2026-10-19T15:30:00Z")], TZ],
      [
        [
          visit("marco", null),
          visit("marco", "not a date"),
          visit("marco", "2026-10-19T13:00:00Z"),
        ],
        TZ,
      ],
      [[], TZ],
    ],
  ),
};
