import { describe, expect, it } from "vitest";
import {
  ROUTING_DEFAULTS,
  changeWithUndo,
  keptNote,
  localMinutes,
  moveJobChange,
  nothingMoved,
  partnerProblem,
  planDay,
  zonedMinutesToIso,
  type DriveFn,
  type LatLng,
  type PlanContext,
  type PlanJob,
} from "../src";

// Shared (two-tech) jobs in Optimize and hand moves (owner, 2026-10-24). The owner's day: Dana
// had Abby Navarro 8:00 AM, Ian Kerr 11:28 AM and Saguaro Pool Care 2:00 PM, all with Jake
// Turner, 1 hr 57 min of driving. Optimize said "Already the best order"; dragging Saguaro
// above Ian by hand saved 25 minutes.

const TZ = "America/Phoenix"; // UTC-7 all year
const DAY = "2026-10-21";
const at = (lng: number): LatLng => ({ lat: 0, lng });
const SHOP = at(0);
const ABBY = at(1);
const IAN = at(2);
const SAGUARO = at(3);
const OTHER = at(4);

const name = (p: LatLng | null) => (p ? String(p.lng) : "");
const legs: Record<string, number> = {};
const leg = (a: LatLng, b: LatLng, there: number, back = there) => {
  legs[`${name(a)}>${name(b)}`] = there;
  legs[`${name(b)}>${name(a)}`] = back;
};
leg(SHOP, ABBY, 20);
leg(ABBY, IAN, 45);
leg(IAN, SAGUARO, 35);
leg(SAGUARO, SHOP, 17);
leg(ABBY, SAGUARO, 15);
leg(SHOP, IAN, 30, 22);
leg(ABBY, OTHER, 10);
leg(OTHER, IAN, 15);
leg(OTHER, SAGUARO, 30);
leg(SHOP, OTHER, 25);
const drive: DriveFn = (a, b) =>
  !a || !b || name(a) === name(b) ? 0 : (legs[`${name(a)}>${name(b)}`] ?? 60);

const ctx: PlanContext = {
  timeZone: TZ,
  settings: { ...ROUTING_DEFAULTS, dayStart: "07:40", jobMinutes: 60 },
  depot: SHOP,
  today: "2026-10-19",
  nowMin: 7 * 60,
};

const time = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedMinutesToIso(DAY, h! * 60 + m!, TZ);
};
const clock = (iso: string | null | undefined) => (iso ? localMinutes(iso, TZ) : null);
const hm = (h: number, m = 0) => h * 60 + m;

const job = (
  id: string,
  place: LatLng,
  start: string,
  end: string,
  over: Partial<PlanJob> = {},
): PlanJob => ({
  id,
  status: "scheduled",
  assigned_user_id: "dana",
  second_tech_id: "jake",
  scheduled_start: time(start),
  scheduled_end: time(end),
  route_order: null,
  arrival_fixed: false,
  property: { latitude: place.lat, longitude: place.lng },
  ...over,
});

const abby = job("abby", ABBY, "08:00", "09:00", { route_order: 1 });
const ian = job("ian", IAN, "11:28", "12:28", { route_order: 2 });
const saguaro = job("saguaro", SAGUARO, "14:00", "15:00", { route_order: 3 });
const DANA = [abby, ian, saguaro];
const names = { dana: "Dana Owner", jake: "Jake Turner" };
/** Jake's other job, 9:30 to 10:30 AM, where Saguaro would land. */
const other = job("other", OTHER, "09:30", "10:30", {
  assigned_user_id: "jake",
  second_tech_id: null,
});
const JAKE = [abby, other, ian, saguaro];

/** A stop's time after Optimize: its new one, or its saved one when it kept it. */
const startOf = (r: ReturnType<typeof planDay>, id: string) =>
  clock(
    r.updates.find((u) => u.id === id)?.scheduled_start ??
      DANA.find((j) => j.id === id)?.scheduled_start,
  );
const orderOf = (r: ReturnType<typeof planDay>) =>
  [...r.updates]
    .filter((u) => u.route_order != null)
    .sort((a, b) => a.route_order! - b.route_order!)
    .map((u) => u.id);

