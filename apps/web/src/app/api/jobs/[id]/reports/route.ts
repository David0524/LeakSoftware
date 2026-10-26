import type { ReportTemplateKey } from "@leakbook/core";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { failureMessage, failureStatus } from "@/server/failures";
import { draftReport } from "@/server/reports";

export const maxDuration = 120;

/** POST {template}: write (or rewrite) the draft report for this job. Used by the phone. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/reports">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  // Only the homeowner report is written now (the partner report is gone, 2026-10-18).
  const template: ReportTemplateKey = "homeowner";
  try {
    return Response.json(await draftReport(db, id, template));
  } catch (e) {
    return jsonError(failureMessage(e), failureStatus(e));
  }
}
