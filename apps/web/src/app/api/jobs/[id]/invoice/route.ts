import { clientFromRequest, jsonError } from "@/server/bearer";
import { failureStatus } from "@/server/failures";
import { createInvoice } from "@/server/invoices";

/** POST: make this job's invoice draft (or return the open one). Used by the phone. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/invoice">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  try {
    return Response.json({ invoiceId: await createInvoice(db, id) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), failureStatus(e));
  }
}
