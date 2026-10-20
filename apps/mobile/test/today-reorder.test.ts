import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inRouteOrder, routingSettings, type PlanContext, type JobChange } from "@leakbook/core";
import { LocalStore, type Uploader } from "@leakbook/sync";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md): Do Later
// and Reorder are the Schedule's move, worked out on the phone and saved through the sync layer;
// Undo writes back the saved values of every row the move changed.

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
const {
  actionPlace,
  canReorderDay,
  dropPlace,
  reorderChange,
  reorderRows,
  saveMove,
  snapshotJobs,
  stopLock,
  writeJobs,
} = await import("../src/lib/todayReorder");
type ReorderStop = import("../src/lib/todayReorder").ReorderStop;

const TZ = "America/Phoenix"; // UTC-7 all year
const today = "2026-10-20";
const company = "0190b6b0-0000-7000-8000-000000000001";
const ann = "0190b6b0-0000-7000-8000-0000000000a1";
const bob = "0190b6b0-0000-7000-8000-0000000000b1";
const owner = "0190b6b0-0000-7000-8000-0000000000c1";

const ctx: PlanContext = {
  timeZone: TZ,
  settings: routingSettings({}),
  depot: null,
  today,
  nowMin: 7 * 60,
};
const drive = () => 15;

/** A stop at `hh:mm` Phoenix time, an hour long. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 20, h! + 7, m!)).toISOString();
};
function stop(id: string, hhmm: string, over: Partial<ReorderStop> = {}): ReorderStop {
  const start = at(hhmm);
  return {
    id,
    status: "scheduled",
    assigned_user_id: ann,
    second_tech_id: null,
    scheduled_start: start,
    scheduled_end: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
    route_order: null,
    arrival_fixed: false,
    property: null,
    stop_done_on: null,
    ...over,
  };
}

/** The day after saving `updates`, in route order (ids). */
function orderAfter(stops: ReorderStop[], updates: JobChange[]): string[] {
  const byId = new Map(updates.map((u) => [u.id, u]));
  return inRouteOrder(stops.map((s) => ({ ...s, ...byId.get(s.id) }) as ReorderStop)).map(
    (s) => s.id,
  );
}

const day = () => [stop("a", "09:00"), stop("b", "10:30"), stop("c", "12:00"), stop("d", "13:30")];
const move = (
  stops: ReorderStop[],
  jobId: string,
  place: number,
  who: { userId?: string; seesAll?: boolean; techId?: string } = {},
) =>
  reorderChange(
    ctx,
    {
      stops,
      jobId,
      place,
      techId: who.techId ?? ann,
      seesAll: who.seesAll ?? false,
      userId: who.userId ?? ann,
    },
    drive,
  );

describe("which stops can move", () => {
  it("locks started stops, promised times, done stops, and a second tech's job", () => {
    expect(stopLock(stop("a", "09:00", { status: "in_progress" }), ann, today, TZ)).toEqual({
      kind: "started",
      label: "Started",
    });
    const promised = stopLock(stop("a", "09:00", { arrival_fixed: true }), ann, today, TZ);
    expect(promised?.kind).toBe("promised");
    expect(promised?.label).toMatch(/^Promised for 9:00\sAM$/u);
    expect(stopLock(stop("a", "09:00", { stop_done_on: today }), ann, today, TZ)?.kind).toBe(
      "done",
    );
    expect(stopLock(stop("a", "09:00", { status: "done" }), ann, today, TZ)?.kind).toBe("done");
    expect(
      stopLock(stop("a", "09:00", { assigned_user_id: bob, second_tech_id: ann }), ann, today, TZ)
        ?.kind,
    ).toBe("second");
    expect(stopLock(stop("a", "09:00"), ann, today, TZ)).toBeNull();
  });

  it("offers Move Up only below the last started or done stop, Move Down and Do Later above the last", () => {
    const rows = reorderRows(
      [
        stop("x", "08:00", { stop_done_on: today }),
        stop("s", "09:00", { status: "in_progress" }),
        stop("a", "10:00"),
        stop("p", "11:00", { arrival_fixed: true }),
        stop("b", "12:00"),
      ],
      ann,
      today,
      TZ,
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.x).toMatchObject({ canUp: false, canDown: false, canLater: false });
    expect(by.s).toMatchObject({ canUp: false, canDown: false, canLater: false });
    // Right after the started stop: nowhere to go up to.
    expect(by.a).toMatchObject({ lock: null, canUp: false, canDown: true, canLater: true });
    expect(by.p?.lock?.kind).toBe("promised");
    expect(by.p).toMatchObject({ canUp: false, canDown: false });
    // The last stop: up only (it can go above a promised one), no Do Later.
    expect(by.b).toMatchObject({ canUp: true, canDown: false, canLater: false });
  });
});

describe("places", () => {
  it("Do Later is past the last stop; Move Up and Move Down are one place", () => {
    // Four stops, the second one: three others.
    expect(actionPlace(4, 1, "later")).toBe(3);
    expect(actionPlace(4, 1, "up")).toBe(0);
    expect(actionPlace(4, 1, "down")).toBe(2);
    expect(actionPlace(4, 3, "down")).toBe(3);
    expect(actionPlace(4, 0, "up")).toBe(0);
  });

  it("a drop lands before the stop under it, and never ahead of a started one", () => {
    const stops = [stop("s", "08:00", { status: "in_progress" }), ...day()];
    expect(dropPlace(stops, "d", "b", ann, today, TZ)).toBe(2);
    expect(dropPlace(stops, "d", null, ann, today, TZ)).toBe(4);
    expect(dropPlace(stops, "d", "s", ann, today, TZ)).toBe(1);
  });
});

