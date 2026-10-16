"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safePath } from "@leakbook/core";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import type { FormState } from "./auth";

// Two-step sign-in (owner, 2026-10-16): an authenticator-app code (Supabase TOTP) after the
// password. The database refuses shop data to a session that hasn't passed the code once the
// person has it on (20261012004000_two_step.sql).

const code = (form: FormData) => String(form.get("code") ?? "").replace(/\s+/g, "");

/** After the password: check the code, then on to where the person was going. */
export async function verifyTwoStep(_: FormState, form: FormData): Promise<FormState> {
  if (!/^\d{6}$/.test(code(form))) return { fields: { code: "Enter the 6-digit code." } };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/sign-in");
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code(form),
  });
  if (error) return { fields: { code: "That code didn’t work. Try the newest one." } };
  redirect(safePath(String(form.get("next") ?? "")));
}

export interface SetupState extends FormState {
  factorId?: string;
  qr?: string;
  secret?: string;
}

/** More › Two-Step Sign-In: a new authenticator-app setup to scan. */
export async function startTwoStep(): Promise<SetupState> {
  if (!(await getUser())) redirect("/sign-in");
  const supabase = await createClient();
  // A setup started before and never finished is replaced.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? [])
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Tidemark ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: "Couldn’t start setup. Try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** The first code from the app turns two-step on. */
export async function confirmTwoStep(prev: SetupState, form: FormData): Promise<SetupState> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const factorId = String(form.get("factorId") ?? "");
  if (!/^\d{6}$/.test(code(form)))
    return { ...prev, fields: { code: "Enter the 6-digit code from the app." } };
  const admin = adminClient();
  if (!admin) return { ...prev, error: "Two-step sign-in isn’t available on this server yet." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code(form) });
  if (error) return { ...prev, fields: { code: "That code didn’t work. Try the newest one." } };
  const { error: saved } = await admin.rpc("set_two_step", { target_user: user.id, enabled: true });
  if (saved) return { ...prev, error: "Couldn’t turn it on. Try again." };
  revalidatePath("/more", "layout");
  return { message: "Two-step sign-in is on." };
}

/** Turns two-step off (the session has passed the code, or it couldn't get here). */
export async function turnOffTwoStep(): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const admin = adminClient();
  if (!admin) return { error: "Two-step sign-in isn’t available on this server yet." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { error: "Couldn’t turn it off. Sign in again and retry." };
  }
  await admin.rpc("set_two_step", { target_user: user.id, enabled: false });
  revalidatePath("/more", "layout");
  return { message: "Two-step sign-in is off." };
}
