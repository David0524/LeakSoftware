import { bearerSession, jsonError } from "@/server/bearer";
import {
  FEATURE_REQUEST_EMPTY,
  FEATURE_REQUEST_THANKS,
  featureRequestText,
  recordFeatureRequest,
} from "@/server/feature-requests";

/**
 * POST { request, company_id, page? }: Request a Feature from the apps' More › Help (owner,
 * 2026-10-19: "a text box built into the platform"). Saved like the website's. The person must
 * be an active member of the shop they name (or their first shop when none is named).
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = featureRequestText(body?.request);
  if (!text) return jsonError(FEATURE_REQUEST_EMPTY, 400);
  const [{ data: memberships }, { data: profile }] = await Promise.all([
    session.db
      .from("membership")
      .select("company:company_id (id, name)")
      .eq("user_id", session.userId)
      .eq("status", "active")
      .is("deleted_at", null),
    session.db.from("profile").select("full_name").eq("id", session.userId).maybeSingle(),
  ]);
  const companies = (
    (memberships ?? []) as unknown as { company: { id: string; name: string } | null }[]
  )
    .map((m) => m.company)
    .filter((c): c is { id: string; name: string } => !!c);
  const company =
    typeof body?.company_id === "string"
      ? companies.find((c) => c.id === body.company_id)
      : companies[0];
  if (!company) return jsonError("You’re not on this shop’s team.", 403);
  const result = await recordFeatureRequest({
    user: {
      id: session.userId,
      name: (profile as { full_name: string | null } | null)?.full_name ?? null,
      email: session.email,
    },
    company,
    request: text,
    page: typeof body?.page === "string" ? body.page : "App",
  });
  return result.ok
    ? Response.json({ message: FEATURE_REQUEST_THANKS })
    : jsonError(result.error, 503);
}
