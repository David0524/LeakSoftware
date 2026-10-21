import { useMemo } from "react";
import {
  propertyLocation,
  startFor,
  type Company,
  type LatLng,
  type MemberStart,
  type RouteStart,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { locateAfterSync } from "../lib/locate";
import { startWrite, type StartForm } from "../lib/memberStart";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";

// Where each person's day starts (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md).
// member_start rows are synced: a tech's phone has only their own, an owner's or admin's
// everyone's. No row means the shop.

/** The shop's map location, where routes start unless someone starts from home. */
export function shopLocation(company: Company): LatLng | null {
  return propertyLocation(company as { latitude?: number | null; longitude?: number | null });
}

/** The member_start rows on this phone, not deleted (for planning outside React). */
export function memberStarts(companyId: string): MemberStart[] {
  return (getServices().sync.list("member_start", companyId) as unknown as MemberStart[]).filter(
    (r) => !r.deleted_at,
  );
}

/** The member_start rows on this phone, not deleted. */
export function useMemberStarts(companyId: string): MemberStart[] {
  const rows = useRows<MemberStart>("member_start", companyId);
  return useMemo(() => rows.filter((r) => !r.deleted_at), [rows]);
}

/** One person's row, if they have one. */
export function useMemberStart(companyId: string, userId: string | null | undefined) {
  const rows = useMemberStarts(companyId);
  return userId ? rows.find((r) => r.user_id === userId) : undefined;
}

/** Where this tech's day starts and ends: their home when it's on the map, else the shop. */
export function useRouteStart(company: Company, techId: string | null | undefined): RouteStart {
  const starts = useMemberStarts(company.id);
  const shop = shopLocation(company);
  const lat = shop?.lat;
  const lng = shop?.lng;
  return useMemo(
    () => startFor(techId, starts, lat != null && lng != null ? { lat, lng } : null),
    [techId, starts, lat, lng],
  );
}

/**
 * Saves the setting through the sync layer: the person's row (updated, or made with their
 * user_id), then, for a new address, asks the website to find it on the map. Returns an error
 * to show, or null.
 */
export function saveMemberStart(
  companyId: string,
  userId: string,
  row: MemberStart | null | undefined,
  form: StartForm,
): string | null {
  const w = startWrite(row, form);
  if ("error" in w) return w.error;
  if (!Object.keys(w.values).length) return null;
  const { sync } = getServices();
  const values = w.values as Record<string, JsonValue>;
  const id = row
    ? (sync.write("member_start", row.id, companyId, values), row.id)
    : sync.insert("member_start", companyId, { start_from: "shop", ...values, user_id: userId });
  // After the write (and any batch around it) is done: push it, then look the address up.
  if (w.locate)
    setTimeout(() => void locateAfterSync(companyId, { home_user_id: userId, start_id: id }), 0);
  return null;
}
