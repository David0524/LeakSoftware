// What the app already knows, so a tech types less (owner, 2026-10-26: "pre-fill what the app
// already knows"). Hints, never values: a reading is never filled in for the tech (a made-up
// reading is worse than none); its last value shows as a hint ("Last 7.6"). The chemicals a pool
// usually gets go first in Add Chemical, last visit's notes sit under the visit's notes, and a
// customer's usual tech and time start a new job's fields. No I/O. Ported to
// apps/ios/Sources/SundeckCore/Prefill.swift and checked by its fixtures.

import type { ChemicalItem } from "./chemical-additions";
import type { ReadingKey } from "./chemistry";
import { formatDay } from "./office";
import { localDate } from "./job-list";
import { localMinutes } from "./route-plan";
import { minutesToClock } from "./routing";

const READING_KEYS: ReadingKey[] = ["fc", "ph", "ta", "ch", "cya", "salt"];

/** A reading from the pool's log, as the hints read it. */
export interface HintReading {
  job_id?: string | null;
  recorded_at: string;
  notes?: string | null;
}

/**
 * The pool's last reading from another visit (not this one), newest first by time. Null when the
 * pool has none.
 */
export function lastOtherReading<T extends HintReading>(
  readings: T[],
  jobId: string | null | undefined,
): T | null {
  let best: T | null = null;
  let at = -Infinity;
  for (const r of readings) {
    if (jobId && r.job_id === jobId) continue;
    const t = Date.parse(r.recorded_at);
    const when = Number.isFinite(t) ? t : -Infinity;
    if (best === null || when > at) {
      best = r;
      at = when;
    }
  }
  return best;
}

/**
 * "Last 7.6", "Last 3", under an empty reading box: the value from the pool's last visit, for each
 * reading it has. pH shows one decimal, the rest as they were typed.
 */
export function readingHints(
  last: Partial<Record<ReadingKey, number | null>> | null | undefined,
): Partial<Record<ReadingKey, string>> {
  const out: Partial<Record<ReadingKey, string>> = {};
  if (!last) return out;
  for (const k of READING_KEYS) {
    const v = last[k];
    if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
    out[k] = `Last ${k === "ph" ? Number(v).toFixed(1) : Number(v)}`;
  }
  return out;
}

/**
 * The chemicals this pool usually gets: price book item ids from its past additions, most visits
 * first, then the most recent. An item added twice in one visit counts once. At most `limit`.
 */
export function usualChemicalIds(
  past: {
    price_book_item_id?: string | null;
    job_id?: string | null;
    added_at: string;
  }[],
  limit = 4,
): string[] {
  const visits = new Map<string, { jobs: Set<string>; latest: number }>();
  past.forEach((a, i) => {
    const id = a.price_book_item_id;
    if (!id) return;
    const e = visits.get(id) ?? { jobs: new Set<string>(), latest: -Infinity };
    e.jobs.add(a.job_id ?? `row-${i}`);
    const t = Date.parse(a.added_at);
    if (Number.isFinite(t) && t > e.latest) e.latest = t;
    visits.set(id, e);
  });
  return [...visits.entries()]
    .sort((a, b) => b[1].jobs.size - a[1].jobs.size || b[1].latest - a[1].latest)
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * Add Chemical's list: the pool's usual chemicals first, in their own group, then the rest in
 * price book order. A search filters both groups. `items` are the shop's chemicals (core
 * `chemicalItems`).
 */
export function pickList(
  items: ChemicalItem[],
  usualIds: string[],
  query = "",
): { usual: ChemicalItem[]; rest: ChemicalItem[] } {
  const q = query.trim().toLowerCase();
  const match = (i: ChemicalItem) => !q || i.name.toLowerCase().includes(q);
  const byId = new Map(items.map((i) => [i.id, i]));
  const usual = usualIds.map((id) => byId.get(id)).filter((i): i is ChemicalItem => !!i);
  const taken = new Set(usual.map((i) => i.id));
  return {
    usual: usual.filter(match),
    rest: items.filter((i) => !taken.has(i.id) && match(i)),
  };
}

export const LAST_VISIT_NOTES_TITLE = "Last visit";

export interface LastVisitNote {
  /** "Last visit · Mon, Oct 19". */
  label: string;
  text: string;
}

/**
 * The notes from the pool's last visit, shown under this visit's notes so a tech can see what
 * they left for themselves ("gate sticks", "dog in yard"): the newest of an earlier visit's job
 * notes and an earlier reading's notes. Null when there are none.
 */
export function lastVisitNote(input: {
  jobId: string | null | undefined;
  jobs: { id: string; summary_notes?: string | null; when?: string | null }[];
  readings: HintReading[];
  timeZone: string;
}): LastVisitNote | null {
  const found: { text: string; at: number; iso: string }[] = [];
  const add = (text: string | null | undefined, iso: string | null | undefined) => {
    const t = text?.trim();
    const at = Date.parse(iso ?? "");
    if (t && Number.isFinite(at)) found.push({ text: t, at, iso: iso! });
  };
  for (const j of input.jobs) if (j.id !== input.jobId) add(j.summary_notes, j.when);
  for (const r of input.readings)
    if (!input.jobId || r.job_id !== input.jobId) add(r.notes, r.recorded_at);
  if (!found.length) return null;
  const newest = found.reduce((a, b) => (b.at > a.at ? b : a));
  const day = formatDay(localDate(new Date(newest.iso), input.timeZone));
  return { label: `${LAST_VISIT_NOTES_TITLE} · ${day}`, text: newest.text };
}

export interface UsualVisit {
  techId: string | null;
  /** "09:00", the shop's local start time. */
  time: string | null;
}

/** The value most of the sample share, when it's clear (at least 2, and at least 60% of it). */
function clearMajority<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [v, c] of counts) {
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best !== null && n >= 2 && n >= values.length * 0.6 ? best : null;
}

/**
 * A customer's usual tech and start time at a pool, for a new job's fields, from its last four
 * scheduled jobs (canceled and deleted ones left out by the caller): the tech and the time most of
 * them share. Only when it's obvious; null when it isn't.
 */
export function usualVisit(
  jobs: { assigned_user_id?: string | null; scheduled_start?: string | null }[],
  timeZone: string,
): UsualVisit | null {
  const recent = jobs
    .filter((j) => !!j.scheduled_start && Number.isFinite(Date.parse(j.scheduled_start)))
    .sort((a, b) => Date.parse(b.scheduled_start!) - Date.parse(a.scheduled_start!))
    .slice(0, 4);
  const techs = recent.map((j) => j.assigned_user_id).filter((t): t is string => !!t);
  const times = recent.map((j) => minutesToClock(localMinutes(j.scheduled_start!, timeZone)));
  const techId = clearMajority(techs);
  const time = clearMajority(times);
  return techId || time ? { techId, time } : null;
}
