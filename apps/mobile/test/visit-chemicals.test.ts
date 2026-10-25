import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import type { ChemicalAddition, Property } from "@leakbook/core";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// A visit's Chemicals (owner, 2026-10-24): the readings save as typed into one row per visit,
// each chemical added is its own row, all on the phone first (row + outbox), as the website
// and the iPhone.

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: () => () => {} },
}));
vi.mock("expo-file-system", () => ({ Paths: { availableDiskSpace: 1e12 } }));
vi.mock("../src/lib/media", () => ({ deleteAllMedia: () => {} }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));

const { SyncService } = await import("../src/lib/sync-service");

function service() {
  const kv = new Map<string, string>();
  return new SyncService(
    LocalStore.open(memoryDb()),
    { auth: { getSession: async () => ({ data: { session: null } }) } } as never as SupabaseClient,
    {
      get: (k) => kv.get(k) ?? null,
      set: (k, v) => void kv.set(k, v),
      remove: (k) => void kv.delete(k),
    },
    {} as Uploader,
  );
}

const sync = service();
const kvWrites: [string, string][] = [];
const kv = { get: () => null, set: (k: string, v: string) => void kvWrites.push([k, v]) };
vi.mock("../src/lib/services", () => ({ getServices: () => ({ sync, kv }) }));
const { addChemicals, createVisitReadingSaver, removeChemical, saveVisitReading, updateChemical } =
  await import("../src/data/chemicals");

const company = "0190b6b0-0000-7000-8000-000000000001";
const job = "0190b6b0-0000-7000-8000-000000000002";
const pool = {
  id: "0190b6b0-0000-7000-8000-000000000003",
  company_id: company,
  approx_gallons: null,
} as unknown as Property;

const input = (readings: Record<string, string>) => ({
  companyId: company,
  jobId: job,
  pool,
  gallons: "20,000",
  readings,
  goals: { fc: "4", cya: "x" },
  chlorine: "liquid12" as const,
  acid: "muriatic31" as const,
  notes: " Gate code 1234 ",
});

