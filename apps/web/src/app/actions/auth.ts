"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE, getOffice, getUser } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  /** Field-level messages keyed by input name. */
  fields?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in. */
function safeNext(next: string, fallback = "/jobs") {
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

const origin = siteOrigin;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  const password = String(form.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { error: "Enter your email and password.", values };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.code === "invalid_credentials"
          ? "That email and password don’t match. Try again or use a sign-in link."
          : error.message,
      values,
    };
  }
  redirect(safeNext(text(form, "next")));
}

export async function sendSignInLink(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  if (!email) return { error: "Enter your email.", values: { email } };
  const supabase = await createClient();
  const next = safeNext(text(form, "next"));
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  // Same answer whether or not the account exists.
  if (error && error.status !== 400 && error.code !== "otp_disabled") {
    return { error: error.message, values: { email } };
  }
  return { message: `If ${email} has an account, a sign-in link is on its way.` };
}

/** Start a trial: create the account and the company in one step. */
export async function startTrial(_: FormState, form: FormData): Promise<FormState> {
  const values = {
    name: text(form, "name"),
    company: text(form, "company"),
    email: text(form, "email"),
  };
  const password = String(form.get("password") ?? "");
  const fields: Record<string, string> = {};
  if (!values.name) fields.name = "Enter your name.";
  if (!values.company) fields.company = "Enter your company name.";
  if (!/^\S+@\S+\.\S+$/.test(values.email)) fields.email = "Enter a valid email.";
  if (password.length < 10) fields.password = "Use at least 10 characters.";
  if (Object.keys(fields).length) return { fields, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password,
    options: {
      data: { full_name: values.name, company_name: values.company },
      emailRedirectTo: `${await origin()}/auth/confirm?next=/setup`,
    },
  });
  if (error) {
    return {
      error:
        error.code === "user_already_exists"
          ? "An account with this email already exists. Sign in instead."
          : error.message,
      values,
    };
  }
  if (!data.session) {
    return { message: `Check ${values.email} for a link to confirm your account.` };
  }
  const { error: companyError } = await supabase.rpc("create_company", {
    company_name: values.company,
    company_timezone: text(form, "timezone") || null,
  });
  if (companyError) return { error: companyError.message, values };
  redirect("/jobs");
}

/** Accounts confirmed by email create their company here. */
export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const company = text(form, "company");
  if (!company) return { fields: { company: "Enter your company name." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_company", {
    company_name: company,
    company_timezone: text(form, "timezone") || null,
  });
  if (error) return { error: error.message, values: { company } };
  redirect("/jobs");
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
      if (password.length < 10)
        return { fields: { password: "Use at least 10 characters." }, values };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${await origin()}/auth/confirm?next=/invite/${token}`,
        },
      });
      if (error) return { error: error.message, values };
      if (!data.session)
        return { message: `Check ${email} for a link to confirm your account, then come back.` };
      user = data.user;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: "That email and password don’t match.", values };
      user = data.user;
    }
  }

  const { data: companyId, error } = await supabase.rpc("accept_invite", { invite_token: token });
  if (error) return { error: error.message };
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, String(companyId), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/jobs");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_COMPANY_COOKIE);
  redirect("/");
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
  redirect("/jobs");
}
