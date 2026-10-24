import { createClient as cookieClient } from "@/lib/supabase/server";
import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { takeMapBudget } from "@/server/routing";

/**
 * POST { company_id }: may an interactive map load now (Enlarge)? Each load counts against
 * Mapbox's monthly free tier for every shop together (owner, 2026-10-20: "ensure I do not
 * surpass the free tier"). 204 when it may; 429 past the budget, and the page shows the map
 * image instead.
 */
export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return jsonError("Maps aren’t set up.", 503);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const session = await bearerSession(request);
  const db = session?.db ?? (await cookieClient());
  const userId = session?.userId ?? (await db.auth.getUser()).data.user?.id ?? null;
  if (!userId) return jsonError("Sign in again.", 401);
  const companyId = body?.company_id;
  if (!(await memberRole({ db, userId, email: "" }, companyId)))
    return jsonError("You’re not on this shop’s team.", 403);
  const took = await takeMapBudget(db, companyId as string, "map_load", 1);
  if (!took.ok) return jsonError(took.message, 429);
  return new Response(null, { status: 204 });
}
