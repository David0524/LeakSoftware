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
const { canReorderDay, dropPlace, reorderChange, reorderRows, todayStops, writeJobs } =
  await import("../src/lib/todayReorder");
type ReorderStop = import("../src/lib/todayReorder").ReorderStop;
type TodayMove = import("@leakbook/core").TodayMove;

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
  to: TodayMove,
  who: { userId?: string; seesAll?: boolean; techId?: string } = {},
) =>
  reorderChange(
    ctx,
    {
      stops,
      jobId,
      to,
      techId: who.techId ?? ann,
      seesAll: who.seesAll ?? false,
      userId: who.userId ?? ann,
    },
    drive,
  );

describe("which stops can move (the shared rule, core todayStopLock and todayMoves)", () => {
  it("locks started stops, promised times, done stops, and two-tech jobs on every day", () => {
    const lock = (over: Partial<ReorderStop>) =>
      reorderRows([stop("a", "09:00", over)], today, TZ)[0]!.lock;
    expect(lock({ status: "in_progress" })).toBe("Started");
    expect(lock({ arrival_fixed: true })).toBe("Locked");
    expect(lock({ lock_time: true })).toBe("Time locked");
    // A day lock stays on its day but may change its place in it.
    expect(lock({ lock_day: true })).toBeNull();
    expect(lock({ stop_done_on: today })).toBe("Done");
    expect(lock({ status: "done" })).toBe("Done");
    // The main tech's day too, not only the second tech's.
    expect(lock({ second_tech_id: bob })).toBe("Two techs");
    expect(lock({})).toBeNull();
    expect(todayStops([stop("s", "09:00", { status: "in_progress" })], today, TZ)[0]).toEqual({
      id: "s",
      done: false,
      lock: "Started",
      started: true,
    });
  });

  it("offers Move Up only below a started stop, and nothing that would do nothing", () => {
    const rows = reorderRows(
      [
        stop("x", "08:00", { stop_done_on: today }),
        stop("s", "09:00", { status: "in_progress" }),
        stop("a", "10:00"),
        stop("p", "11:00", { arrival_fixed: true }),
        stop("b", "12:00"),
      ],
      today,
      TZ,
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.x).toMatchObject({ canUp: false, canDown: false, canLater: false });
    expect(by.s).toMatchObject({ canUp: false, canDown: false, canLater: false });
    // Right after the started stop: nowhere to go up to.
    expect(by.a).toMatchObject({ lock: null, canUp: false, canDown: true, canLater: true });
    expect(by.p?.lock).toBe("Locked");
    expect(by.p).toMatchObject({ canUp: false, canDown: false });
    // The last stop still to do: up only (it can go above a promised one), no Do Later.
    expect(by.b).toMatchObject({ canUp: true, canDown: false, canLater: false });
  });

  it("ignores done stops when counting places", () => {
    // A stop done out of order sits in the middle: the next stop can still move up past it.
    const rows = reorderRows(
      [stop("a", "09:00"), stop("x", "10:30", { stop_done_on: today }), stop("b", "12:00")],
      today,
      TZ,
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.b).toMatchObject({ canUp: true, canDown: false, canLater: false });
    expect(by.a).toMatchObject({ canUp: false, canDown: true, canLater: true });
  });
});

describe("dragging", () => {
  it("lands at a place among the stops still to do, before the row under it", () => {
    const stops = [stop("x", "08:00", { stop_done_on: today }), ...day()];
    expect(dropPlace(stops, "d", "b", today)).toBe(1);
    expect(dropPlace(stops, "a", null, today)).toBe(3);
    // Before the done stop: the first place to do.
    expect(dropPlace(stops, "d", "x", today)).toBe(0);
    // Where it already is.
    expect(dropPlace(stops, "b", "c", today)).toBeNull();
    expect(dropPlace(stops, "d", null, today)).toBeNull();
  });
});

