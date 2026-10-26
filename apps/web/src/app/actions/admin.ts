"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";
import { sendPasswordReset } from "@/server/password-reset";
import { logStaffAction, requireStaff } from "@/server/staff";

import { friendlyDbError } from "@/lib/limits";
// The Admin portal's actions (owner, 2026-10-22). Each checks staff and two-step, writes the
// staff log, and asks for a reason where it changes a shop or a person.

export interface AdminState {
  error?: string;
  message?: string;
}

const text = (form: FormData, key: string, max = 500) =>
  String(form.get(key) ?? "")
    .trim()
    .slice(0, max);

async function shopName(
  db: Awaited<ReturnType<typeof requireStaff>>["db"],
  id: string,
): Promise<string | null> {
  const { data } = await db.from("company").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/**
 * Open Shop: a support session in the shop's own office, View Only or Can Make Changes, for
 * 30 minutes to 2 hours, with a reason (owner: staff open shops without asking, logged).
 */
export async function startSupport(_: AdminState, form: FormData): Promise<AdminState> {
  const { staff, db } = await requireStaff();
  const companyId = text(form, "company_id", 40);
  const reason = text(form, "reason");
  const minutes = Number(form.get("minutes"));
  const access = form.get("access") === "edit" ? "edit" : "view";
  if (reason.length < 3) return { error: "Say why you’re opening this shop." };
  const name = await shopName(db, companyId);
  if (!name) return { error: "That shop no longer exists." };
  const { error } = await db.rpc("admin_start_support", {
    target_company: companyId,
    staff_user: staff.id,
    staff_email: staff.email,
    why: reason,
    minutes,
    how: access,
  });
  if (error) return { error: friendlyDbError(error.message) };
  await logStaffAction(staff, "support_start", {
    companyId,
    companyName: name,
    reason,
    details: { access, minutes },
  });
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/home");
}

/** Extend Trial by 7, 14, or 30 days (owner, 2026-10-22). */
export async function extendTrial(_: AdminState, form: FormData): Promise<AdminState> {
  const { staff, db } = await requireStaff();
  const companyId = text(form, "company_id", 40);
  const days = Number(form.get("days"));
  const reason = text(form, "reason");
  if (reason.length < 3) return { error: "Say why the trial is being extended." };
  const { data, error } = await db.rpc("admin_extend_trial", {
    target_company: companyId,
    days,
  });
  if (error) return { error: friendlyDbError(error.message) };
  await logStaffAction(staff, "trial_extend", {
    companyId,
    companyName: await shopName(db, companyId),
    reason,
    details: { days, ends_at: data },
  });
  revalidatePath(`/admin/shops/${companyId}`);
  return { message: `Trial extended by ${days} days.` };
}

/** Make Demo Shop (no charge, like the VIP26 code) or End Demo (a week of trial). */
export async function setDemo(_: AdminState, form: FormData): Promise<AdminState> {
  const { staff, db } = await requireStaff();
  const companyId = text(form, "company_id", 40);
  const demo = form.get("demo") === "1";
  const reason = text(form, "reason");
  if (reason.length < 3)
    return { error: demo ? "Say why this shop is free." : "Say why the demo is ending." };
  const { error } = await db.rpc("admin_set_demo", { target_company: companyId, demo });
  if (error) return { error: friendlyDbError(error.message) };
  await logStaffAction(staff, demo ? "demo_on" : "demo_off", {
    companyId,
    companyName: await shopName(db, companyId),
    reason,
  });
  revalidatePath(`/admin/shops/${companyId}`);
  return {
    message: demo ? "This is a demo shop now." : "Demo ended. The shop has a week of trial.",
  };
}

/** A staff note on a shop (kept with who wrote it and when). */
export async function addShopNote(_: AdminState, form: FormData): Promise<AdminState> {
  const { staff, db } = await requireStaff();
  const companyId = text(form, "company_id", 40);
  const note = text(form, "note", 4000);
  if (!note) return { error: "Write a note first." };
  const { error } = await db
    .from("shop_note")
    .insert({ company_ref: companyId, staff_email: staff.email, note });
  if (error) return { error: friendlyDbError(error.message) };
  await logStaffAction(staff, "note", {
    companyId,
    companyName: await shopName(db, companyId),
  });
  revalidatePath(`/admin/shops/${companyId}`);
  return { message: "Note saved." };
}

/**
 * Turn Off Two-Step for someone who lost their authenticator, after checking it's really them
 * (it was a manual SQL step in HANDOVER). Removes their factors and the profile flag.
 */
export async function turnOffTwoStep(_: AdminState, form: FormData): Promise<AdminState> {
  const { staff, db } = await requireStaff();
  const userId = text(form, "user_id", 40);
  const reason = text(form, "reason");
  if (form.get("checked") !== "1")
    return { error: "First check it’s really them, from their account’s email or a call." };
  if (reason.length < 3) return { error: "Say how you checked it’s them." };
  const { data: user, error: findError } = await db.auth.admin.getUserById(userId);
  if (findError || !user.user) return { error: "No such person." };
  const { data: factors, error: listError } = await db.auth.admin.mfa.listFactors({ userId });
  if (listError) return { error: friendlyDbError(listError.message) };
  for (const f of factors.factors) {
    const { error } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (error) return { error: friendlyDbError(error.message) };
  }
  const { error } = await db.rpc("set_two_step", { target_user: userId, enabled: false });
  if (error) return { error: friendlyDbError(error.message) };
  await logStaffAction(staff, "two_step_off", {
    targetUser: userId,
    targetEmail: user.user.email ?? null,
    reason,
    details: { factors_removed: factors.factors.length },
  });
  revalidatePath(`/admin/people/${userId}`);
  return {
    message: "Two-step is off. They sign in with their password and can turn it on again.",
  };
}

/**
 * Send Password Reset (owner, 2026-10-22): the same email the person gets from Forgot
 * Password?, to their own address. Staff never see or set the password.
 */
export async function staffPasswordReset(_: AdminState, form: FormData): Promise<AdminState> {
  const { staff, db } = await requireStaff();
  const userId = text(form, "user_id", 40);
  const { data: user } = await db.auth.admin.getUserById(userId);
  const email = user.user?.email;
  if (!email) return { error: "No such person." };
  const outcome = await sendPasswordReset(email);
  if (outcome === "unavailable") return { error: "Email isn’t set up on this server." };
  if (outcome === "too_many")
    return { error: "This address already got 3 reset emails this hour. Try again later." };
  await logStaffAction(staff, "password_reset", { targetUser: userId, targetEmail: email });
  revalidatePath(`/admin/people/${userId}`);
  return { message: `Reset link sent to ${email}. It works for an hour.` };
}
