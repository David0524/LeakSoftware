import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { propertyLocation, type LatLng } from "@leakbook/core";

/** The shop's own location, so suggestions near it come first. */
export async function shopLocation(db: SupabaseClient, companyId: string): Promise<LatLng | null> {
  const { data } = await db
    .from("company")
    .select("latitude, longitude")
    .eq("id", companyId)
    .maybeSingle();
  return propertyLocation(data as { latitude: number | null; longitude: number | null } | null);
}
