import { stopDone, type HeroStop, type Job, type TodayHero } from "@leakbook/core";

// Today's card for the stop you're on (owner, 2026-10-20; docs/plans/today-hero.md), the parts
// with no React: the card and Android's current-stop notification both feed core todayHero
// from the same stops, so they always pick the same one.

/** A stop as todayHero reads it, from a job with its property and customer. */
export interface HeroSource extends Pick<
  Job,
  "id" | "type" | "status" | "stop_done_on" | "scheduled_start" | "on_my_way_at" | "arrive_at"
> {
  customer?: { name?: string | null } | null;
  property?: { address_line1?: string | null; access_notes?: string | null } | null;
}

/** A started stop's checklist: answered and total (the Live Activity's "4 of 9"). */
export interface ChecklistCount {
  done: number;
  total: number;
}

/**
 * The day's stops (route order) for todayHero. Only the card's stop needs its checklist count,
 * so the rest read 0 of 0, as the website does.
 */
export function heroStops(
  stops: HeroSource[],
  counts: ReadonlyMap<string, ChecklistCount> = new Map(),
): HeroStop[] {
  return stops.map((j) => ({
    id: j.id,
    type: j.type,
    status: j.status,
    stop_done_on: j.stop_done_on ?? null,
    scheduled_start: j.scheduled_start ?? null,
    on_my_way_at: j.on_my_way_at ?? null,
    arrive_at: j.arrive_at ?? null,
    customer: j.customer?.name ?? "Customer",
    address: j.property?.address_line1 ?? null,
    access: j.property?.access_notes ?? null,
    checklistDone: counts.get(j.id)?.done ?? 0,
    checklistTotal: counts.get(j.id)?.total ?? 0,
  }));
}

/**
 * The checklist count from useChecklistProgress: a pool inspection counts only the questions
 * its gates leave open (2026-10-20), other jobs every checklist row.
 */
export function checklistCount(progress: {
  tally: {
    pass: number;
    attention: number;
    leaking: number;
    notApplicable: number;
    pending: number;
  };
  inspection: { total: number; answered: number } | null;
}): ChecklistCount {
  const { tally, inspection } = progress;
  const total =
    inspection?.total ??
    tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending;
  return { done: inspection?.answered ?? total - tally.pending, total };
}

/**
 * On My Way, kept on the job (decision 2): when it was sent, and the arrival it promised (now
 * plus the drive, at least 5 minutes, as the text says). Synced, so the website, the office and
 * a second phone show "On the way, arriving 9:42".
 */
export function onMyWayValues(
  now: Date,
  driveMin: number,
): { on_my_way_at: string; arrive_at: string } {
  return {
    on_my_way_at: now.toISOString(),
    arrive_at: new Date(now.getTime() + Math.max(5, driveMin) * 60_000).toISOString(),
  };
}

/** Start Job from the card: in progress, with when it started (as the job page). */
export function startJobValues(
  job: Pick<Job, "started_at">,
  now: Date,
): { status: "in_progress"; started_at?: string } {
  return job.started_at
    ? { status: "in_progress" }
    : { status: "in_progress", started_at: now.toISOString() };
}

/**
 * The list under the card: done stops folded into one "N done" row, the rest in route order,
 * and the card's stop marked Now (none while the card shows a stop just done, or the day done).
 */
export function todayList<S extends HeroSource>(
  stops: S[],
  today: string,
  hero: Pick<TodayHero, "moment" | "stopId"> | null,
): { done: S[]; rest: S[]; nowId: string | null } {
  const done = stops.filter((s) => stopDone(s, today));
  const rest = stops.filter((s) => !stopDone(s, today));
  const nowId = hero && hero.moment !== "done" && hero.moment !== "day_done" ? hero.stopId : null;
  return { done, rest, nowId };
}
