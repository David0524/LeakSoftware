import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
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
  if (error) {
    target.pathname = "/sign-in";
    target.searchParams.set("error", "link");
    target.searchParams.set("next", next);
  } else {
    const [path, query] = next.split("?");
    target.pathname = path!;
    if (query) target.search = `?${query}`;
  }
  return NextResponse.redirect(target);
}
