import { bearerSession, jsonError } from "@/server/bearer";
import { failureMessage } from "@/server/failures";
import { siteOrigin } from "@/lib/origin";
import { TextingError, sendCompanyText, type Picture } from "@/server/texting";

/**
 * POST: text a customer from the company number, as the phone's signed-in person.
 * Body: { conversationId } or { customerId } or { companyId, phone }, plus body, pictures
 * (already uploaded to texts/{company}/...), and jobId.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const input = (await request.json().catch(() => null)) as {
    conversationId?: string;
    customerId?: string;
    companyId?: string;
    phone?: string;
    body?: string;
    pictures?: Picture[];
    jobId?: string | null;
    requestId?: string;
  } | null;
  if (!input) return jsonError("Send JSON.", 400);
  try {
    const sent = await sendCompanyText(
      session.db,
      session.userId,
      { ...input, body: String(input.body ?? "") },
      await siteOrigin(),
    );
    return Response.json(sent);
  } catch (e) {
    return jsonError(failureMessage(e), e instanceof TextingError ? 400 : 500);
  }
}
