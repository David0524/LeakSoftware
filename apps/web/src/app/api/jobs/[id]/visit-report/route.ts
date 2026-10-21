import { siteOrigin } from "@/lib/origin";
import { bearerSession, jsonError } from "@/server/bearer";
import { failureStatus } from "@/server/failures";
import { sendVisitReport, type VisitChannel } from "@/server/visit-reports";

export const maxDuration = 60;

/**
 * POST { automatic?, channel?, to? }: send this maintenance visit's report (owner, 2026-10-20).
 * The phone calls it with `automatic` after a completed visit reaches the server (the database
 * sends only in shops that chose Automatic, and only once), or with a `channel` for Send Visit
 * Report: "email" (to the address given, else the customer's), "text" (from the company
 * number), or "sms_device" (the link comes back for the phone's own Messages).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/visit-report">) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    automatic?: unknown;
    channel?: unknown;
    to?: unknown;
  };
  const channel =
    body.channel === "email" || body.channel === "text" || body.channel === "sms_device"
      ? (body.channel as VisitChannel)
      : undefined;
  if (!body.automatic && !channel) return jsonError("Choose how to send it.", 400);
  try {
    return Response.json(
      await sendVisitReport(session.db, id, {
        automatic: body.automatic === true,
        channel,
        to: typeof body.to === "string" ? body.to : null,
        origin: await siteOrigin(),
        userId: session.userId,
      }),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), failureStatus(e));
  }
}
