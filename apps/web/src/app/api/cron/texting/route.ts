import { siteOrigin } from "@/lib/origin";
import { adminClient } from "@/server/admin";
import { advanceDueRegistrations } from "@/server/texting-registration";

export const maxDuration = 300;

/**
 * GET /api/cron/texting: Vercel Cron, every 30 minutes (apps/web/vercel.json). Follows each
 * shop's texting registration at Twilio (docs/plans/texting-registration.md) until its number
 * can text. Vercel sends `Authorization: Bearer $CRON_SECRET`; nothing runs without it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Not allowed" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Server key missing" }, { status: 503 });
  try {
    return Response.json(await advanceDueRegistrations(admin, await siteOrigin()));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
