// Routes and scheduling help (owner request, 2026-10-13). Pure: no network, no clock. The
// server supplies drive times (Mapbox when configured, otherwise the estimate below) as a
// function, so the same code plans a day, re-times it after a drag, and suggests slots.
//
// Times of day are minutes after midnight in the shop's time zone (8:00 am = 480).

export interface LatLng {
  lat: number;
  lng: number;
}

/** Minutes of driving from a to b. Unknown locations count as 0 (and are flagged). */
export type DriveFn = (a: LatLng | null, b: LatLng | null) => number;

// ---------------------------------------------------------------------------
// Distances and the built-in estimate
// ---------------------------------------------------------------------------

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/**
 * A drive-time estimate when no routing service is set up: roads are about 1.35 times the
 * straight line; city streets average 40 km/h for the first 10 km and freeways 75 km/h after
 * that; plus 3 minutes to get going and park. Close enough to order a day's stops.
 */
export function estimateDriveMinutes(a: LatLng | null, b: LatLng | null): number {
  if (!a || !b) return 0;
  const km = (haversineMeters(a, b) * 1.35) / 1000;
  if (km < 0.05) return 0;
  const city = Math.min(km, 10);
  const freeway = Math.max(0, km - 10);
  return Math.round(3 + (city / 40) * 60 + (freeway / 75) * 60);
}

