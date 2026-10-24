import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/origin";
import {
  accountLink,
  confirmEmail,
  signInLinkEmail,
  type AccountEmail,
} from "@/lib/password-reset-email";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { SUPPORT_EMAIL } from "@/lib/site";
import { adminClient } from "./admin";
import { emailConfigured, sendEmail } from "./email";

// Account emails the server sends itself (owner, 2026-10-24: "link expired" on the
// confirmation email). Supabase's own confirmation and sign-in links finish with a code whose
// other half is a cookie in the browser that asked, so opening the email on a phone, or in
// another browser, failed and read as "link expired" (though Supabase had confirmed the email).
// Its email templates can't be changed on this project's plan with its built-in email, so, as
// with password resets, the server makes the token (admin generateLink) and emails a link to
// /auth/confirm, which checks the token hash on the server and works in any browser.

function from(): string {
  const domain = process.env.EMAIL_FROM_DOMAIN || "send.sundeckpro.com";
  return `"Sundeck Pro" <account@${domain}>`;
}

let autoconfirm: { at: number; value: boolean } | null = null;

/**
 * Whether new accounts must confirm their email (Supabase's "Confirm email"). Off in local and
 * test projects: sign-up then signs straight in, as before. Read from Supabase's public auth
 * settings, kept for 5 minutes; if they can't be read, confirmation is assumed.
 */
export async function confirmationRequired(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (autoconfirm && Date.now() - autoconfirm.at < 5 * 60_000) return !autoconfirm.value;
  try {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
    });
    if (!res.ok) return true;
    const settings = (await res.json()) as { mailer_autoconfirm?: boolean };
    autoconfirm = { at: Date.now(), value: settings.mailer_autoconfirm === true };
    return !autoconfirm.value;
  } catch {
    return true;
  }
}

async function send(to: string, message: AccountEmail) {
  await sendEmail({ companyId: null, from: from(), to, replyTo: SUPPORT_EMAIL, ...message });
}

export const ACCOUNT_EXISTS = "An account with this email already exists. Sign in instead.";

/** A new account: signed in now, waiting on its email confirmation, or refused. */
export type NewAccount =
  | { kind: "session"; userId: string }
  | { kind: "confirm"; userId: string | null }
  | { kind: "error"; error: string };

/**
 * Makes an account. Where Supabase asks new accounts to confirm their email, the server makes
 * it (unconfirmed) and emails the confirmation link itself; Supabase checks the password rules
 * again. An address still waiting for its confirmation gets a new link and the password just
 * chosen. Elsewhere (local and test projects), Supabase's sign-up signs straight in through
 * `client`, as before; it's also the fallback when this server can't send email.
 */
export async function createAccount(
  client: SupabaseClient,
  input: { email: string; password: string; data: Record<string, unknown>; next: string },
  db: SupabaseClient | null = adminClient(),
): Promise<NewAccount> {
  const email = input.email.trim().toLowerCase();
  const origin = await siteOrigin();
  if (db && emailConfigured() && (await confirmationRequired())) {
    const { data, error } = await db.auth.admin.generateLink({
      type: "signup",
      email,
      password: input.password,
      options: { data: input.data },
    });
    if (error)
      return {
        kind: "error",
        error:
          error.code === "email_exists" || error.code === "user_already_exists"
            ? ACCOUNT_EXISTS
            : error.message,
      };
    const hashed = data.properties?.hashed_token;
    if (hashed) {
      // An earlier, unconfirmed sign-up keeps its old password otherwise.
      if (data.user && !data.user.email_confirmed_at)
        await db.auth.admin.updateUserById(data.user.id, { password: input.password });
      await send(email, confirmEmail(accountLink(origin, hashed, "signup", input.next)));
      return { kind: "confirm", userId: data.user?.id ?? null };
    }
  }
  const { data, error } = await client.auth.signUp({
    email,
    password: input.password,
    options: {
      data: input.data,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(input.next)}`,
    },
  });
  if (error)
    return {
      kind: "error",
      error: error.code === "user_already_exists" ? ACCOUNT_EXISTS : error.message,
    };
  return data.session
    ? { kind: "session", userId: data.session.user.id }
    : { kind: "confirm", userId: data.user?.id ?? null };
}

export type LinkEmailOutcome = "sent" | "no_account" | "unavailable";

/**
 * Emails a one-time sign-in link to an existing account; opening it also confirms an
 * unconfirmed email, so it's the new confirmation link too (`as: "confirm"`). Unknown addresses
 * get nothing; callers answer the same either way.
 */
export async function signInLinkByEmail(
  rawEmail: string,
  next: string,
  as: "sign-in" | "confirm" = "sign-in",
  db: SupabaseClient | null = adminClient(),
): Promise<LinkEmailOutcome> {
  if (!db || !emailConfigured()) return "unavailable";
  const email = rawEmail.trim().toLowerCase();
  const { data: status } = await db.rpc("auth_email_status", { target_email: email });
  if (status !== "confirmed" && status !== "unconfirmed") return "no_account";
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return "unavailable";
  const link = accountLink(await siteOrigin(), hashed, "magiclink", next);
  await send(email, as === "confirm" ? confirmEmail(link) : signInLinkEmail(link));
  return "sent";
}
