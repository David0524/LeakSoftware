import { siteOrigin } from "@/lib/origin";
import { bearerSession, jsonError } from "@/server/bearer";
import { failureMessage, failureStatus } from "@/server/failures";
import { sendPaymentReceipt } from "@/server/invoices";
import { recipientFor } from "@/server/contact-on-file";

/**
 * POST {channel: "email" | "text", to, paymentId?}: send the receipt for a payment on this
 * invoice (the latest received when none is named). Used by the phone (2026-10-22).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/receipt">) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    channel?: string;
    to?: string;
    paymentId?: string | null;
  };
  try {
    return Response.json(
      await sendPaymentReceipt(session.db, session.userId, id, {
        channel: body.channel === "text" ? "text" : "email",
        // Without Text and Call Customers: the customer's own on file (owner, 2026-11-23).
        to:
          (await recipientFor(
            session.db,
            { invoice: id },
            String(body.to ?? ""),
            body.channel === "text" ? "phone" : "email",
          )) ?? "",
        paymentId: typeof body.paymentId === "string" ? body.paymentId : null,
        origin: await siteOrigin(),
      }),
    );
  } catch (e) {
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
