import { adminClient } from "@/server/admin";
import { runChemistryAlerts } from "@/server/chemistry-alerts";

export const maxDuration = 120;

/**
 * GET /api/cron/chemistry: Vercel Cron, every hour (apps/web/vercel.json). Owners and admins
 * hear about readings far outside their range, once per reading (owner, 2026-11-16). Vercel
 * sends `Authorization: Bearer $CRON_SECRET`; nothing runs without it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Not allowed" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Server key missing" }, { status: 503 });
  // ?at= runs the hour as if it were another time (tests); only with the secret.
  const at = new URL(request.url).searchParams.get("at");
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
  try {
    return Response.json({ chemistryAlerts: await runChemistryAlerts(admin, when) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
