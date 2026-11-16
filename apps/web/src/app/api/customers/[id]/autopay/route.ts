import { siteOrigin } from "@/lib/origin";
import { customerAutopayAction, type AutopayAction, type RequestChannel } from "@/server/autopay";
import { bearerSession, jsonError } from "@/server/bearer";
import { failureMessage, failureStatus } from "@/server/failures";

const ACTIONS: AutopayAction[] = ["turn_off", "turn_on", "remove", "request"];
const CHANNELS: RequestChannel[] = ["email", "text", "link"];

/**
 * POST {action: "turn_off" | "turn_on" | "remove" | "request", channel?: "email" | "text" |
 * "link"}: the customer page's Autopay group in the apps (docs/design/2026-11-16-autopay.md).
 * Owners and admins; the database refuses anyone else. Answers {message, link?, text?}.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/customers/[id]/autopay">) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; channel?: string };
  const action = ACTIONS.find((a) => a === body.action);
  if (!action) return jsonError("Pick what to do.", 400);
  try {
    return Response.json(
      await customerAutopayAction(session.db, session.userId, id, action, {
        channel: CHANNELS.find((c) => c === body.channel) ?? "link",
        origin: await siteOrigin(),
      }),
    );
  } catch (e) {
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
