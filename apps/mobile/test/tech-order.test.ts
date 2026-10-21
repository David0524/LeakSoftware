import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REORDER_TECHS, moveInList, scheduleOrder } from "@leakbook/core";
import { LocalStore, type Uploader } from "@leakbook/sync";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Reorder Techs (owner, 2026-10-21; docs/design/2026-10-21-tech-order.md), as Android does it:
// the sheet's order is saved through the sync layer (row and outbox), only for places that
// changed, and the Schedule reads it back with core scheduleOrder.

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
const { saveTechOrder } = await import("../src/lib/techOrder");

const company = "0190b6b0-0000-7000-8000-000000000001";

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

const member = (id: string, name: string, schedule_order: number | null = null) => ({
  membership_id: `m-${id}`,
  user_id: id,
  name,
  status: "active" as const,
  schedule_order,
});

describe("Reorder Techs on Android", () => {
  it("saves the new order through the sync layer and the Schedule follows it", () => {
    const sync = service();
    const team = [member("me", "Owner"), member("ana", "Ana"), member("ben", "Ben")];
    for (const m of team)
      sync.write("membership", m.membership_id, company, {
        user_id: m.user_id,
        role: "tech",
        status: "active",
        schedule_order: null,
      });
    // No saved order yet: Me first, then A to Z.
    const shown = scheduleOrder(team, "me");
    expect(shown.map((t) => t.user_id)).toEqual(["me", "ana", "ben"]);

    // Move Owner down to last, then Done.
    const ordered = moveInList(
      shown.map((t) => t.membership_id),
      0,
      2,
    );
    const writes = saveTechOrder(sync, company, team, ordered);
    expect(writes).toEqual([
      { id: "m-ana", schedule_order: 1 },
      { id: "m-ben", schedule_order: 2 },
      { id: "m-me", schedule_order: 3 },
    ]);
    expect(sync.get("membership", "m-me")?.schedule_order).toBe(3);
    expect(sync.hasPendingWrites("membership", "m-ana")).toBe(true);

    // Read back as useTeam does: the saved order wins over Me first.
    const saved = team.map((m) => ({
      ...m,
      schedule_order: sync.get("membership", m.membership_id)?.schedule_order as number,
    }));
    expect(scheduleOrder(saved, "me").map((t) => t.user_id)).toEqual(["ana", "ben", "me"]);

    // Done again with nothing moved writes nothing.
    expect(saveTechOrder(sync, company, saved, ordered)).toEqual([]);
    sync.stop();
  });

  it("uses the website's words", () => {
    expect([REORDER_TECHS.action, REORDER_TECHS.done, REORDER_TECHS.cancel]).toEqual([
      "Reorder Techs",
      "Done",
      "Cancel",
    ]);
  });
});
