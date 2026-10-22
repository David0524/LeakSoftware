import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import dev from "../../../config/supabase-dev.json";
import { malformedLink } from "@/lib/limits";
import { isStaff } from "@/server/leads";
import { viewOnlyIn } from "@/server/support";

const url = process.env.SUPABASE_URL || dev.url;
const key = process.env.SUPABASE_ANON_KEY || dev.publishableKey;

/** Office pages need a session; everything else is public. */
const OFFICE = [
  "/home",
  "/jobs",
  "/customers",
  "/schedule",
  "/today",
  "/settings",
  "/setup",
  "/sign-off",
];

const VIEW_ONLY = "Support is in View Only for this shop. Nothing was changed.";

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
  // Checks the token's signature locally (and refreshes an expired session) without a call to
  // the auth server on every request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const path = request.nextUrl.pathname;
  // Sundeck Pro staff in a View Only support session (Admin portal): the database refuses
  // their changes; this refuses the website's own (server actions and API routes that write
  // with the server's key). The portal itself and End Session stay open.
  if (
    user &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    (request.headers.has("next-action") || path.startsWith("/api/")) &&
    !path.startsWith("/admin") &&
    !path.startsWith("/api/admin/")
  ) {
    const who = {
      id: String(user.sub),
      email: typeof user.email === "string" ? user.email : null,
      aal: typeof user.aal === "string" ? user.aal : "aal1",
    };
    if (
      isStaff({ ...who, user_metadata: {} }) &&
      // lb_company: ACTIVE_COMPANY_COOKIE (lib/auth.ts), the shop the office is showing.
      (await viewOnlyIn(who, request.cookies.get("lb_company")?.value))
    )
      return new NextResponse(VIEW_ONLY, {
        status: 403,
        headers: { "content-type": "text/plain" },
      });
  }
  if (!user && OFFICE.some((p) => path === p || path.startsWith(`${p}/`))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(signIn);
  }
  // A job, customer, conversation, or customer page link with a mistyped id or token answers
  // 404 before the page starts streaming (once it streams, the status is already 200). Ids that
  // are well formed but unknown are found out by the page itself, which shows the same Page Not
  // Found.
  if (malformedLink(path)) {
    const missing = request.nextUrl.clone();
    missing.pathname = "/_not-found";
    const notFound = NextResponse.rewrite(missing, { status: 404 });
    for (const c of response.cookies.getAll()) notFound.cookies.set(c);
    return notFound;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|webp)$).*)",
  ],
};
