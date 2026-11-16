import { siteOrigin } from "@/lib/origin";
import { chargeCardOnFile } from "@/server/autopay";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { failureMessage, failureStatus } from "@/server/failures";

/**
 * POST: Charge Card on File from the apps (docs/design/2026-11-16-autopay.md). Owners and
 * admins; the database refuses anyone else. Answers {outcome, message}; a decline is an answer,
 * not an error.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/charge">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  try {
    return Response.json(await chargeCardOnFile(db, id, await siteOrigin()));
  } catch (e) {
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
