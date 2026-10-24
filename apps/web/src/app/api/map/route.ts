import { siteOrigin } from "@/lib/origin";
import { decodePins } from "@leakbook/core";
import { createClient as cookieClient } from "@/lib/supabase/server";
import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { mapsConfigured, resolveMapProvider } from "@/lib/map-provider";
import { appleKeys } from "@/server/apple-maps";
import { drawMapImage } from "@/server/map-draw";
import { legFetcher, routePaths } from "@/server/route-paths";
import { SHOP_MAP_CAP_MESSAGE, takeMapBudget } from "@/server/routing";

/** Map images each shop may draw per day (MAP_DAILY_LIMIT, default 1500). */
function mapLimit(): number {
  const n = Number(process.env.MAP_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}

/**
 * GET ?company=…&pins=…&w=…&h=…[&color=orange][&theme=dark]: a map image of a day's stops (owner, 2026-10-20,
 * docs/plans/route-maps.md), for the website (signed in) and Android (Authorization: Bearer).
 * The pins come from core's dayMapPins and encodePins. Kept by the browser for a day.
 * On Apple Maps (docs/plans/apple-maps.md) the image is an Apple Snapshot with our pins drawn on
 * it, for any number of stops (owner, 2026-10-24); Mapbox draws it when Apple's allowance is
 * used or Apple answers with an error. Both are framed by core mapView. The route follows the roads (owner, 2026-10-23): each
 * leg's path from the same service as the image, saved once per shop (server/route-paths.ts).
 */
export async function GET(request: Request) {
  if (!mapsConfigured()) return jsonError("Maps aren’t set up.", 503);
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

  const w = Number(url.searchParams.get("w")) || 600;
  const h = Number(url.searchParams.get("h")) || 300;
  // Dark mode gets a dark map rather than a dimmed street map.
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  // The tech's team color (owner, 2026-10-23); missing or unknown is water blue.
  const color = url.searchParams.get("color");

  // Past the shop's own share of the maps (security review M1), it says so in plain words.
  let shopCapped = false;
  const drawn = await drawMapImage({
    pins,
    size: { w, h },
    theme,
    color,
    apple: resolveMapProvider() === "apple" ? appleKeys() : null,
    pinBase: await siteOrigin(),
    mapboxToken: process.env.MAPBOX_TOKEN,
    take: async (kind) => {
      const took = await takeMapBudget(db, companyId!, kind, 1);
      if (!took.ok && took.message === SHOP_MAP_CAP_MESSAGE) shopCapped = true;
      return took.ok;
    },
    // The route along the roads (owner, 2026-10-23): each leg saved once per shop.
    paths: (provider, points) =>
      routePaths(db, companyId!, provider, points, legFetcher(db, companyId!, provider)),
  });
  if (!drawn.ok)
    return jsonError(
      drawn.status === 429 && shopCapped ? SHOP_MAP_CAP_MESSAGE : drawn.message,
      drawn.status,
    );
  return image(drawn.res, drawn.complete, drawn.by, drawn.note);
}

/**
 * The drawn image, kept by the browser for a day (the same cache for either service); five
 * minutes while a leg is still drawn straight (an error, or the day's allowance), so the road
 * route shows once it's there.
 */
function image(res: Response, complete: boolean, by: string, note?: string): Response {
  return new Response(res.body, {
    headers: {
      // Which service drew it, and why not Apple when it wasn't (no secrets).
      "x-map-by": by,
      ...(note ? { "x-map-note": note.replace(/[^\x20-\x7e]/g, " ") } : {}),
      "content-type": res.headers.get("content-type") ?? "image/png",
      "cache-control": `private, max-age=${complete ? 86400 : 300}`,
    },
  });
}
