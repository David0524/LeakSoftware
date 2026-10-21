import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { homeLookupAddress, uuidv7, type LatLng, type MemberStart } from "@leakbook/core";
import { geocodeAddress, routingConfigured } from "./routing";

// Where each person's day starts: the shop, or their home (owner, 2026-10-21;
// docs/design/2026-10-21-start-from-home.md). member_start rows are read as the signed-in
// person, so RLS gives a tech only their own and owners and admins everyone's.

export type StartRow = Pick<
  MemberStart,
  | "user_id"
  | "start_from"
  | "home_address"
  | "home_latitude"
  | "home_longitude"
  | "home_geocoded_address"
> & { id: string };

const COLUMNS =
  "id, user_id, start_from, home_address, home_latitude, home_longitude, home_geocoded_address";

/**
 * The shop's member_start rows this person may use for routing: everyone's for owners and
 * admins, only their own for a tech (everyone else's day then starts at the shop, and their home
 * is never sent to this tech's page).
 */
export async function loadStarts(
  db: SupabaseClient,
  companyId: string,
  who: { userId: string; manager: boolean },
): Promise<StartRow[]> {
  let q = db
    .from("member_start")
    .select(COLUMNS)
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (!who.manager) q = q.eq("user_id", who.userId);
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as StartRow[]);
}

/** One person's row, or null when they start at the shop (no row). */
export async function memberStartOf(
  db: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<StartRow | null> {
  const { data } = await db
    .from("member_start")
    .select(COLUMNS)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as StartRow | null) ?? null;
}

/**
 * A person's home coordinates from their home address, when the address changed since the last
 * lookup, as `db`'s person (the website's session, or a phone's through /api/locate), the way
 * locatePropertyWith finds a pool: the free lookups first. Found: the coordinates and the
 * address they belong to. Not found: only the address, so it isn't tried again until it changes.
 */
export async function locateHomeWith(
  db: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<LatLng | null> {
  if (!routingConfigured()) return null;
  const row = await memberStartOf(db, companyId, userId);
  if (!row) return null;
  const address = homeLookupAddress(row.home_address);
  if (!address || row.home_geocoded_address === address) return null;
  const found = await geocodeAddress(db, companyId, address);
  if (!found) {
    await db
      .from("member_start")
      .update({ home_geocoded_address: address })
      .eq("id", row.id)
      .is("home_latitude", null);
    return null;
  }
  const { error } = await db
    .from("member_start")
    .update({
      home_latitude: found.lat,
      home_longitude: found.lng,
      home_geocoded_address: address,
    })
    .eq("id", row.id);
  return error ? null : found;
}

/** The longest home address kept (the table's check). */
const ADDRESS_MAX = 400;

export interface SaveStartResult {
  error?: string;
  fields?: Record<string, string>;
  /** Saved; `found` says whether a home start is on the map (null for the shop). */
  saved?: { found: boolean | null };
}

/**
 * Save where a person's day starts, as `db`'s person (their own row, or anyone's for owners and
 * admins; RLS checks it again): upserts their member_start row, then looks the home address up
 * when it changed since the last lookup. Switching to the shop keeps the address, so switching
 * back is one tap.
 */
export async function saveMemberStartWith(
  db: SupabaseClient,
  who: { companyId: string; actorId: string; manager: boolean },
  input: { userId: string; startFrom: string; homeAddress: string },
): Promise<SaveStartResult> {
  const userId = input.userId || who.actorId;
  if (userId !== who.actorId && !who.manager)
    return { error: "Only owners and admins can change someone else’s start." };
  if (input.startFrom !== "shop" && input.startFrom !== "home")
    return { error: "Pick The Shop or Home." };
  const address = homeLookupAddress(input.homeAddress);
  if (address.length > ADDRESS_MAX)
    return { fields: { home_address: "That address is too long." } };
  if (input.startFrom === "home" && !address)
    return { fields: { home_address: "Enter the home address." } };

  const current = await memberStartOf(db, who.companyId, userId);
  const values = { start_from: input.startFrom, home_address: address || null };
  const { error } = current
    ? await db.from("member_start").update(values).eq("id", current.id)
    : await db
        .from("member_start")
        .insert({ id: uuidv7(), company_id: who.companyId, user_id: userId, ...values });
  if (error) return { error: error.message };

  if (address) await locateHomeWith(db, who.companyId, userId);
  if (input.startFrom !== "home") return { saved: { found: null } };
  const now = await memberStartOf(db, who.companyId, userId);
  return { saved: { found: now?.home_latitude != null } };
}