describe("the move", () => {
  it("Do Later puts the stop after every stop still to do and says so", () => {
    const stops = day();
    const change = move(stops, "a", "later");
    expect(change.error).toBeUndefined();
    // No clock times (owner, 2026-10-21).
    expect(change.message).toBe("Moved.");
    expect(orderAfter(stops, change.updates)).toEqual(["b", "c", "d", "a"]);
    // Same tech, same day.
    expect(change.updates.find((u) => u.id === "a")?.scheduled_start?.startsWith(today)).toBe(true);
    expect(move(stops, "d", "later").error).toBe("It’s already there.");
  });

  it("Move Up and Move Down swap with the stop next to it; a drag goes to its place", () => {
    const stops = day();
    expect(orderAfter(stops, move(stops, "c", "up").updates)).toEqual(["a", "c", "b", "d"]);
    expect(orderAfter(stops, move(stops, "b", "down").updates)).toEqual(["a", "c", "b", "d"]);
    expect(orderAfter(stops, move(stops, "d", 0).updates)).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps promised and started stops where they are", () => {
    const stops = [
      stop("s", "08:00", { status: "in_progress" }),
      stop("a", "09:30"),
      stop("p", "11:00", { arrival_fixed: true }),
      stop("b", "12:30"),
    ];
    const change = move(stops, "a", "later");
    expect(change.updates.find((u) => u.id === "s")?.scheduled_start).toBeUndefined();
    expect(change.updates.find((u) => u.id === "p")?.scheduled_start).toBeUndefined();
    expect(orderAfter(stops, change.updates)).toEqual(["s", "p", "b", "a"]);
    expect(move(stops, "s", "later").error).toBe("Started, so it stays where it is.");
    expect(move(stops, "p", "later").error).toBe("Locked, so it stays where it is.");
    expect(move(stops, "b", 0).updates.length).toBeGreaterThan(0);
    // Nothing goes above the started stop: place 0 is right after it.
    expect(orderAfter(stops, move(stops, "b", 0).updates)[0]).toBe("s");
  });

  it("leaves stops done for the day out of the move", () => {
    const stops = [stop("x", "08:00", { stop_done_on: today }), ...day()];
    const change = move(stops, "a", "later");
    expect(change.updates.find((u) => u.id === "x")).toBeUndefined();
    expect(orderAfter(stops, change.updates)).toEqual(["x", "b", "c", "d", "a"]);
    expect(move(stops, "x", "later").error).toBe("This stop is done, so it stays where it is.");
  });

  it("won't move a two-tech job, on either tech's day", () => {
    const stops = [stop("a", "09:00", { second_tech_id: bob }), stop("b", "10:30")];
    expect(move(stops, "a", "later").error).toBe("Two techs, so it stays where it is.");
  });

  it("techs move only their own day; owners and admins any day they view", () => {
    const stops = day();
    expect(canReorderDay({ manager: false, me: bob, techId: ann })).toBe(false);
    expect(canReorderDay({ manager: false, me: ann, techId: ann })).toBe(true);
    expect(canReorderDay({ manager: true, me: owner, techId: ann })).toBe(true);
    expect(move(stops, "a", "later", { userId: bob }).error).toMatch(/only your own jobs/);
    const byOwner = move(stops, "a", "later", { userId: owner, seesAll: true });
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

  it("saves only what changes, and Undo writes back the saved values of those fields", () => {
    const sync = service();
    const stops = day().map((s, i) => ({ ...s, route_order: i + 1 }));
    for (const { id, property: _p, ...values } of stops)
      sync.write("job", id, company, { ...values, type: "detection" });
    const before = new Map(stops.map((s) => [s.id, fields(sync.get("job", s.id))]));

    const change = move(stops, "a", "later");
    // Unchanged fields and rows are left out (core changeWithUndo).
    for (const u of change.updates) {
      const was = stops.find((s) => s.id === u.id)! as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(u)) if (k !== "id") expect(v).not.toEqual(was[k]);
    }
    expect(change.undo.map((u) => u.id)).toEqual(change.updates.map((u) => u.id));
    expect(change.updates.find((u) => u.id === "a")).not.toHaveProperty("assigned_user_id");

    writeJobs(sync, company, change.updates);
    expect(sync.get("job", "a")?.route_order).toBe(4);
    expect(sync.get("job", "a")?.scheduled_start).not.toBe(before.get("a")?.scheduled_start);
    // The move went to the outbox with the rows.
    expect(sync.hasPendingWrites("job", "a")).toBe(true);

    writeJobs(sync, company, change.undo);
    for (const s of stops) expect(fields(sync.get("job", s.id))).toEqual(before.get(s.id));
    // Fields the move doesn't write are left alone.
    expect(sync.get("job", "a")?.type).toBe("detection");
    sync.stop();
  });

  it("a value the job never had comes back empty", () => {
    const stops = day();
    const change = move(stops, "a", "later");
    // route_order was null on every stop: Undo puts null back.
    expect(change.undo.find((u) => u.id === "a")?.route_order).toBeNull();
  });
});
