import { tooManyAttempts } from "@leakbook/core";
import { resetRequestedMessage } from "@/lib/password-reset-email";
import { SUPPORT_EMAIL } from "@/lib/site";
import { EMAIL_PATTERN, sendPasswordReset } from "@/server/password-reset";

/**
 * Forgot Password? from the iPhone and Android apps (owner, 2026-10-22), signed out:
 * { email } -> { message }. The same answer whether or not the address has an account.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 200)
    return Response.json({ error: "Enter your email." }, { status: 400 });
  const outcome = await sendPasswordReset(email);
  if (outcome === "limited")
    return Response.json({ error: tooManyAttempts("reset") }, { status: 429 });
  if (outcome === "unavailable")
    return Response.json(
      { error: `Email isn’t working right now. Email ${SUPPORT_EMAIL} for help.` },
      { status: 503 },
    );
  return Response.json(
    { message: resetRequestedMessage(email) },
    { headers: { "cache-control": "no-store" } },
  );
}