describe("Optimize with shared jobs", () => {
  it("finds the owner's 25-minute-better order when the second tech is free", () => {
    const r = planDay(ctx, "dana", DAY, DANA, drive, {
      partners: [{ techId: "jake", jobs: DANA }],
      names,
    });
    expect(r.error).toBeUndefined();
    expect(orderOf(r)).toEqual(["abby", "saguaro", "ian"]);
    expect(r.message).toBe("Optimized · 25 min less driving");
    expect(r.detail).toBeUndefined();
    expect(r.unchanged).toBe(false);
    expect(startOf(r, "abby")).toBe(hm(8));
    expect(startOf(r, "saguaro")).toBe(hm(9, 15));
    expect(startOf(r, "ian")).toBe(hm(10, 50));
    // One job row: Jake's day moves with it, and nothing of his overlaps.
    const { updates } = changeWithUndo(r.updates, DANA);
    expect(updates.map((u) => u.id).sort()).toEqual(["ian", "saguaro"]);
  });

  it("keeps a shared stop whose new time runs into the second tech's day, and says so", () => {
    const r = planDay(ctx, "dana", DAY, DANA, drive, {
      partners: [{ techId: "jake", jobs: JAKE }],
      names,
    });
    expect(startOf(r, "saguaro")).toBe(hm(14));
    expect(orderOf(r)).toEqual(["abby", "saguaro", "ian"]);
    expect(startOf(r, "ian")).toBe(hm(15, 35));
    expect(r.message).toBe("Optimized · 25 min less driving");
    expect(r.detail).toBe("1 stop stayed: shared with Jake Turner.");
    // What moved fits Jake's day: only Ian did.
    const { updates } = changeWithUndo(r.updates, DANA);
    expect(updates.filter((u) => u.scheduled_start).map((u) => u.id)).toEqual(["ian"]);
    const ianMove = { id: "ian", location: IAN, startMin: hm(15, 35), durationMin: 60 };
    expect(partnerProblem(ctx, { techId: "jake", jobs: JAKE }, [ianMove], drive)).toBeNull();
  });

  it("says why nothing moved instead of “Already the best order”", () => {
    // Jake's day isn't known (a tech limited to their own jobs): shared jobs keep their times.
    const r = planDay(ctx, "dana", DAY, DANA, drive, { names });
    expect(r.unchanged).toBe(true);
    expect(r.message).toBe(
      "No change: all 3 stops are shared with Jake Turner, so their times stay.",
    );
    const one = planDay(ctx, "dana", DAY, [saguaro], drive, { names });
    expect(one.message).toBe("No change: the stop is shared with Jake Turner, so its time stays.");
  });

  it("names each reason with its count", () => {
    const mixed = [
      job("a", ABBY, "08:00", "09:00", { status: "in_progress", second_tech_id: null }),
      job("b", IAN, "11:28", "12:28", { lock_time: true, second_tech_id: null }),
      job("c", SAGUARO, "14:00", "15:00"),
    ];
    const r = planDay(ctx, "dana", DAY, mixed, drive, { names });
    expect(r.message).toBe(
      "No change: 3 stops stayed: 1 started, 1 time promised to the customer, 1 shared with Jake Turner.",
    );
    expect(
      keptNote(
        [
          { id: "a", reason: "shared", techId: "jake" },
          { id: "b", reason: "shared", techId: "jake" },
        ],
        names,
      ),
    ).toBe("2 stops stayed: shared with Jake Turner");
    expect(
      nothingMoved([
        { id: "a", reason: "time" },
        { id: "b", reason: "time" },
      ]),
    ).toBe("No change: both stops have times promised to the customer, so their times stay.");
    expect(nothingMoved([{ id: "a", reason: "shared" }])).toBe(
      "No change: the stop is shared with another tech, so its time stays.",
    );
  });

  it("keeps “Already the best order” for a day where every stop could move", () => {
    const solo = [
      job("a", ABBY, "08:00", "09:00", { second_tech_id: null }),
      job("b", SAGUARO, "09:15", "10:15", { second_tech_id: null }),
      job("c", IAN, "10:50", "11:50", { second_tech_id: null }),
    ];
    const r = planDay(ctx, "dana", DAY, solo, drive, { names });
    expect(r.message).toBe("Already the best order");
    expect(r.unchanged).toBe(true);
  });

  it("says “No change” with what stayed when the others are already in the best order", () => {
    const day = [
      job("a", ABBY, "08:00", "09:00", { second_tech_id: null }),
      job("b", SAGUARO, "09:15", "10:15", { second_tech_id: null }),
      job("c", IAN, "11:28", "12:28"),
    ];
    const r = planDay(ctx, "dana", DAY, day, drive, { names });
    expect(r.message).toBe("No change");
    expect(r.detail).toBe(
      "1 stop stayed: shared with Jake Turner. The rest are already in the best order.",
    );
  });

  it("moves a shared job on its second tech's day without taking the main tech's place", () => {
    const r = planDay(ctx, "jake", DAY, DANA, drive, {
      partners: [{ techId: "dana", jobs: DANA }],
      names,
    });
    expect(r.message).toBe("Optimized · 25 min less driving");
    expect(r.updates.every((u) => u.route_order === undefined)).toBe(true);
    expect(startOf(r, "saguaro")).toBe(hm(9, 15));
  });

  it("never moves a time promised to the customer, shared or not", () => {
    const promised = DANA.map((j) => (j.id === "saguaro" ? { ...j, lock_time: true } : j));
    const r = planDay(ctx, "dana", DAY, promised, drive, {
      partners: [{ techId: "jake", jobs: promised }],
      names,
    });
    expect(startOf(r, "saguaro")).toBe(hm(14));
    expect(r.detail).toBe("1 stop stayed: time promised to the customer.");
  });
});

