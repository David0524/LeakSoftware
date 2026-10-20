import { bearerSession, jsonError } from "@/server/bearer";
import { memberRole } from "@/server/bearer-member";
import { shopLocation } from "@/server/address-suggest";
import { suggestAddresses } from "@/server/routing";

/**
 * POST { company_id, q }: real addresses for what's typed, nearest the shop first (owner,
 * 2026-10-20: "an auto complete or something for the mapping"), for the phone apps. Returns
 * { suggestions: AddressSuggestion[] }, empty when lookups aren't set up or the day's allowance
 * is used.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const role = await memberRole(session, body?.company_id);
  if (!role) return jsonError("You’re not on this shop’s team.", 403);
  const companyId = body!.company_id as string;
  const q = typeof body!.q === "string" ? body!.q : "";
  let problem: string | null = null;
  const suggestions = await suggestAddresses(
    session.db,
    companyId,
    q,
    await shopLocation(session.db, companyId),
    undefined,
    (p) => (problem = p),
  );
  // Why nothing came back, for the team's own shop (no key, the allowance, the service's error).
  return Response.json(problem ? { suggestions, problem } : { suggestions });
}
