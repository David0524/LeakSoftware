import { siteOrigin } from "@/lib/origin";
import { jsonError } from "@/server/bearer";
import { failureMessage, failureStatus } from "@/server/failures";
import { managerCall } from "@/server/mass-email-api";
import { sendMonthInvoices } from "@/server/monthly-billing";

// Sending a month's invoices can take a while for a big shop (four at a time).
export const maxDuration = 300;

/**
 * POST {company_id, ids?}: the apps' Send All on a month's Monthly Billing page (owner,
 * 2026-11-15): the month's drafts (or the ids given), by email or text. Answers
 * {sent, failed: [{id, customer, reason}], message}.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/invoices/month/[month]/send">,
) {
  const body = (await request.json().catch(() => ({}))) as { company_id?: string; ids?: unknown };
  const call = await managerCall(
    request,
    body.company_id,
    "Only owners and admins can send the month’s invoices.",
  );
  if (call instanceof Response) return call;
  const { month } = await ctx.params;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : null;
  try {
    return Response.json(
      await sendMonthInvoices(
        call.session.db,
        call.session.userId,
        call.companyId,
        month,
        await siteOrigin(),
        ids,
      ),
    );
  } catch (e) {
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
