import { clientFromRequest, jsonError } from "@/server/bearer";
import { siteOrigin } from "@/lib/origin";
import { sendReport } from "@/server/reports";

export const maxDuration = 120;

/** POST {channel: "email" | "sms_device", to}: send this report. Used by the phone. */
export async function POST(request: Request, ctx: RouteContext<"/api/reports/[id]/send">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { channel?: string; to?: string };
  try {
    const result = await sendReport(db, id, {
      channel: body.channel === "email" ? "email" : "sms_device",
      to: body.to ?? null,
      origin: await siteOrigin(),
    });
    return Response.json(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
