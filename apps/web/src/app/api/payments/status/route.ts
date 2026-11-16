import { payOverTimeOn, payOverTimeStatus } from "@leakbook/core";
import { jsonError } from "@/server/bearer";
import { managerCall } from "@/server/mass-email-api";
import { payLaterStatusFor } from "@/server/stripe";

/**
 * GET ?company_id=: Settings › Payments and Deposits in the Android app: whether Affirm and
 * Klarna are on in the shop's Stripe account (docs/design/2026-11-16-autopay.md). Owners and
 * admins. Answers {payOverTime: "<status line>"}.
 */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("company_id");
  const call = await managerCall(request, companyId, "Only owners and admins can see this.");
  if (call instanceof Response) return call;
  try {
    const { data } = await call.session.db
      .from("company")
      .select("settings")
      .eq("id", call.companyId)
      .single();
    const on = payOverTimeOn(data?.settings);
    return Response.json({
      payOverTime: payOverTimeStatus(on, on ? await payLaterStatusFor(call.companyId) : null),
    });
  } catch {
    return jsonError("Couldn’t reach Stripe. Try again shortly.", 500);
  }
}
