import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// The item page: an answer and the notes saved from the same screen before it re-renders
// (both thought there was no result yet) end up on one result, not two.

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: () => () => {} },
}));
vi.mock("expo-file-system", () => ({ Paths: { availableDiskSpace: 1e12 } }));
vi.mock("../src/lib/media", () => ({ deleteAllMedia: () => {} }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));
vi.mock("../src/data/hooks", () => ({ useRows: () => [], useJobRows: () => [] }));

const { SyncService } = await import("../src/lib/sync-service");
const { saveChecklistResult, addCustomItem } = await import("../src/data/inspection");

const company = "0190b6b0-0000-7000-8000-000000000001";
const job = "0190b6b0-0000-7000-8000-000000000002";
const item = "0190b6b0-0000-7000-8000-000000000003";

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

describe("saving an item's result", () => {
  it("two saves that both saw no result keep one result with both changes", () => {
    const sync = service();
    // Notes saved when the field is left, then the answer, from the same render.
    saveChecklistResult(sync, company, job, item, undefined, { notes: "cracked tile" });
    saveChecklistResult(sync, company, job, item, undefined, {
      status: "inspected",
      outcome: "leaking",
    });
    const rows = sync.list("checklist_item_result", company, job) as unknown as {
      id: string;
      notes?: string;
      outcome?: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ notes: "cracked tile", outcome: "leaking" });
    sync.stop();
  });
  it("a notes save changes only the notes", () => {
    const sync = service();
    saveChecklistResult(sync, company, job, item, undefined, {
      status: "inspected",
      outcome: "leaking",
    });
    const [r] = sync.list("checklist_item_result", company, job) as unknown as { id: string }[];
    // The answer changed elsewhere (the checklist) after the item page last rendered.
    sync.write("checklist_item_result", r!.id, company, { status: "inspected", outcome: "ok" });
    saveChecklistResult(sync, company, job, item, r as never, { notes: "fine" });
    expect(sync.get("checklist_item_result", r!.id)).toMatchObject({
      outcome: "ok",
      notes: "fine",
    });
    sync.stop();
  });
});

describe("Where saved after the answer changed", () => {
  it("isn't written back on an item no longer Leaking or Attention", async () => {
    const { saveWhere } = await import("../src/data/inspection");
    const sync = service();
    saveChecklistResult(sync, company, job, item, undefined, {
      status: "inspected",
      outcome: "leaking",
    });
    saveWhere(sync, company, job, item, "under the deck");
    const [r] = sync.list("checklist_item_result", company, job) as unknown as {
      id: string;
      location_text?: string | null;
    }[];
    expect(r!.location_text).toBe("under the deck");
    // Not Leaking clears Where; the field going away then saves what was typed.
    saveChecklistResult(sync, company, job, item, r as never, {
      status: "inspected",
      outcome: "ok",
      location_text: null,
    });
    saveWhere(sync, company, job, item, "under the deck, left");
    expect(sync.get("checklist_item_result", r!.id)).toMatchObject({ location_text: null });
    sync.stop();
  });
});

describe("Add Item (a name typed in for one job)", () => {
  const stand = {
    id: "0190b6b0-0000-7000-8000-0000000000a1",
    company_id: company,
    key: "custom_leak",
    name: "Added on the job",
    allows_multiple: true,
    default_count: 0,
    applies_to: "both",
    methods: ["Visual"],
    sort_order: 9000,
    active: false,
  } as never;
  type Comp = { id: string; label: string; instance_number: number; component_type_id: string };
  it("writes a component with the typed name and a pending checklist row", () => {
    const sync = service();
    const id = addCustomItem(sync, company, job, stand, [], "  Cracked   deck drain ");
    const comps = sync.list("job_component", company, job) as unknown as Comp[];
    expect(comps).toHaveLength(1);
    expect(comps[0]).toMatchObject({
      id,
      label: "Cracked deck drain",
      instance_number: 1,
      component_type_id: (stand as { id: string }).id,
    });
    const results = sync.list("checklist_item_result", company, job) as unknown as {
      job_component_id: string;
      status: string;
    }[];
    expect(results).toEqual([expect.objectContaining({ job_component_id: id, status: "pending" })]);
    sync.stop();
  });
  it("numbers the next one after the last and ignores a blank name", () => {
    const sync = service();
    addCustomItem(sync, company, job, stand, [], "Dead frog");
    const existing = sync.list("job_component", company, job) as never;
    expect(addCustomItem(sync, company, job, stand, existing, "   ")).toBeNull();
    addCustomItem(sync, company, job, stand, existing, "Loose ladder");
    const comps = (sync.list("job_component", company, job) as unknown as Comp[]).sort(
      (a, b) => a.instance_number - b.instance_number,
    );
    expect(comps.map((c) => [c.instance_number, c.label])).toEqual([
      [1, "Dead frog"],
      [2, "Loose ladder"],
    ]);
    sync.stop();
  });
});
