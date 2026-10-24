import { createClient as cookieClient } from "@/lib/supabase/server";
import { resolveMapProvider } from "@/lib/map-provider";
import { siteOrigin } from "@/lib/origin";
import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { appleKeys, mapkitToken } from "@/server/apple-maps";
import { SHOP_MAP_CAP_MESSAGE, takeMapBudget } from "@/server/routing";

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * GET ?company=…: a MapKit JS token for the website's live maps (owner, 2026-10-20,
 * docs/plans/apple-maps.md), as plain text. Signed in only, never stored by the browser or a
 * cache, good for 30 minutes and only on this site's own origin. Each token counts as one Apple
 * map view against the free allowance for every shop together (a token covers a page's maps,
 * so this overcounts, the safe direction). 404 when the website isn't on Apple Maps; 429 past
 * the allowance. On any refusal the page shows the Mapbox map instead.
 */
export async function GET(request: Request) {
  const refuse = (message: string, status: number) => {
    const res = jsonError(message, status);
    res.headers.set("cache-control", NO_STORE["cache-control"]);
    return res;
  };
  const session = await bearerSession(request);
  const db = session?.db ?? (await cookieClient());
  const userId = session?.userId ?? (await db.auth.getUser()).data.user?.id ?? null;
  if (!userId) return refuse("Sign in again.", 401);
  const companyId = new URL(request.url).searchParams.get("company");
  if (!(await memberRole({ db, userId, email: "" }, companyId)))
    return refuse("You’re not on this shop’s team.", 403);
  const keys = resolveMapProvider() === "apple" ? appleKeys() : null;
  if (!keys) return refuse("Apple Maps isn’t set up.", 404);
  const took = await takeMapBudget(db, companyId!, "apple_map_view", 1);
  if (!took.ok)
    return refuse(
      took.message === SHOP_MAP_CAP_MESSAGE ? took.message : "Today’s maps are used up.",
      429,
    );
  return new Response(mapkitToken(keys, await siteOrigin()), {
    headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE },
  });
}
