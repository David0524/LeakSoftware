import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { RESET_COOKIE } from "@/lib/password-reset-email";
import { createClient } from "@/lib/supabase/server";

/** Landing page for email links (sign-in links and account confirmation). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/jobs";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/jobs";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };

  const target = url.clone();
  target.search = "";
  if (error && type === "recovery") {
    // A password reset link (owner, 2026-10-22): ask for a new one.
    target.pathname = "/forgot-password";
    target.searchParams.set("error", "link");
  } else if (error) {
    target.pathname = "/sign-in";
    target.searchParams.set("error", "link");
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
