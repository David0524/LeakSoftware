"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  heardFromOther,
  isUsNumber,
  parseHeardFrom,
  parseServices,
  passwordProblem,
  safePath,
  toE164,
  tooManyAttempts,
} from "@leakbook/core";
import { ACTIVE_COMPANY_COOKIE, getOffice, getUser } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import { createAccount, signInLinkByEmail } from "@/server/account-email";
import { attemptAllowed, attemptFailed } from "@/server/auth-limits";
import { billingConfigured, logPriceSyncError, syncSubscriptionPrice } from "@/server/billing";
import { saveLead } from "@/server/leads";
import { EMAIL_PATTERN, sendPasswordChanged, sendPasswordReset } from "@/server/password-reset";
import {
  newPasswordProblem,
  RESET_COOKIE,
  RESET_LINK_EXPIRED,
  resetRequestedMessage,
} from "@/lib/password-reset-email";
import { SUPPORT_EMAIL } from "@/lib/site";

import { friendlyDbError } from "@/lib/limits";
export interface FormState {
  error?: string;
  /** Field-level messages keyed by input name. */
  fields?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
}

/** Subscribing: an error, or the embedded Checkout's client secret to show on the page. */
export interface SubscribeState extends FormState {
  clientSecret?: string;
}

/** A pay button's state: an error, or Stripe's embedded Checkout to show in place. */
export interface PayState extends FormState {
  checkout?: { clientSecret: string; account: string; publishableKey: string };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** "How did you hear about us?" (owner, 2026-10-24): optional; anything unknown is dropped. */
function heardFrom(form: FormData) {
  const key = parseHeardFrom(text(form, "heard_from"));
  return { heard_from: key, heard_from_other: heardFromOther(key, text(form, "heard_from_other")) };
}

/** Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in. */
const safeNext = (next: string) => safePath(next);

const origin = siteOrigin;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  const password = String(form.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { error: "Enter your email and password.", values };
  if (!(await attemptAllowed("sign_in", email)))
    return { error: tooManyAttempts("sign_in"), values };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") {
      await attemptFailed("sign_in", email);
      return {
        error: "That email and password don’t match. Try again or use a sign-in link.",
        values,
      };
    }
    if (error.code === "email_not_confirmed") return resendConfirmation(email, values);
    return { error: friendlyDbError(error.message), values };
  }
  const next = safeNext(text(form, "next"));
  // Two-step sign-in: the code next, then on to where they were going.
  if (data.user.factors?.some((f) => f.status === "verified"))
    redirect(`/sign-in/verify?next=${encodeURIComponent(next)}`);
  redirect(next);
}

/**
 * The right password, but the email isn't confirmed yet: a new confirmation link, which works
 * on any device (owner, 2026-10-24).
 */