/** Round to 4 decimals (about 11 m), the key used to cache drive times between two points. */
export function pointKey(p: LatLng): string {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Timing a route
// ---------------------------------------------------------------------------

export interface RouteStop {
  id: string;
  location: LatLng | null;
  durationMin: number;
  /** The customer was told this time: the stop can't move (minutes after midnight). */
  fixedStartMin?: number | null;
  /** Can't start before this (for example, now on today's route). */
  earliestMin?: number | null;
}

export interface WorkDay {
  /** Leave the shop (minutes after midnight). */
  startMin: number;
  /** Back at the shop by. */
  endMin: number;
}

export interface TimedStop {
  id: string;
  driveMin: number;
  arriveMin: number;
  startMin: number;
  endMin: number;
  /** Minutes after a fixed appointment time. */
  lateMin: number;
  unlocated: boolean;
}

export interface TimedRoute {
  stops: TimedStop[];
  /** Including the drive back to the shop. */
  driveMin: number;
  backMin: number;
  /** Minutes past the end of the working day. */
  overtimeMin: number;
  /** Total minutes late for fixed appointments. */
  lateMin: number;
}

/** Times for stops visited in the given order, from the shop and back. */
export function timeRoute(
  stops: RouteStop[],
  depot: LatLng | null,
  day: WorkDay,
  drive: DriveFn,
): TimedRoute {
  let clock = day.startMin;
  let at: LatLng | null = depot;
  let driveTotal = 0;
  let lateTotal = 0;
  const timed: TimedStop[] = stops.map((s) => {
    const d = drive(at, s.location);
    driveTotal += d;
    const arrive = clock + d;
    const notBefore = Math.max(s.fixedStartMin ?? 0, s.earliestMin ?? 0);
    const start = Math.max(arrive, notBefore);
    const late = s.fixedStartMin != null ? Math.max(0, arrive - s.fixedStartMin) : 0;
    lateTotal += late;
    clock = start + s.durationMin;
    if (s.location) at = s.location;
    return {
      id: s.id,
      driveMin: d,
      arriveMin: arrive,
      startMin: start,
      endMin: clock,
      lateMin: late,
      unlocated: !s.location,
    };
  });
  const back = drive(at, depot);
  driveTotal += back;
  const backMin = clock + back;
  return {
    stops: timed,
    driveMin: driveTotal,
    backMin,
    overtimeMin: Math.max(0, backMin - day.endMin),
    lateMin: lateTotal,
  };
}

/** What a plan costs: driving, plus heavy penalties for being late or working over. */
export function routeCost(r: TimedRoute): number {
  return r.driveMin + r.lateMin * 20 + r.overtimeMin * 5;
}

// ---------------------------------------------------------------------------
// Ordering a day
// ---------------------------------------------------------------------------

function* permutations(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i);
  const c = new Array<number>(n).fill(0);
  yield a.slice();
  let i = 0;
  while (i < n) {
    if (c[i]! < i) {
      const j = i % 2 === 0 ? 0 : c[i]!;
      [a[j], a[i]] = [a[i]!, a[j]!];
      yield a.slice();
      c[i]!++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

/**
 * The order to visit a tech's stops: least driving, keeping fixed appointments and the
 * working day. Exact for up to 8 stops (every order is tried); for more, the nearest stop
 * first and then improving swaps (2-opt and moving single stops) until nothing helps.
 * Ties keep the current order, so planning twice gives the same answer.
 */
export function optimizeRoute(
  stops: RouteStop[],
  depot: LatLng | null,
  day: WorkDay,
  drive: DriveFn,
): { order: number[]; route: TimedRoute } {
  const cost = (order: number[]) =>
    routeCost(
      timeRoute(
        order.map((i) => stops[i]!),
        depot,
        day,
        drive,
      ),
    );
  const n = stops.length;
  let best = Array.from({ length: n }, (_, i) => i);
  let bestCost = cost(best);

  if (n <= 8) {
    for (const order of permutations(n)) {
      const c = cost(order);
      if (c < bestCost - 1e-9) {
        best = order;
        bestCost = c;
      }
    }
  } else {
    // Nearest stop first, fixed appointments by time.
    const left = new Set(best);
    const greedy: number[] = [];
    let at = depot;
    while (left.size) {
      let pick = -1;
      let pickScore = Infinity;
      for (const i of left) {
        const s = stops[i]!;
        const score =
          s.fixedStartMin != null ? s.fixedStartMin - day.startMin : drive(at, s.location);
        if (score < pickScore) {
          pick = i;
          pickScore = score;
        }
      }
      greedy.push(pick);
      left.delete(pick);
      at = stops[pick]!.location ?? at;
    }
    if (cost(greedy) < bestCost) {
      best = greedy;
      bestCost = cost(greedy);
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let k = i + 1; k < n; k++) {
          const reversed = [
            ...best.slice(0, i),
            ...best.slice(i, k + 1).reverse(),
            ...best.slice(k + 1),
          ];
          const c = cost(reversed);
          if (c < bestCost - 1e-9) {
            best = reversed;
            bestCost = c;
            improved = true;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < n; k++) {
          if (i === k) continue;
          const moved = best.slice();
          const [x] = moved.splice(i, 1);
          moved.splice(k, 0, x!);
          const c = cost(moved);
          if (c < bestCost - 1e-9) {
            best = moved;
            bestCost = c;
            improved = true;
          }
        }
      }
    }
  }
  return {
    order: best,
    route: timeRoute(
      best.map((i) => stops[i]!),
      depot,
      day,
      drive,
    ),
  };
}

// ---------------------------------------------------------------------------
// Suggesting a slot for a new job
// ---------------------------------------------------------------------------

export interface TechDay {
  date: string;
  techId: string;
  techName: string;
  /** That tech's jobs that day, in route order. */
  stops: RouteStop[];
  /** Labels for the stops (customer names), by id, for "after Grace Holloway". */
  labels?: Record<string, string>;
  /** On today's route, nothing can start before now. */
  notBeforeMin?: number | null;
}

export interface SlotSuggestion {
  date: string;
  techId: string;
  techName: string;
  /** Where in the day's order (0 = first stop). */
  position: number;
  startMin: number;
  /** Extra driving this job adds to that day. */
  addedDriveMin: number;
  /** Driving from the stop before (or the shop) to this job. */
  driveInMin: number;
  /** "after Grace Holloway", "first stop", "only job that day". */
  near: string;
}

/**
 * The best places to fit a job into existing routes: for each tech and day, every position
 * in the route is tried and the one that adds the least driving without making the day run
 * late or over is kept. Sooner days win small ties (2 minutes of driving per day out).
 */
export function suggestSlots(
  job: { location: LatLng | null; durationMin: number },
  days: TechDay[],
  depot: LatLng | null,
  day: WorkDay,
  drive: DriveFn,
  limit = 5,
): SlotSuggestion[] {
  const found: (SlotSuggestion & { score: number })[] = [];
  days.forEach((td) => {
    const base = timeRoute(td.stops, depot, day, drive);
    let best: (SlotSuggestion & { score: number }) | null = null;
    for (let p = 0; p <= td.stops.length; p++) {
      const candidate: RouteStop = {
        id: "__new",
        location: job.location,
        durationMin: job.durationMin,
        earliestMin: td.notBeforeMin ?? null,
      };
      const stops = [...td.stops.slice(0, p), candidate, ...td.stops.slice(p)];
      const r = timeRoute(stops, depot, day, drive);
      if (r.overtimeMin > base.overtimeMin || r.lateMin > base.lateMin) continue;
      const added = r.driveMin - base.driveMin;
      const score = added + daysOut(days, td) * 2;
      if (!best || score < best.score) {
        const prev = td.stops[p - 1];
        best = {
          date: td.date,
          techId: td.techId,
          techName: td.techName,
          position: p,
          startMin: r.stops[p]!.startMin,
          addedDriveMin: added,
          driveInMin: r.stops[p]!.driveMin,
          near:
            td.stops.length === 0
              ? "only job that day"
              : prev
                ? `after ${td.labels?.[prev.id] ?? "the job before"}`
                : "first stop",
          score,
        };
      }
    }
    if (best) found.push(best);
  });
  return found
    .sort((a, b) => a.score - b.score || a.date.localeCompare(b.date) || a.startMin - b.startMin)
    .slice(0, limit)
    .map(({ score: _score, ...s }) => s);
}

function daysOut(days: TechDay[], td: TechDay): number {
  const first = days.reduce((min, d) => (d.date < min ? d.date : min), td.date);
  return Math.round(
    (Date.parse(`${td.date}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000,
  );
}

// ---------------------------------------------------------------------------
// Times and words
// ---------------------------------------------------------------------------

/** "08:30" → 510 */
export function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 510 → "08:30" */
export function minutesToClock(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 510 → "8:30 AM" */
export function minutesLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60) % 24;
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "1 hr 5 min", "25 min". */
export function durationLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`;
}

/**
 * The window a customer is told, when the shop uses arrival windows: it starts at the
 * planned time rounded down to the half hour. 0 means an exact time.
 */
export function arrivalWindow(startMin: number, windowMin: number): { from: number; to: number } {
  if (!windowMin) return { from: startMin, to: startMin };
  const from = Math.floor(startMin / 30) * 30;
  return { from, to: from + windowMin };
}

export function arrivalText(startMin: number, windowMin: number): string {
  const w = arrivalWindow(startMin, windowMin);
  return windowMin
    ? `between ${minutesLabel(w.from)} and ${minutesLabel(w.to)}`
    : `at ${minutesLabel(startMin)}`;
}

/** The text a tech sends from their phone when they leave for a job. */
export function onMyWayText(input: {
  customer: string | null;
  tech: string;
  shop: string;
  arriveMin: number;
  windowMin?: number;
}): string {
  const hi = input.customer ? `Hi ${input.customer.split(" ")[0]}, ` : "Hi, ";
  const shop = input.shop.replace(/\.$/, "");
  const when = input.windowMin
    ? arrivalText(input.arriveMin, input.windowMin)
    : `about ${minutesLabel(input.arriveMin)}`;
  return `${hi}this is ${input.tech.split(" ")[0]} from ${shop}. I’m on my way and should be there ${when}.`;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export interface MapPlace {
  address: string;
  location?: LatLng | null;
}

const destination = (p: MapPlace) =>
  p.location ? `${p.location.lat},${p.location.lng}` : p.address;

/** Directions to one place in Apple Maps and Google Maps (each opens the app on a phone). */
export function mapsLinks(p: MapPlace): { apple: string; google: string } {
  const q = encodeURIComponent(p.address);
  return {
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(destination(p))}&q=${q}&dirflg=d`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      p.location ? `${p.location.lat},${p.location.lng}` : p.address,
    )}&travelmode=driving`,
  };
}

export type MapsApp = "apple" | "google";

/** Values of the per-device choice (the `lb_maps` cookie); anything else means automatic. */
export const MAPS_CHOICES = ["auto", "apple", "google"] as const;

/**
 * Which maps app directions open in: the device's saved choice, else Apple Maps on iPhone,
 * iPad, and Mac (iPads report themselves as Macs), else Google Maps.
 */
export function mapsAppFor(userAgent: string, choice?: string | null): MapsApp {
  if (choice === "apple" || choice === "google") return choice;
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) ? "apple" : "google";
}

/** The link every address uses: the server picks the app, so it never changes after load. */
export function directionsHref(p: MapPlace): string {
  const q = new URLSearchParams({ to: p.address });
  if (p.location) {
    q.set("lat", String(p.location.lat));
    q.set("lng", String(p.location.lng));
  }
  return `/maps?${q.toString()}`;
}

/**
 * Directions from the phone app: Apple Maps on iPhone; on Android a geo: link, which opens
 * the phone's own maps app (Google Maps, Waze, …) at the pool.
 */
export function nativeMapsUrl(p: MapPlace, os: string): string {
  if (os === "ios") return mapsLinks(p).apple;
  if (os === "android") {
    const q = p.location ? `${p.location.lat},${p.location.lng}(${p.address})` : p.address;
    return `geo:0,0?q=${encodeURIComponent(q)}`;
  }
  return mapsLinks(p).google;
}

/**
 * A whole day in Google Maps: from the shop, through the stops in order (Google takes up
 * to 9 stops between), and back. Apple Maps links take one destination, so phones that
 * prefer Apple Maps open each stop on its own.
 */
export function routeLink(origin: MapPlace | null, stops: MapPlace[]): string | null {
  if (stops.length === 0) return null;
  const shown = stops.slice(0, 10);
  const last = origin ?? shown[shown.length - 1]!;
  const middle = origin ? shown : shown.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination: destination(last),
  });
  if (origin) params.set("origin", destination(origin));
  if (middle.length) params.set("waypoints", middle.map(destination).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * The day's directions in the chosen maps app. Google Maps takes the whole route (from the
 * shop, through the stops, and back). Apple Maps links take one destination, so Apple Maps
 * opens the next stop not yet done; the others are a tap away on their addresses.
 */
export function dayDirections(
  app: MapsApp,
  origin: MapPlace | null,
  stops: (MapPlace & { done?: boolean })[],
): { href: string; app: MapsApp } | null {
  if (app === "google") {
    const href = routeLink(origin, stops);
    return href ? { href, app } : null;
  }
  const next = stops.find((s) => !s.done);
  return next ? { href: mapsLinks(next).apple, app } : null;
}
