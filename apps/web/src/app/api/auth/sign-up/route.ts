import { createClient } from "@supabase/supabase-js";
import { heardFromOther, parseHeardFrom, passwordProblem, tooManyAttempts } from "@leakbook/core";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { createAccount } from "@/server/account-email";
import { attemptAllowed } from "@/server/auth-limits";
import { EMAIL_PATTERN } from "@/server/password-reset";

/**
 * Create an Account from the iPhone and Android apps (owner, 2026-10-24), signed out:
 * { name, email, password, heard_from?, heard_from_other?, accepted_terms? } -> { confirmEmail }
 * or { error }. `accepted_terms: true`: the screen showed "By creating an account, you agree to
 * the Terms and Privacy Policy." (apps from 2026-10-24); the database records when.
 * Through the server, like the website's sign-up: the password rules, the limit on sign-ups
 * per email and visitor, and the confirmation email the server sends, whose link works on any
 * phone or computer. `confirmEmail: false` (no confirmation on this project): the app signs in
 * with the password next.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const name = str("name").trim();
  const email = str("email").trim();
  const password = str("password");
  if (!name || !EMAIL_PATTERN.test(email) || email.length > 200)
    return Response.json({ error: "Enter your name and email." }, { status: 400 });
  const weak = passwordProblem(password);
  if (weak) return Response.json({ error: weak }, { status: 400 });
  if (!(await attemptAllowed("sign_up", email, true)))
    return Response.json({ error: tooManyAttempts("sign_up") }, { status: 429 });
  const heard = parseHeardFrom(str("heard_from"));
  const other = heardFromOther(heard, str("heard_from_other"));
  // No cookies here: the app keeps its own session.
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const account = await createAccount(client, {
    email,
    password,
    data: {
      full_name: name,
      ...(heard ? { heard_from: heard } : {}),
      ...(other ? { heard_from_other: other } : {}),
      ...(body.accepted_terms === true ? { accepted_terms: true } : {}),
    },
    next: "/setup",
  });
  if (account.kind === "error") return Response.json({ error: account.error }, { status: 400 });
  return Response.json(
    { confirmEmail: account.kind === "confirm" },
    { headers: { "cache-control": "no-store" } },
  );
}
