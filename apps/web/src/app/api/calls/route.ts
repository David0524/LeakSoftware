import { bearerSession, jsonError } from "@/server/bearer";
import { siteOrigin } from "@/lib/origin";
import { TextingError, startCall } from "@/server/texting";

/**
 * POST { conversationId }: call a customer from the company number. Twilio rings the person's
 * own phone first, then connects them, so the customer sees the company number.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const input = (await request.json().catch(() => null)) as { conversationId?: string } | null;
  if (!input?.conversationId) return jsonError("Pick a conversation.", 400);
  try {
    return Response.json(
      await startCall(session.db, session.userId, input.conversationId, await siteOrigin()),
    );
  } catch (e) {
    if (e instanceof TextingError) return jsonError(e.message, 400);
    throw e;
  }
}
