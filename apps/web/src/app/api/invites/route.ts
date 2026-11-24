import { bearerSession, jsonError } from "@/server/bearer";
import { INVITE_EMAIL_PATTERN, createAndSendInvite } from "@/server/invites";

/**
 * POST { company_id, email, role }: Invite Someone from the Android app's Team page. Makes the
 * invite as the signed-in person (create_invite checks who may invite whom) and emails the link,
 * as the website does (owner, 2026-11-24). Answers { message, emailed }.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const companyId = typeof body?.company_id === "string" ? body.company_id : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role : "tech";
  if (!companyId) return jsonError("Choose a shop.", 400);
  if (!INVITE_EMAIL_PATTERN.test(email) || email.length > 200)
    return jsonError("Enter a valid email.", 400);
  const result = await createAndSendInvite(session.db, {
    companyId,
    userId: session.userId,
    email,
    role,
  });
  if (!result.ok) return jsonError(result.error || "Couldn’t make the invite. Try again.", 400);
  return Response.json({ message: result.message, emailed: result.emailed });
}
