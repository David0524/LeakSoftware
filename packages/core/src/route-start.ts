// Where each person's day starts and ends: the shop, or their home (owner, 2026-10-21: "Techs/
// owners need to be able to set if they start their day from home or from the shop";
// docs/design/2026-10-21-start-from-home.md). Every routing call that took the shop as its depot
// takes the tech's start instead: startFor(techId, starts, shop).at. Where the day ends is set
// apart (owner, 2026-11-23: "start location at the shop, and finish location at home"): the
// drive back, and every route's last leg, go to startFor(…).end.at. Pure.

import type { MemberStart } from "./models";
import type { LatLng } from "./routing";

export type RouteStartLabel = "shop" | "home";

/** One end of a day: a place on the map (null for a shop with no map location), and which. */
export interface RoutePoint {
  at: LatLng | null;
  label: RouteStartLabel;
}

export interface RouteStart extends RoutePoint {
  /** `at` and `label`: where the day starts. `end`: where it ends (the drive back goes there). */
  end: RoutePoint;
}

export type MemberStartFields = Pick<
  MemberStart,
  | "start_from"
  | "end_at"
  | "home_address"
  | "home_latitude"
  | "home_longitude"
  | "home_geocoded_address"
> & { deleted_at?: string | null };

/** The setting's words, the same on every platform. */
export const START_FROM_COPY = {
  field: "Start My Day From",
  /** Right under it, the same control (owner, 2026-11-23). */
  endField: "End My Day At",
  /** On someone else's profile (Team › their profile), without "My" (owner's screenshot review, 2026-11-23). */
  othersField: "Start Day From",
  othersEndField: "End Day At",
  /** Team › a person's profile has a save per section; this one saves both ends. */
  save: "Save Start and End",
  shop: "The Shop",
  home: "Home",
  homeAddress: "Home Address",
  footer: "Routes, drive times and Optimize start and end at these places.",
  /** Under the setting while a home address isn't found on the map. */
  pending: "Using the shop until the address is found on the map.",
  /** The day map's pin for home, at the start or the end (never the street). */
  homePin: "Home",
} as const;

/** Where a row's day ends: its end_at, or (a row from before there was one) where it starts. */
export function endAtOf(member: Pick<MemberStartFields, "start_from" | "end_at">): RouteStartLabel {
  const end = member.end_at ?? member.start_from;
  return end === "home" ? "home" : "shop";
}

/** Whether the setting needs a home address: the day starts or ends at home. */
export function usesHome(
  startFrom: string | null | undefined,
  endAt: string | null | undefined,
): boolean {
  return startFrom === "home" || endAt === "home";
}

/**
 * A home address as it's looked up and kept in home_geocoded_address (spaces tidied), or ""
 * when there's none. The website's lookup compares and saves this form.
 */
export function homeLookupAddress(address: string | null | undefined): string {
  return (address ?? "").trim().replace(/\s+/g, " ");
}

const clean = homeLookupAddress;

/**
 * Whether a home start or end is on the map: "found" when it has coordinates for its current
 * address, "missing" when the day starts or ends at Home without them (no address, not found, or
 * changed since), null when it starts and ends at the shop.
 */
export function homeMapStatus(
  member: MemberStartFields | null | undefined,
): "found" | "missing" | null {
  if (!member || member.deleted_at || !usesHome(member.start_from, endAtOf(member))) return null;
  const address = clean(member.home_address);
  if (!address || member.home_latitude == null || member.home_longitude == null) return "missing";
  // Coordinates belong to the address they were found for.
  const found = member.home_geocoded_address;
  return found == null || clean(found) === address ? "found" : "missing";
}

/**
 * Where this person's routes start and end: each is home when they chose Home for it and the
 * address is on the map, otherwise the shop.
 */
export function routeStart(
  member: MemberStartFields | null | undefined,
  shop: LatLng | null,
): RouteStart {
  const atShop: RoutePoint = { at: shop, label: "shop" };
  if (homeMapStatus(member) !== "found") return { ...atShop, end: atShop };
  const home: RoutePoint = {
    at: { lat: member!.home_latitude!, lng: member!.home_longitude! },
    label: "home",
  };
  const start = member!.start_from === "home" ? home : atShop;
  return { ...start, end: endAtOf(member!) === "home" ? home : atShop };
}

/**
 * A tech's start from the shop's member_start rows (those this person can read: their own, or
 * everyone's for owners and admins). Nobody, or no row: the shop.
 */
export function startFor(
  techId: string | null | undefined,
  starts: readonly (MemberStartFields & { user_id: string })[] | null | undefined,
  shop: LatLng | null,
): RouteStart {
  const row = techId ? starts?.find((s) => s.user_id === techId && !s.deleted_at) : undefined;
  return routeStart(row, shop);
}

/** The first leg's words: "18 min from the shop", "18 min from home". */
export function startLegLabel(label: RouteStartLabel): string {
  return label === "home" ? "from home" : "from the shop";
}

/** The drive back's words, by where the day ends: "36 min back to the shop", "36 min back home". */
export function backLegLabel(label: RouteStartLabel): string {
  return label === "home" ? "back home" : "back to the shop";
}
