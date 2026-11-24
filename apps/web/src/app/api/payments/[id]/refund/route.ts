import { clientFromRequest, jsonError } from "@/server/bearer";
import { failureMessage, failureStatus } from "@/server/failures";
import { refundPayment } from "@/server/refunds";
import { PaymentsNotConfigured } from "@/server/stripe";

/**
 * POST {amount_cents?}: refund a card or bank payment on a shop's invoice, from the website and
 * both apps (owner, 2026-11-24). Without amount_cents, all that's left. Owners and admins only;
 * the database refuses anyone else. Answers {refunded_cents, status, message}.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/payments/[id]/refund">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { amount_cents?: unknown };
  const amount = body.amount_cents == null ? null : Number(body.amount_cents);
  try {
    return Response.json(await refundPayment(db, id, amount));
  } catch (e) {
    if (e instanceof PaymentsNotConfigured) return jsonError(e.message, 400);
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
