import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safePath } from "@leakbook/core";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign Out: a plain form post, not a server action, so it always works, including for staff
 * in a View Only support session (the proxy refuses the office's server actions there).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_COMPANY_COOKIE);
  // Admin Sign In's Sign Out and Switch goes on to sign-in; same-site paths only.
  const next = safePath((await request.formData().catch(() => null))?.get("next"), "/");
  return NextResponse.redirect(new URL(next, request.url), 303);
}
