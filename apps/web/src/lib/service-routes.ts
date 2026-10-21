import {
  dayMapPins,
  durationLabel,
  encodePins,
  estimateDriveMinutes,
  optimizeRoute,
  type DaySuggestion,
  type LatLng,
  type WorkDay,
} from "@leakbook/core";

// Routes on Schedule (owner, 2026-10-20, docs/plans/route-maps.md part 3): which weekday each
// pool customer is serviced on, and by whom. The pure parts of the view: Customers to Add, each
// tech's days in driving order with their totals, and the words. Client-safe.

/** A plan on the Routes view (as loadRouteCustomers gives it). */
export interface RoutePlanCard {
  planId: string;
  customer: string;
  address: string;
  location: LatLng | null;
  techId: string | null;
  /** 0 Sunday to 6 Saturday. */
  days: number[];
  durationMin: number;
  /** "days" (several a week), "weekly", "biweekly" or "monthly". */
  repeat?: string;
  /** When the plan was made (newest first in Customers to Add). */
  createdAt?: string | null;
  /** Whose plan it is: Open Plan goes to their page. */
  customerId?: string | null;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Monday first, as the schedule's weeks are. */
const mondayFirst = (d: number) => (d + 6) % 7;
export const sortDays = (days: number[]) =>
  [...new Set(days)].sort((a, b) => mondayFirst(a) - mondayFirst(b));

/**
 * Customers to Add: running plans with nobody on them (or someone no longer on the team),
 * newest first, narrowed by a search over the name and address.
 */
export function customersToAdd(
  plans: RoutePlanCard[],
  techIds: string[],
  query = "",
): RoutePlanCard[] {
  const team = new Set(techIds);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return plans
    .filter((p) => !p.techId || !team.has(p.techId))
    .filter((p) => {
      const text = `${p.customer} ${p.address}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .sort(
      (a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
        a.customer.localeCompare(b.customer),
    );
}

/** The tech the view opens on: the asked-for one, else the first with plans, else the first. */
export function firstTech(
  plans: RoutePlanCard[],
  techIds: string[],
  wanted?: string | null,
): string | null {
  if (wanted && techIds.includes(wanted)) return wanted;
  return techIds.find((id) => plans.some((p) => p.techId === id)) ?? techIds[0] ?? null;
}

/** A tech's weekdays to show: the shop's working days, plus any day they have plans on. */
export function routeDays(plans: RoutePlanCard[], tech: string | null, workDays: number[]) {
  const theirs = plans.filter((p) => p.techId === tech).flatMap((p) => p.days);
  return sortDays([...workDays, ...theirs]);
}

export interface RouteDay {
  day: number;
  /** In driving order; pools without a map location last. */
  plans: RoutePlanCard[];
  serviceMin: number;
  /** Estimated, from the shop and back. */
  driveMin: number;
  /** Minutes past the end of the working day. */
  overMin: number;
  /** The day's map pins (encodePins), null when no pool is on the map. */
  pins: string | null;
  /** Pools on this day without a map location. */
  missing: number;
}

/** One tech's weekday: its pools in the order that drives least, with the day's totals. */
export function routeDay(input: {
  plans: RoutePlanCard[];
  tech: string | null;
  day: number;
  depot: LatLng | null;
  workDay: WorkDay;
}): RouteDay {
  const mine = input.plans
    .filter((p) => p.techId === input.tech && p.days.includes(input.day))
    .sort((a, b) => a.customer.localeCompare(b.customer));
  const located = mine.filter((p) => p.location);
  const stops = located.map((p) => ({
    id: p.planId,
    location: p.location,
    durationMin: p.durationMin,
  }));
  const { order, route } = stops.length
    ? optimizeRoute(stops, input.depot, input.workDay, estimateDriveMinutes)
    : { order: [] as number[], route: null };
  const plans = [...order.map((i) => located[i]!), ...mine.filter((p) => !p.location)];
  const serviceMin = mine.reduce((n, p) => n + p.durationMin, 0);
  const driveMin = route?.driveMin ?? 0;
  const { pins, missing } = dayMapPins({
    stops: plans.map((p) => ({ id: p.planId, location: p.location, done: false })),
    depot: input.depot,
  });
  const onMap = pins.some((p) => p.tone !== "shop");
  return {
    day: input.day,
    plans,
    serviceMin,
    driveMin,
    overMin: Math.max(0, serviceMin + driveMin - (input.workDay.endMin - input.workDay.startMin)),
    pins: onMap ? encodePins(pins) : null,
    missing,
  };
}

export const poolsLabel = (n: number) => `${n} ${n === 1 ? "pool" : "pools"}`;

/** "14 pools · 6 hr 20 min" (service and estimated driving), or null for an empty day. */
export function daySummary(d: Pick<RouteDay, "plans" | "serviceMin" | "driveMin">): string | null {
  if (!d.plans.length) return null;
  return `${poolsLabel(d.plans.length)} · ${durationLabel(d.serviceMin + d.driveMin)}`;
}

/** The same, spelled out for screen readers and the pointer's tooltip. */
export function dayDetail(d: Pick<RouteDay, "serviceMin" | "driveMin">): string {
  return `${durationLabel(d.serviceMin)} at pools, about ${durationLabel(d.driveMin)} driving`;
}

/** A small note on a card for plans not serviced once a week: "2× a week", "Every 2 weeks". */
export function repeatNote(p: Pick<RoutePlanCard, "days" | "repeat">): string | null {
  if (p.days.length > 1) return `${p.days.length}× a week`;
  if (p.repeat === "biweekly") return "Every 2 weeks";
  if (p.repeat === "monthly") return "Monthly";
  return null;
}

/** "Moved to Tuesday. Its coming visits moved too." */
export function movedMessage(day: number): string {
  return `Moved to ${WEEKDAY_NAMES[day]}. Its coming visits moved too.`;
}

/** The plan after moving one of its days (`from`; null: its first) to `to`, for this tech. */
export function movePlan(
  p: RoutePlanCard,
  move: { from: number | null; to: number; tech: string },
): RoutePlanCard {
  const from = move.from ?? p.days[0];
  const days = p.days.length ? p.days.map((d) => (d === from ? move.to : d)) : [move.to];
  return { ...p, techId: move.tech, days: [...new Set(days)].sort((a, b) => a - b) };
}

/** The plans with Suggest Days' suggestions in place (nothing is saved until Keep). */
export function withSuggestions(
  plans: RoutePlanCard[],
  suggestions: DaySuggestion[],
): RoutePlanCard[] {
  const by = new Map(suggestions.map((s) => [s.id, s]));
  return plans.map((p) => {
    const s = by.get(p.planId);
    return s ? { ...p, techId: s.techId, days: [s.day] } : p;
  });
}

/** "12 suggested". */
export const suggestedLabel = (n: number) => `${n} suggested`;

/** Why Suggest Days left some out: "2 have no map location · 1 is on several days a week". */
export function leftOutNote(plans: RoutePlanCard[], left: string[]): string | null {
  const out = plans.filter((p) => left.includes(p.planId));
  const noMap = out.filter((p) => !p.location).length;
  const several = out.filter((p) => p.location && p.days.length > 1).length;
  const full = out.length - noMap - several;
  const has = (n: number) => (n === 1 ? "has" : "have");
  const is = (n: number) => (n === 1 ? "is" : "are");
  return (
    [
      noMap ? `${noMap} ${has(noMap)} no map location` : null,
      several ? `${several} ${is(several)} on several days a week` : null,
      full ? `${full} didn’t fit` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/** Rebuild a tech's week: every plan of theirs serviced on one day a week. */
export function rebuildPlans(plans: RoutePlanCard[], tech: string): RoutePlanCard[] {
  return plans.filter((p) => p.techId === tech && p.days.length <= 1);
}