describe("the move", () => {
  it("Do Later puts the stop after every stop still to do and says when", () => {
    const stops = day();
    const change = move(stops, "a", actionPlace(4, 0, "later"));
    expect(change.error).toBeUndefined();
    expect(change.message).toMatch(/^Moved to \d{1,2}:\d{2}\sPM\./u);
    expect(orderAfter(stops, change.updates)).toEqual(["b", "c", "d", "a"]);
    // Same tech, same day.
    expect(change.updates[0]).toMatchObject({ id: "a", assigned_user_id: ann });
    expect(
      change.updates.every((u) => !u.scheduled_start || u.scheduled_start.startsWith(today)),
    ).toBe(true);
  });

  it("Move Up and Move Down swap with the stop next to it", () => {
    const stops = day();
    expect(orderAfter(stops, move(stops, "c", actionPlace(4, 2, "up")).updates)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
    expect(orderAfter(stops, move(stops, "b", actionPlace(4, 1, "down")).updates)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("keeps promised and started stops where they are", () => {
    const stops = [
      stop("s", "08:00", { status: "in_progress" }),
      stop("a", "09:30"),
      stop("p", "11:00", { arrival_fixed: true }),
      stop("b", "12:30"),
    ];
    const change = move(stops, "a", actionPlace(4, 1, "later"));
    const s = change.updates.find((u) => u.id === "s");
    const p = change.updates.find((u) => u.id === "p");
    expect(s?.scheduled_start).toBeUndefined();
    expect(p?.scheduled_start).toBeUndefined();
    expect(orderAfter(stops, change.updates)).toEqual(["s", "p", "b", "a"]);
    expect(move(stops, "s", 3).error).toMatch(/started/);
    expect(move(stops, "p", 3).error).toMatch(/^Promised for 11:00\sAM/u);
  });

  it("doesn't retime a stop already done for the day", () => {
    const stops = [stop("x", "08:00", { stop_done_on: today }), ...day()];
    const change = move(stops, "a", actionPlace(5, 1, "later"));
    expect(change.updates.find((u) => u.id === "x")?.scheduled_start).toBeUndefined();
    expect(orderAfter(stops, change.updates)).toEqual(["x", "b", "c", "d", "a"]);
    expect(move(stops, "x", 4).error).toMatch(/done/);
  });

  it("techs move only their own day; owners and admins any day they view", () => {
    const stops = day();
    expect(canReorderDay({ manager: false, me: bob, techId: ann })).toBe(false);
    expect(canReorderDay({ manager: false, me: ann, techId: ann })).toBe(true);
    expect(canReorderDay({ manager: true, me: owner, techId: ann })).toBe(true);
    expect(move(stops, "a", 3, { userId: bob }).error).toMatch(/only your own jobs/);
    const byOwner = move(stops, "a", 3, { userId: owner, seesAll: true });
    expect(byOwner.error).toBeUndefined();
    expect(orderAfter(stops, byOwner.updates)).toEqual(["b", "c", "d", "a"]);
  });
});

describe("saving and Undo", () => {
  function service() {
    const kv = new Map<string, string>();
    return new SyncService(
      LocalStore.open(memoryDb()),
      {
        auth: { getSession: async () => ({ data: { session: null } }) },
      } as never as SupabaseClient,
      {
        get: (k) => kv.get(k) ?? null,
        set: (k, v) => void kv.set(k, v),
        remove: (k) => void kv.delete(k),
      },
      {} as Uploader,
    );
  }
  const fields = (r: Record<string, unknown> | undefined) => ({
    route_order: r?.route_order,
    scheduled_start: r?.scheduled_start,
    scheduled_end: r?.scheduled_end,
    status: r?.status,
    assigned_user_id: r?.assigned_user_id,
    arrival_fixed: r?.arrival_fixed,
  });

  it("Undo writes back the exact saved values of every row the move changed", () => {
    const sync = service();
    const stops = day().map((s, i) => ({ ...s, route_order: i + 1 }));
    for (const { id, property: _p, ...values } of stops)
      sync.write("job", id, company, { ...values, type: "detection" });
    const before = new Map(stops.map((s) => [s.id, fields(sync.get("job", s.id))]));

    const change = move(stops, "a", 3);
    const undo = saveMove(sync, company, change.updates);
    expect(undo.map((u) => u.id).sort()).toEqual(change.updates.map((u) => u.id).sort());
    expect(sync.get("job", "a")?.route_order).toBe(4);
    expect(sync.get("job", "a")?.scheduled_start).not.toBe(before.get("a")?.scheduled_start);
    // The move went to the outbox with the rows.
    expect(sync.hasPendingWrites("job", "a")).toBe(true);

    writeJobs(sync, company, undo);
    for (const s of stops) expect(fields(sync.get("job", s.id))).toEqual(before.get(s.id));
    // Fields the move doesn't write are left alone.
    expect(sync.get("job", "a")?.type).toBe("detection");
    sync.stop();
  });

  it("a field the row never had comes back empty (arrival_fixed off)", () => {
    const sync = service();
    sync.write("job", "a", company, { status: "scheduled" });
    expect(
      snapshotJobs(sync, [
        { id: "a", route_order: 2, arrival_fixed: true, scheduled_start: at("10:00") },
      ]),
    ).toEqual([{ id: "a", route_order: null, arrival_fixed: false, scheduled_start: null }]);
    sync.stop();
  });

  it("takes the snapshot before writing", () => {
    const sync = service();
    sync.write("job", "a", company, { route_order: 1 });
    const undo = saveMove(sync, company, [{ id: "a", route_order: 3 }]);
    expect(undo).toEqual([{ id: "a", route_order: 1 }]);
    expect(sync.get("job", "a")?.route_order).toBe(3);
    sync.stop();
  });
});