async function resendConfirmation(email: string, values: Record<string, string>) {
  if (!(await attemptAllowed("link", email, true)))
    return { error: tooManyAttempts("link"), values };
  let sent = (await signInLinkByEmail(email, "/setup", "confirm")) === "sent";
  if (!sent) {
    // No email on this server: Supabase's own.
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/setup` },
    });
    sent = !error;
  }
  return {
    error: sent
      ? `Confirm your email first. We sent a new link to ${email}; it works on any phone or computer.`
      : "Confirm your email first: open the link we emailed you. Couldn’t send a new one just now; try again in a few minutes.",
    values,
  };
}

export async function sendSignInLink(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  if (!email) return { error: "Enter your email.", values: { email } };
  if (!(await attemptAllowed("link", email, true)))
    return { error: tooManyAttempts("link"), values: { email } };
  const next = safeNext(text(form, "next"));
  // The server's own email, whose link works in any browser; Supabase's when it can't send.
  const outcome = await signInLinkByEmail(email, next);
  if (outcome !== "unavailable")
    return { message: `If ${email} has an account, a sign-in link is on its way.` };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  // Same answer whether or not the account exists.
  if (error && error.status !== 400 && error.code !== "otp_disabled") {
    return { error: friendlyDbError(error.message), values: { email } };
  }
  return { message: `If ${email} has an account, a sign-in link is on its way.` };
}

/**
 * New shops add a card for the 30-day trial (owner, 2026-10-16) when this server has Stripe
 * billing. Until the card is in, the shop is read-only.
 */
async function requireCard(companyId: string) {
  const admin = adminClient();
  if (!admin || !billingConfigured()) return;
  await admin.from("subscription").update({ card_required: true }).eq("company_id", companyId);
  // Shops made any other way (calling create_company directly) need a card too (security
  // audit, 2026-10-17): the database sets it at sign-up from now on.
  await admin.rpc("require_card_at_signup", { required: true });
}

const checkEmail = (email: string) =>
  `Check ${email} for a link to confirm your account. It works on any phone or computer, for an hour.`;

/** Start a trial: create the account and the company in one step. */
export async function startTrial(_: FormState, form: FormData): Promise<FormState> {
  const values = {
    name: text(form, "name"),
    company: text(form, "company"),
    email: text(form, "email"),
    phone: text(form, "phone"),
    services: parseServices(text(form, "services")) ?? "pool",
  };
  const heard = heardFrom(form);
  const password = String(form.get("password") ?? "");
  const fields: Record<string, string> = {};
  if (!values.name) fields.name = "Enter your name.";
  if (!values.company) fields.company = "Enter your company name.";
  if (!/^\S+@\S+\.\S+$/.test(values.email)) fields.email = "Enter a valid email.";
  // A number to call (owner, 2026-10-16: leads), US or Canada like texting.
  const phone = toE164(values.phone);
  if (!isUsNumber(phone)) fields.phone = "Enter a US or Canadian phone number.";
  const weak = passwordProblem(password);
  if (weak) fields.password = weak;
  const kept = {
    ...values,
    heard_from: heard.heard_from ?? "",
    heard_from_other: heard.heard_from_other ?? "",
  };
  if (Object.keys(fields).length) return { fields, values: kept };
  if (!(await attemptAllowed("sign_up", values.email, true)))
    return { error: tooManyAttempts("sign_up"), values: kept };

  const supabase = await createClient();
  const account = await createAccount(supabase, {
    email: values.email,
    password,
    data: {
      full_name: values.name,
      company_name: values.company,
      services: values.services,
      phone,
      // Kept with the account too, so a shop made after the email confirmation gets it.
      ...(heard.heard_from ? heard : {}),
      // The form says "By creating an account, you agree to the Terms and Privacy Policy.";
      // the database records when (profile.accepted_terms_at).
      accepted_terms: true,
    },
    next: "/setup",
  });
  if (account.kind === "error") return { error: account.error, values: kept };
  // On the leads list, now with the account, whether or not they go on to pay.
  await saveLead({ ...values, phone: phone ?? undefined, userId: account.userId ?? undefined });
  if (account.kind === "confirm") return { message: checkEmail(values.email) };
  // Pool Care, Leak Detection, or Both (owner, 2026-10-16): the shop starts with that
  // package's checklist, tests, and price book.
  const { data: companyId, error: companyError } = await supabase.rpc("create_company", {
    company_name: values.company,
    company_timezone: text(form, "timezone") || null,
    company_services: values.services,
    company_heard_from: heard.heard_from,
    company_heard_from_other: heard.heard_from_other,
  });
  if (companyError) return { error: friendlyDbError(companyError.message), values: kept };
  await supabase.from("profile").update({ phone }).eq("id", account.userId);
  await requireCard(String(companyId));
  redirect("/welcome");
}

/** Accounts confirmed by email create their company here. */
export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const company = text(form, "company");
  const heard = heardFrom(form);
  const kept = {
    company,
    heard_from: heard.heard_from ?? "",
    heard_from_other: heard.heard_from_other ?? "",
  };
  if (!company) return { fields: { company: "Enter your company name." }, values: kept };
  const supabase = await createClient();
  const { data: companyId, error } = await supabase.rpc("create_company", {
    company_name: company,
    company_timezone: text(form, "timezone") || null,
    company_services: parseServices(text(form, "services")) ?? "pool",
    company_heard_from: heard.heard_from,
    company_heard_from_other: heard.heard_from_other,
  });
  if (error) return { error: friendlyDbError(error.message), values: kept };
  await requireCard(String(companyId));
  redirect("/welcome");
}

/** Join a company from an invite link, creating the account first if needed. */
export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = text(form, "token");
  const supabase = await createClient();
  let user: { id: string } | null = await getUser();

  if (!user) {
    const mode = text(form, "mode");
    const email = text(form, "email");
    const password = String(form.get("password") ?? "");
    const name = text(form, "name");
    const values = { name, email };
    if (mode === "sign-up") {
      if (!name) return { fields: { name: "Enter your name." }, values };
      const weak = passwordProblem(password);
      if (weak) return { fields: { password: weak }, values };
      if (!(await attemptAllowed("sign_up", email, true)))
        return { error: tooManyAttempts("sign_up"), values };
      const account = await createAccount(supabase, {
        email,
        password,
        // Under the terms line, as on Start Free Trial.
        data: { full_name: name, accepted_terms: true },
        next: `/invite/${token}`,
      });
      if (account.kind === "error") return { error: account.error, values };
      if (account.kind === "confirm") return { message: checkEmail(email) };
      user = { id: account.userId };
    } else {
      if (!(await attemptAllowed("sign_in", email)))
        return { error: tooManyAttempts("sign_in"), values };
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === "invalid_credentials") await attemptFailed("sign_in", email);
        return { error: "That email and password don’t match.", values };
      }
      user = data.user;
    }
  }

  const { data: companyId, error } = await supabase.rpc("accept_invite", { invite_token: token });
  if (error) return { error: friendlyDbError(error.message) };
  // One more person on the team: the Sundeck Pro price may move up a tier.
  after(() => syncSubscriptionPrice(String(companyId)).catch(logPriceSyncError));
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, String(companyId), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/home");
}

export async function switchCompany(form: FormData) {
  const office = await getOffice();
  const id = text(form, "company");
  if (office.companies.some((c) => c.id === id)) {
    (await cookies()).set(ACTIVE_COMPANY_COOKIE, id, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/home");
}

/**
 * Forgot Password? (owner, 2026-10-22): emails a link to choose a new password. The same answer
 * whether or not the address has an account; the link works for an hour, once.
 */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  if (!EMAIL_PATTERN.test(email)) return { error: "Enter your email.", values: { email } };
  const outcome = await sendPasswordReset(email);
  if (outcome === "limited") return { error: tooManyAttempts("reset"), values: { email } };
  if (outcome === "unavailable")
    return {
      error: `Email isn’t working right now. Email ${SUPPORT_EMAIL} for help.`,
      values: { email },
    };
  return { message: resetRequestedMessage(email), values: { email } };
}

/**
 * The new password, from the reset link's session. With two-step on, the code comes first
 * (/reset-password sends them there). Every other device is signed out, and the person gets an
 * email saying so.
 */
export async function setNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  const jar = await cookies();
  if (!user || !jar.has(RESET_COOKIE)) return { error: RESET_LINK_EXPIRED };
  const password = String(form.get("password") ?? "");
  const problem = newPasswordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) return { fields: { password: problem } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return {
      error: /different from the old/i.test(error.message)
        ? "That’s your current password. Choose a new one."
        : error.message,
    };
  await supabase.auth.signOut({ scope: "others" });
  jar.delete(RESET_COOKIE);
  if (user.email) after(() => sendPasswordChanged(user.email!));
  return { message: "Your password is changed." };
}