describe("Moving a shared job by hand", () => {
  const move = (partnerDay?: PlanJob[]) =>
    moveJobChange(
      ctx,
      {
        job: ian,
        tech: "dana",
        date: DAY,
        index: 2,
        targetDay: DANA,
        fromDay: DANA,
        seesAll: true,
        userId: "dana",
        partnerDay,
        names,
      },
      drive,
    );

  it("says the second tech moved too when it fits their day", () => {
    const r = move(DANA);
    expect(r.error).toBeUndefined();
    expect(clock(r.updates[0]!.scheduled_start)).toBe(hm(15, 35));
    expect(r.message).toBe("Moved. Jake Turner’s visit moved too.");
    expect(r.confirm).toBeUndefined();
  });

  it("asks first when it runs into the second tech's day", () => {
    const late = job("late", OTHER, "16:00", "16:45", {
      assigned_user_id: "jake",
      second_tech_id: null,
    });
    const r = move([...DANA, late]);
    expect(r.confirm).toEqual({
      title: "Move Jake Turner’s Visit Too?",
      message: "This also moves Jake Turner to 3:35 PM, which overlaps Jake’s 4:00 PM job.",
      action: "Move Anyway",
    });
    // The rows are the same either way: Move Anyway saves them.
    expect(r.updates).toEqual(move(DANA).updates);
  });

  it("can't ask without the second tech's day, but still says they moved", () => {
    const r = move(undefined);
    expect(r.confirm).toBeUndefined();
    expect(r.message).toBe("Moved. Jake Turner’s visit moved too.");
  });

  it("says plain “Moved.” for a job with one tech", () => {
    const solo = { ...ian, second_tech_id: null };
    const r = moveJobChange(
      ctx,
      {
        job: solo,
        tech: "dana",
        date: DAY,
        index: 2,
        targetDay: [abby, solo, saguaro],
        fromDay: [abby, solo, saguaro],
        seesAll: true,
        userId: "dana",
        partnerDay: DANA,
        names,
      },
      drive,
    );
    expect(r.message).toBe("Moved.");
  });

  it("finds overtime and an early start on the second tech's day", () => {
    const p = { techId: "jake", jobs: [other] };
    expect(
      partnerProblem(
        ctx,
        p,
        [{ id: "n", location: SAGUARO, startMin: hm(16, 30), durationMin: 60 }],
        drive,
      ),
    ).toEqual({ jobId: "n", kind: "overtime" });
    expect(
      partnerProblem(
        ctx,
        p,
        [{ id: "n", location: IAN, startMin: hm(7, 45), durationMin: 30 }],
        drive,
      ),
    ).toEqual({ jobId: "n", kind: "early" });
    expect(
      partnerProblem(
        ctx,
        p,
        [{ id: "n", location: IAN, startMin: hm(9, 0), durationMin: 30 }],
        drive,
      ),
    ).toEqual({ jobId: "n", kind: "overlap", otherId: "other", otherMin: hm(9, 30) });
  });
});
