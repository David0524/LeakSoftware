import type { ReportTemplateKey } from "@leakbook/core";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { draftReport } from "@/server/reports";

export const maxDuration = 120;

/** POST {template}: write (or rewrite) the draft report for this job. Used by the phone. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/reports">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { template?: string };
  const template = (body.template === "partner" ? "partner" : "homeowner") as ReportTemplateKey;
  try {
    return Response.json(await draftReport(db, id, template));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
