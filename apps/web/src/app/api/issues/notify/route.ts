import { adminClient } from "@/server/admin";
import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { notify } from "@/server/push";
import { notifyIssuesWith } from "@/server/service-issues";

/**
 * POST { company_id, ids }: issues a phone reported have reached the server (they sync like any
 * row, offline too); the owners and admins hear about each once (docs/design/
 * 2026-11-16-service-issues.md). Phones call it after a sync for their reports the server hasn't
 * announced (service_issue.notified_at, set here). Only issues the caller can see count.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const role = await memberRole(session, body?.company_id);
  if (!role) return jsonError("You’re not on this shop’s team.", 403);
  const companyId = body!.company_id as string;
  const asked = Array.isArray(body!.ids)
    ? body!.ids.filter((x): x is string => typeof x === "string").slice(0, 50)
    : [];
  if (asked.length === 0) return Response.json({ notified: 0 });
  const { data: visible } = await session.db
    .from("service_issue")
    .select("id")
    .eq("company_id", companyId)
    .in("id", asked);
  const ids = ((visible ?? []) as { id: string }[]).map((r) => r.id);
  const admin = adminClient();
  if (!admin || ids.length === 0) return Response.json({ notified: 0 });
  const notified = await notifyIssuesWith(admin, (n) => notify(admin, { ...n, kind: "issue" }), {
    companyId,
    ids,
  });
  return Response.json({ notified });
}
