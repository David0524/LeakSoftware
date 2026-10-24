import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { RESET_COOKIE } from "@/lib/password-reset-email";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Landing page for email links: account confirmation, sign-in links, password resets.
 *
 * The emails carry a token hash (supabase/templates/, 2026-10-24), checked here on the server,
 * so a link works in any browser: the email app on a phone, or a different computer. The old
 * `code` links only worked in the browser that signed up, because the code's other half (the
 * PKCE verifier) is a cookie there; anywhere else the exchange failed and read as "link
 * expired", though Supabase had already confirmed the email (owner, 2026-10-24). They're still
 * accepted for links sent before the change.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/jobs";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/jobs";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type") as EmailOtpType | null;
  const type = rawType && OTP_TYPES.has(rawType) ? rawType : null;
  const { error } =
    tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error("missing token") };

  const target = url.clone();
  target.search = "";
  if (error && type === "recovery") {
    // A password reset link (owner, 2026-10-22): ask for a new one.
    target.pathname = "/forgot-password";
    target.searchParams.set("error", "link");
  } else if (error) {
    target.pathname = "/sign-in";
    // A confirmation link may fail only because it was already used (a mail scanner can open
    // links first), and then the email is confirmed: the sign-in page says to try the password.
    target.searchParams.set("error", type === "email" || type === "signup" ? "confirm" : "link");
    target.searchParams.set("next", next);
  } else {
    const [path, query] = next.split("?");
    target.pathname = path!;
    if (query) target.search = `?${query}`;
  }
  const response = NextResponse.redirect(target);
  // The new-password page works only just after a reset link, never for any signed-in session.
  if (!error && type === "recovery")
    response.cookies.set(RESET_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 15 * 60,
    });
  return response;
}

/**
 * Link checkers that only ask whether the page exists (HEAD) get an answer without using the
 * one-time link; without this, Next answers HEAD by running GET.
 */
export function HEAD() {
  return new NextResponse(null, { status: 200 });
}
