import {
  dayMapPins,
  durationLabel,
  encodePins,
  estimateDriveMinutes,
  moveServiceDay,
  optimizeRoute,
  planRepeat,
  propertyLocation,
  serviceDays,
  type DaySuggestion,
  type LatLng,
  type ServicePlan,
  type WorkDay,
} from "@leakbook/core";

// Routes on Schedule (owner, 2026-10-20, docs/plans/route-maps.md part 3), the website's
// lib/service-routes.ts and actions/service-days.ts on the phone: which weekday each pool
// customer is serviced on, and by whom. Customers to Add, each tech's days in driving order with
// their totals, the words, and the plan columns a move saves (through the sync layer; the
// server re-makes the plan's coming visits when it syncs). Pure, so it's tested without a phone.

/** A plan on the Routes view. */
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

/** Spring loading: holding a card over a day's segment this long opens that day. */
export const SPRING_MS = 450;
/** How long a finger rests on a card before it lifts (the website's touch delay). */
export const ROUTE_HOLD_MS = 220;

/** Monday first, as the schedule's weeks are. */
const mondayFirst = (d: number) => (d + 6) % 7;
export const sortDays = (days: number[]) =>
  [...new Set(days)].sort((a, b) => mondayFirst(a) - mondayFirst(b));

// ---------------------------------------------------------------------------
// From the phone's rows
// ---------------------------------------------------------------------------

/** A service_plan row as the phone keeps it. */
export type PlanRow = Pick<
  ServicePlan,
  | "id"
  | "customer_id"
  | "property_id"
  | "starts_on"
  | "interval_weeks"
  | "weekdays"
  | "ends_on"
  | "paused"
  | "duration_minutes"
