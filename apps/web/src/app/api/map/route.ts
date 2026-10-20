import { decodePins } from "@leakbook/core";
import { createClient as cookieClient } from "@/lib/supabase/server";
import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { staticMapUrl } from "@/server/map-image";
import { mapboxBudget } from "@/server/routing";

/** Map images each shop may draw per day (MAP_DAILY_LIMIT, default 1500). */
function mapLimit(): number {
  const n = Number(process.env.MAP_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}

/**
 * GET ?company=…&pins=…&w=…&h=…[&theme=dark]: a map image of a day's stops (owner, 2026-10-20,
 * docs/plans/route-maps.md), for the website (signed in) and Android (Authorization: Bearer).
 * The pins come from core's dayMapPins and encodePins. Kept by the browser for a day.
 */
export async function GET(request: Request) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return jsonError("Maps aren’t set up.", 503);
  const url = new URL(request.url);
  const companyId = url.searchParams.get("company");
  const pins = decodePins(url.searchParams.get("pins") ?? "");
  if (!pins) return jsonError("Nothing to map.", 400);

  const session = await bearerSession(request);
  let db;
  let userId: string | null = null;
  if (session) {
    db = session.db;
    userId = session.userId;
  } else {
    db = await cookieClient();
    userId = (await db.auth.getUser()).data.user?.id ?? null;
  }
  if (!userId) return jsonError("Sign in again.", 401);
  const role = await memberRole({ db, userId, email: "" }, companyId);
  if (!role) return jsonError("You’re not on this shop’s team.", 403);

  const { data: ok, error } = await db.rpc("routing_use", {
    target_company: companyId,
    use_kind: "map",
    how_many: 1,
    day_limit: mapLimit(),
  });
  if (error || ok !== true) return jsonError("Today’s maps are used up. Try again tomorrow.", 429);
  // Mapbox's monthly free tier, shared by every shop: never billed.
  if (!(await mapboxBudget(db, companyId!, "static_image", 1)))
    return jsonError("This month’s maps are used up.", 429);

  const w = Number(url.searchParams.get("w")) || 600;
  const h = Number(url.searchParams.get("h")) || 300;
  // Dark mode gets Mapbox's dark map rather than a dimmed street map.
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const res = await fetch(staticMapUrl(pins, { w, h }, token, theme));
  if (!res.ok) {
    console.error(`Map image: Mapbox ${res.status}`);
    return jsonError("The map couldn’t be drawn.", 502);
  }
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/png",
      "cache-control": "private, max-age=86400",
    },
  });
}
