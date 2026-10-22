import "server-only";
import { bearerSession, jsonError } from "./bearer";
import { isManager, memberRole } from "./bearer-member";
import type { MassEmailResult } from "./mass-email";

// The apps' Email Customers calls (/api/mass-email/...): the person's bearer sign-in, and an
// owner or admin of the shop they name. The database checks it again on every call.

type Session = NonNullable<Awaited<ReturnType<typeof bearerSession>>>;

export const ONLY_MANAGERS = "Only owners and admins can email customers.";

/** The session and shop for a manager's call, or the error response to send back. */
export async function managerCall(
  request: Request,
  companyId: unknown,
): Promise<{ session: Session; companyId: string } | Response> {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const role = await memberRole(session, companyId);
  if (!role) return jsonError("You’re not on this shop’s team.", 403);
  if (!isManager(role)) return jsonError(ONLY_MANAGERS, 403);
  return { session, companyId: companyId as string };
}

/** A send's result as the apps read it: {message, sent, failed} or {error, fields}. */
export function resultResponse(r: MassEmailResult): Response {
  if (r.ok) return Response.json({ message: r.message, sent: r.sent, failed: r.failed });
  return Response.json(
    { error: r.error ?? Object.values(r.fields ?? {})[0], fields: r.fields },
    { status: r.status },
  );
}
