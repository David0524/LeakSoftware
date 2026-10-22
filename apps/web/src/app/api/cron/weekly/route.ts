import { adminClient } from "@/server/admin";
import { siteOrigin } from "@/lib/origin";
import { SUPPORT_EMAIL } from "@/lib/site";
import { runWeeklySummaries } from "@/server/weekly-summary";

export const maxDuration = 300;

/**
 * GET /api/cron/weekly: Vercel Cron, every hour (apps/web/vercel.json). The weekly summary goes
 * to owners at 7 AM Monday in each shop's own time zone (owner, 2026-10-22), once per shop,
 * week, and person; the hours that aren't 7 AM anywhere find nobody due. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; nothing runs without it.
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
    return Response.json({
      weeklySummaries: await runWeeklySummaries(admin, await siteOrigin(), when, SUPPORT_EMAIL),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
