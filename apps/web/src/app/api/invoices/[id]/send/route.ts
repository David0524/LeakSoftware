import { siteOrigin } from "@/lib/origin";
import { autopaySentNote, sendInvoiceWithAutopay } from "@/server/autopay";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { recipientFor } from "@/server/contact-on-file";
import { failureMessage, failureStatus } from "@/server/failures";

/**
 * POST {channel: "email" | "sms_device", to}: send this invoice. Used by the phone. A monthly
 * maintenance invoice for a customer on autopay is charged right after; `autopay` says how it
 * went (docs/design/2026-11-16-autopay.md).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/send">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { channel?: string; to?: string };
  try {
    const r = await sendInvoiceWithAutopay(db, id, {
      channel: body.channel === "email" ? "email" : "sms_device",
      // Without Text and Call Customers: the email on file (owner, 2026-11-23).
      to: await recipientFor(db, { invoice: id }, body.to ?? null),
      origin: await siteOrigin(),
    });
    return Response.json({ ...r, autopay: autopaySentNote(r.autopay).trim() || null });
  } catch (e) {
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
