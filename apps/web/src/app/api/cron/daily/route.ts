import { adminClient } from "@/server/admin";
import { syncAllSubscriptionPrices } from "@/server/billing";
import { runFollowups } from "@/server/followups";
import { siteOrigin } from "@/lib/origin";
import { sendVisitReport } from "@/server/visit-reports";

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
  // Last month's finished visits become one draft invoice per customer (20261012002900).
  const billed = await admin.rpc("bill_maintenance_due", { at: when.toISOString() });
  // Customer links past their 180 days are turned off, so the next send makes a new one.
  const links = await admin.rpc("expire_share_links");
  // Sundeck Pro prices follow each shop's package and people; this catches anything missed.
  const prices = await syncAllSubscriptionPrices(admin);
  // Visit reports that should have gone by themselves but didn't (a phone completed the
  // visit and never told the server): sent by email now.
  const due = await admin.rpc("visit_reports_due");
  const origin = await siteOrigin();
  let visitReports = 0;
  for (const v of (due.data ?? []) as { job_id: string }[]) {
    try {
      const r = await sendVisitReport(admin, v.job_id, { automatic: true, origin });
      if (!("skipped" in r)) visitReports++;
    } catch {
      // Tried again tomorrow while the visit is within two days.
    }
  }
  return Response.json({
    followups,
    subscriptionPrices: prices,
    expiredLinks: links.error ? links.error.message : links.data,
    maintenanceVisits: error ? error.message : visits,
    monthlyInvoices: billed.error ? billed.error.message : billed.data,
    visitReports: due.error ? due.error.message : visitReports,
  });
}
