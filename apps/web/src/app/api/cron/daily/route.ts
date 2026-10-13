import { adminClient } from "@/server/admin";
import { runFollowups } from "@/server/followups";
import { siteOrigin } from "@/lib/origin";

export const maxDuration = 300;

/**
 * GET /api/cron/daily: Vercel Cron, once a day (apps/web/vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; nothing runs without it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Not allowed" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Server key missing" }, { status: 503 });
  // ?at= runs the day as if it were another date (tests); only with the secret.
  const at = new URL(request.url).searchParams.get("at");
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
  const followups = await runFollowups(admin, await siteOrigin(), when);
  // Maintenance plans keep their visits made a few weeks ahead (20261012002400).
  const { data: visits, error } = await admin.rpc("extend_service_plans");
  return Response.json({ followups, maintenanceVisits: error ? error.message : visits });
}
