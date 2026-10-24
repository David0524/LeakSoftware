import { decodePins, encodePolyline, routeOrder } from "@leakbook/core";
import { createClient as cookieClient } from "@/lib/supabase/server";
import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { legFetcher, routePaths } from "@/server/route-paths";

/**
 * GET ?company=…&pins=…&provider=apple|mapbox: the day's route along the roads (owner,
 * 2026-10-23), for the live maps in Enlarge (MapKit JS with Apple's paths, Mapbox GL with
 * Mapbox's): { legs: [encoded polyline, …], complete }, one per leg in route order, each its road
 * path or, for now, the straight line. Each leg is asked of the service once and saved for the
 * shop (server/route-paths.ts), so opening the map again asks nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("company");
  const pins = decodePins(url.searchParams.get("pins") ?? "");
  const provider = url.searchParams.get("provider");
  if (!pins) return jsonError("Nothing to map.", 400);
  if (provider !== "apple" && provider !== "mapbox") return jsonError("Unknown map.", 400);

  const session = await bearerSession(request);
  const db = session?.db ?? (await cookieClient());
  const userId = session?.userId ?? (await db.auth.getUser()).data.user?.id ?? null;
  if (!userId) return jsonError("Sign in again.", 401);
  if (!(await memberRole({ db, userId, email: "" }, companyId)))
    return jsonError("You’re not on this shop’s team.", 403);

  const points = routeOrder(pins).map((p) => p.at);
  const route = await routePaths(
    db,
    companyId!,
    provider,
    points,
    legFetcher(db, companyId!, provider),
  );
  return Response.json(
    { legs: route.legs.map((l) => encodePolyline(l)), complete: route.complete },
    { headers: { "cache-control": `private, max-age=${route.complete ? 86400 : 300}` } },
  );
}
