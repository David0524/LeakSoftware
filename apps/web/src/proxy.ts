import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import dev from "../../../config/supabase-dev.json";

const url = process.env.SUPABASE_URL || dev.url;
const key = process.env.SUPABASE_ANON_KEY || dev.publishableKey;

/** Office pages need a session; everything else is public. */
const OFFICE = ["/jobs", "/customers", "/schedule", "/settings", "/setup"];

/**
 * Refreshes the Supabase session cookie on every page request and sends signed-out visitors
 * of office pages to sign-in. This is an optimistic check only: every page and action checks
 * the user again on the server.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && OFFICE.some((p) => path === p || path.startsWith(`${p}/`))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|webp)$).*)",
  ],
};
