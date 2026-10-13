import { UNSIGNED_CUSTOMER_AWAY } from "@leakbook/core";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { finishReport } from "@/server/reports";

/**
 * POST {customerAway}: finish this report after the customer signed on the phone (their
 * signature synced first), or with Customer Not Here. Used by the phone.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/reports/[id]/finish">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { customerAway?: boolean };
  try {
    const token = await finishReport(db, id, body.customerAway ? UNSIGNED_CUSTOMER_AWAY : null);
    return Response.json({ token });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
