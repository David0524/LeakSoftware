// Where each person's day starts and ends: the shop, or their home (owner, 2026-10-21: "Techs/
// owners need to be able to set if they start their day from home or from the shop";
// docs/design/2026-10-21-start-from-home.md). Every routing call that took the shop as its depot
// takes the tech's start instead: startFor(techId, starts, shop).at. Pure.

import type { MemberStart } from "./models";
import type { LatLng } from "./routing";

export type RouteStartLabel = "shop" | "home";

export interface RouteStart {
  /** Where the day starts and ends; null when it starts at a shop with no map location. */
  at: LatLng | null;
  label: RouteStartLabel;
}

export type MemberStartFields = Pick<
  MemberStart,
  "start_from" | "home_address" | "home_latitude" | "home_longitude" | "home_geocoded_address"
> & { deleted_at?: string | null };

/** The setting's words, the same on every platform. */
export const START_FROM_COPY = {
  field: "Start My Day From",
  shop: "The Shop",
  home: "Home",
  homeAddress: "Home Address",
  footer: "Routes, drive times and Optimize start and end here.",
  /** Under the setting while a home address isn't found on the map. */
  pending: "Starting from the shop until the address is found on the map.",
  /** The day map's start pin for someone who starts at home (never the street). */
  homePin: "Home",
} as const;

/**
 * A home address as it's looked up and kept in home_geocoded_address (spaces tidied), or ""
 * when there's none. The website's lookup compares and saves this form.
 */
export function homeLookupAddress(address: string | null | undefined): string {
  return (address ?? "").trim().replace(/\s+/g, " ");
}

const clean = homeLookupAddress;

/**
 * Whether a home start is on the map: "found" when it has coordinates for its current address,
 * "missing" when it's set to Home without them (no address, not found, or changed since), null
 * when the day starts at the shop.
 */
export function homeMapStatus(
  member: MemberStartFields | null | undefined,
): "found" | "missing" | null {
  if (!member || member.deleted_at || member.start_from !== "home") return null;
  const address = clean(member.home_address);
  if (!address || member.home_latitude == null || member.home_longitude == null) return "missing";
  // Coordinates belong to the address they were found for.
  const found = member.home_geocoded_address;
  return found == null || clean(found) === address ? "found" : "missing";
}

/**
 * Where this person's routes start and end: home when they start from home and the address is
 * on the map, otherwise the shop.
 */
export function routeStart(
  member: MemberStartFields | null | undefined,
  shop: LatLng | null,
): RouteStart {
  if (homeMapStatus(member) === "found")
    return { at: { lat: member!.home_latitude!, lng: member!.home_longitude! }, label: "home" };
  return { at: shop, label: "shop" };
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

/** The drive back's words: "36 min back to the shop", "36 min back home". */
export function backLegLabel(label: RouteStartLabel): string {
  return label === "home" ? "back home" : "back to the shop";
}