> & {
  assigned_user_id?: string | null;
  monthly?: boolean | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

export interface PlanPlace {
  address_line1?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Every plan that's running (not paused, not ended, not deleted) as a Routes card, by
 * customer name: the website's loadRouteCustomers, from the phone's database.
 */
export function routeCards(input: {
  plans: PlanRow[];
  customers: Map<string, { name?: string | null }>;
  properties: Map<string, PlanPlace>;
  today: string;
}): RoutePlanCard[] {
  return input.plans
    .filter((p) => !p.deleted_at && !p.paused && (!p.ends_on || p.ends_on >= input.today))
    .map((p) => {
      const place = input.properties.get(p.property_id) ?? null;
      return {
        planId: p.id,
        customer: input.customers.get(p.customer_id)?.name || "Customer",
        address: [place?.address_line1, place?.city].filter(Boolean).join(", "),
        location: propertyLocation(place),
        techId: p.assigned_user_id ?? null,
        days: serviceDays(p),
        durationMin: p.duration_minutes,
        repeat: planRepeat({ ...p, monthly: p.monthly ?? false }),
        createdAt: p.created_at ?? null,
      };
    })
    .sort((a, b) => a.customer.localeCompare(b.customer));
}

/** What a plan's day and tech were, to put it back (Undo). */
export interface PlanUndo {
  id: string;
  starts_on: string;
  weekdays: number[] | null;
  assigned_user_id: string | null;
}

/** The service_plan columns a move saves (all three are synced update columns). */
export type PlanWrite = PlanUndo;

/** The plan as it is now, for Undo. */
export function undoRow(p: PlanRow): PlanUndo {
  return {
    id: p.id,
    starts_on: p.starts_on,
    weekdays: p.weekdays ?? null,
    assigned_user_id: p.assigned_user_id ?? null,
  };
}

/**
 * The columns to save to service this plan on `to` instead of `from` (null: its first day),
 * by this tech, from today on (core moveServiceDay), as the website's setServiceDay.
 */
export function moveWrite(
  p: PlanRow,
  move: { from: number | null; to: number; tech: string },
  today: string,
): PlanWrite {
  const shape = { ...p, monthly: p.monthly ?? false };
  const from = move.from ?? serviceDays(p)[0]!;
  const cols = moveServiceDay(shape, from, move.to, today);
  return {
    id: p.id,
    starts_on: cols.starts_on,
    weekdays: cols.weekdays ?? null,
    assigned_user_id: move.tech,
  };
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

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

/** A search over Customers to Add only (they're already in order). */
export function searchCards(plans: RoutePlanCard[], query: string): RoutePlanCard[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return plans;
  return plans.filter((p) => {
    const text = `${p.customer} ${p.address}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
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

/** The same, spelled out for screen readers. */
export function dayDetail(d: Pick<RouteDay, "serviceMin" | "driveMin">): string {
  return `${durationLabel(d.serviceMin)} at pools, about ${durationLabel(d.driveMin)} driving`;
}

/** A day's segment for screen readers: "Monday, 6 pools". */
export function segmentLabel(d: Pick<RouteDay, "day" | "plans">): string {
  return `${WEEKDAY_NAMES[d.day]}, ${poolsLabel(d.plans.length)}`;
}

/** "No pools on Tuesday yet." */
export const emptyDay = (day: number) => `No pools on ${WEEKDAY_NAMES[day]} yet.`;

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

export const PUT_BACK = "Put back as it was.";

/** After Keep: "Saved 12 customers’ days. Their coming visits moved too." */
export function keptMessage(n: number): string {
  return `Saved ${n} ${n === 1 ? "customer’s day" : "customers’ days"}. Their coming visits moved too.`;
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

/**
 * What dropping a card on a day does: nothing (where it already is), a refusal (it's already
 * serviced that day), or the move, for the tech on screen.
 */
export function planDayDrop(input: {
  plan: RoutePlanCard;
  /** The day it was dragged from; null: Customers to Add. */
  from: number | null;
  to: number | null;
  tech: string | null;
}):
  | { kind: "none" }
  | { kind: "refuse"; error: string }
  | { kind: "move"; from: number | null; to: number; tech: string } {
  const { plan: p, from, to, tech } = input;
  if (to == null || !tech) return { kind: "none" };
  if (from === to && p.techId === tech) return { kind: "none" };
  if (from != null && from !== to && p.days.includes(to))
    return { kind: "refuse", error: `${p.customer} is already serviced on ${WEEKDAY_NAMES[to]}.` };
  return { kind: "move", from, to, tech };
}

/** The day segment under the finger (rects in window points), or null. */
export function dayAt(
  zones: { day: number; rect: { x: number; y: number; width: number; height: number } }[],
  x: number,
  y: number,
): number | null {
  const z = zones.find(
    ({ rect: r }) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
  );
  return z ? z.day : null;
}

/** The Move sheet's line under the day: "Moves its Monday visit. Thursday stays." */
export function multiDayNote(days: number[], from: number | null): string | null {
  if (from == null) return null;
  const others = days.filter((d) => d !== from);
  if (!others.length) return null;
  return `Moves its ${WEEKDAY_NAMES[from]} visit. ${others.map((d) => WEEKDAY_NAMES[d]).join(" and ")} stay${others.length === 1 ? "s" : ""}.`;
}

/** The Move sheet's hint: what moving does, or why it can't. */
export function moveHint(taken: boolean, day: number): string {
  return taken
    ? `It’s already serviced on ${WEEKDAY_NAMES[day]}.`
    : "Its coming visits move to the new day.";
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

/** When Suggest Days found nothing: "No days to suggest: 2 have no map location." */
export function nothingSuggested(note: string | null): string {
  return `No days to suggest${note ? `: ${note.charAt(0).toLowerCase()}${note.slice(1)}` : ""}.`;
}

/** Rebuild a tech's week: every plan of theirs serviced on one day a week. */
export function rebuildPlans(plans: RoutePlanCard[], tech: string): RoutePlanCard[] {
  return plans.filter((p) => p.techId === tech && p.days.length <= 1);
}

export const customersWord = (n: number) => `${n} ${n === 1 ? "customer" : "customers"}`;

export const SUGGEST_HELP =
  "Groups nearby pools on the same day and evens out the days. Customers on several days a week stay as they are. Nothing changes until you press Keep.";
