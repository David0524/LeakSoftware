import { bearerSession, jsonError } from "@/server/bearer";
import { isManager, memberRole } from "@/server/bearer-member";
import { locateHomeWith, memberStartOf } from "@/server/member-start";
import { locateCompanyWith, locatePropertyWith } from "@/server/route-days";
import { routingConfigured } from "@/server/routing";

/**
 * POST { company_id, property_id } or { company_id, shop: true }: find a pool's (or, for owners
 * and admins, the shop's) location from its address after the app changed it (owner,
 * 2026-10-20: "change an address once set and have it calculate"). The app clears the old
 * coordinates in the same write as the address; the found ones come back here and by sync.
 * { company_id, home_user_id }: a person's home address, for where their day starts (their
 * own, or anyone's for owners and admins; docs/design/2026-10-21-start-from-home.md).
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const role = await memberRole(session, body?.company_id);
  if (!role) return jsonError("You’re not on this shop’s team.", 403);
  if (!routingConfigured()) return jsonError("Address lookup isn’t set up.", 503);
  const companyId = body!.company_id as string;
  if (body!.shop === true) {
    if (!isManager(role)) return jsonError("Only owners and admins can move the shop.", 403);
    const found = await locateCompanyWith(session.db, companyId);
    if (found) return Response.json({ latitude: found.lat, longitude: found.lng });
    const { data } = await session.db
      .from("company")
      .select("latitude, longitude")
      .eq("id", companyId)
      .maybeSingle();
    return data?.latitude != null && data?.longitude != null
      ? Response.json({ latitude: data.latitude, longitude: data.longitude })
      : jsonError("That address wasn’t found. Check it.", 404);
  }
  if (body!.home_user_id !== undefined) {
    const userId = body!.home_user_id;
    if (typeof userId !== "string" || !userId) return jsonError("Name the person.", 400);
    if (userId !== session.userId && !isManager(role))
      return jsonError("Only owners and admins can set someone else’s start.", 403);
    const found = await locateHomeWith(session.db, companyId, userId);
    if (found) return Response.json({ latitude: found.lat, longitude: found.lng });
    // Nothing to look up (the address hasn't changed since it was found): what it has.
    const row = await memberStartOf(session.db, companyId, userId);
    return row?.home_latitude != null && row.home_longitude != null
      ? Response.json({ latitude: row.home_latitude, longitude: row.home_longitude })
      : jsonError("That address wasn’t found. Check it.", 404);
  }
  if (typeof body!.property_id !== "string") return jsonError("Name the pool.", 400);
  const found = await locatePropertyWith(session.db, companyId, body!.property_id);
  if (found) return Response.json({ latitude: found.lat, longitude: found.lng });
  // Nothing to look up (the address hasn't changed since its pin): the pin it has.
  const { data } = await session.db
    .from("property")
    .select("latitude, longitude")
    .eq("id", body!.property_id)
    .eq("company_id", companyId)
    .maybeSingle();
  return data?.latitude != null && data?.longitude != null
    ? Response.json({ latitude: data.latitude, longitude: data.longitude })
    : jsonError("That address wasn’t found. Check it.", 404);
}
