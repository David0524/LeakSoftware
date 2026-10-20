import { siteOrigin } from "@/lib/origin";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { failureStatus } from "@/server/failures";
import { sendInvoice } from "@/server/invoices";

/** POST {channel: "email" | "sms_device", to}: send this invoice. Used by the phone. */
export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/send">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { channel?: string; to?: string };
  try {
    return Response.json(
      await sendInvoice(db, id, {
        channel: body.channel === "email" ? "email" : "sms_device",
        to: body.to ?? null,
        origin: await siteOrigin(),
      }),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), failureStatus(e));
  }
}
