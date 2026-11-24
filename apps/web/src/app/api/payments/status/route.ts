import { payOverTimeOn, payOverTimeStatus } from "@leakbook/core";
import { jsonError } from "@/server/bearer";
import { managerCall } from "@/server/mass-email-api";
import { payLaterStatusFor, paymentsConfigured } from "@/server/stripe";

/**
 * GET ?company_id=: Settings › Payments and Deposits in the Android app: whether Affirm and
 * Klarna are on in the shop's Stripe account (docs/design/2026-11-16-autopay.md), and whether
 * it takes payments (Import Saved Cards shows then). Owners and admins. Answers
 * {payOverTime: "<status line>", ready: boolean}.
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
    const { data: account } = await call.session.db
      .from("stripe_account")
      .select("charges_enabled")
      .eq("company_id", call.companyId)
      .maybeSingle();
    const on = payOverTimeOn(data?.settings);
    return Response.json({
      payOverTime: payOverTimeStatus(on, on ? await payLaterStatusFor(call.companyId) : null),
      ready: Boolean(account?.charges_enabled) && paymentsConfigured(),
    });
  } catch {
    return jsonError("Couldn’t reach Stripe. Try again shortly.", 500);
  }
}