describe("a visit's Chemicals", () => {
  it("saves the readings into one row per visit, its id the visit's", () => {
    expect(saveVisitReading(input({ fc: "1", ph: "7.8" }))).toBeNull();
    const row = sync.get("chemical_reading", job)!;
    expect(row).toMatchObject({
      job_id: job,
      property_id: pool.id,
      fc: 1,
      ph: 7.8,
      gallons: 20000,
      goals: { fc: 4 },
      notes: "Gate code 1234",
    });
    // The pool had no gallons: they fill in.
    expect(sync.get("property", pool.id)).toMatchObject({ approx_gallons: 20000 });

    // Typed again: the same row.
    saveVisitReading(input({ fc: "1", ph: "7.8", ta: "90" }));
    expect(sync.list("chemical_reading", company, job)).toHaveLength(1);
    expect(sync.get("chemical_reading", job)).toMatchObject({ ta: 90 });

    // Not a reading yet: not saved, and says why.
    expect(saveVisitReading(input({ ph: "15" }))).toBe("pH should be between 0 and 14.");
    expect(sync.get("chemical_reading", job)).toMatchObject({ ph: 7.8 });

    // Every reading cleared: removed; typed again: back.
    saveVisitReading(input({}));
    expect(sync.get("chemical_reading", job)?.deleted_at).toBeTruthy();
    saveVisitReading(input({ fc: "2" }));
    expect(sync.get("chemical_reading", job)).toMatchObject({ fc: 2, deleted_at: null });
  });

  it("writes nothing while the keys are going: once when typing stops or the field is left", () => {
    // Owner, 2026-10-25: "a little laggy … when typing in multi digit numbers". Before, every
    // Aim For keystroke wrote the remembered levels at once and any half-second pause saved the
    // reading: these 7 keys, 600 ms apart, made 6 reading writes and 3 level writes. Now: one each.
    vi.useFakeTimers();
    try {
      const visitJob = "0190b6b0-0000-7000-8000-000000000009";
      const writes = vi.spyOn(sync, "write");
      kvWrites.length = 0;
      const problems: (string | null)[] = [];
      const saver = createVisitReadingSaver({
        visit: () => ({ companyId: company, jobId: visitJob, pool }),
        onSaved: (p) => problems.push(p),
      });
      const form = (readings: Record<string, string>, goals: Record<string, string> = {}) => ({
        gallons: "20,000",
        readings,
        goals,
        chlorine: "liquid12" as const,
        acid: "muriatic31" as const,
        notes: "",
      });
      // Keys 600 ms apart: a tech reading the strip between digits.
      const keys = [
        form({ ch: "3" }),
        form({ ch: "32" }),
        form({ ch: "320" }),
        form({ ch: "3200" }),
        form({ ch: "3200" }, { ph: "7" }),
        form({ ch: "3200" }, { ph: "7." }),
        form({ ch: "3200" }, { ph: "7.6" }),
      ];
      for (const k of keys) {
        saver.change(k);
        vi.advanceTimersByTime(600);
      }
      expect(writes).not.toHaveBeenCalled();
      expect(kvWrites).toHaveLength(0);
      vi.advanceTimersByTime(400);
      expect(writes.mock.calls.filter(([t]) => t === "chemical_reading")).toHaveLength(1);
      expect(kvWrites).toEqual([["chemicals:goals", JSON.stringify({ ph: "7.6" })]]);
      expect(sync.get("chemical_reading", visitJob)).toMatchObject({
        ch: 3200,
        goals: { ph: 7.6 },
      });
      expect(problems).toEqual([null]);

      // Leaving the field (Next, Done) or the screen saves at once; nothing waiting, nothing sent.
      writes.mockClear();
      saver.change(form({ ch: "3200", fc: "3" }, { ph: "7.6" }));
      expect(saver.flush()).toBe(true);
      expect(sync.get("chemical_reading", visitJob)).toMatchObject({ fc: 3 });
      expect(saver.flush()).toBe(false);
      expect(writes.mock.calls.filter(([t]) => t === "chemical_reading")).toHaveLength(1);
      writes.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds, changes and removes chemicals, never writing a price", () => {
    addChemicals(
      company,
      job,
      pool.id,
      [
        {
          price_book_item_id: null,
          name: "Liquid chlorine",
          unit: "gal",
          reading_key: "fc",
          suggested_quantity: 0.5,
          quantity: 0.5,
          unit_price_cents: 800,
        },
        {
          price_book_item_id: null,
          name: "Chlorine tabs (3″)",
          unit: "tab",
          reading_key: null,
          suggested_quantity: null,
          quantity: 3,
          unit_price_cents: 250,
        },
      ],
      0,
      { customer_supplied: true, note: " In the floater " },
    );
    const rows = sync.list("chemical_addition", company, job) as unknown as {
      id: string;
      name: string;
      quantity: number;
      sort_order: number;
      note: string | null;
      customer_supplied: boolean;
      unit_price_cents?: number;
    }[];
    // The order they were added in (the list itself is in id order).
    rows.sort((a, b) => a.sort_order - b.sort_order);
    expect(rows.map((r) => [r.name, r.sort_order])).toEqual([
      ["Liquid chlorine", 0],
      ["Chlorine tabs (3″)", 1],
    ]);
    expect(rows[1]).toMatchObject({ note: "In the floater", customer_supplied: true });
    expect(rows.every((r) => r.unit_price_cents === undefined)).toBe(true);

    const tabs = rows[1]!;
    updateChemical(company, {
      ...(tabs as unknown as ChemicalAddition),
      price_book_item_id: null,
      unit: "tab",
      quantity: 4,
      customer_supplied: false,
      note: "",
    });
    expect(sync.get("chemical_addition", tabs.id)).toMatchObject({
      quantity: 4,
      customer_supplied: false,
      note: null,
    });
    removeChemical(company, tabs.id);
    expect(sync.list("chemical_addition", company, job)).toHaveLength(1);
    sync.stop();
  });
});
