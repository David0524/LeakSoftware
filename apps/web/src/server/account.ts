import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORT_EMAIL } from "@/lib/site";
import { adminClient } from "./admin";
import { emailConfigured, fromAddress, sendEmail } from "./email";

export type AccountDeletion = { status: "deleted" } | { status: "requested"; message: string };

/**
 * Delete the signed-in user's account (App Store rule 5.1.1(v); M11). A tech's or a second
 * owner's account goes at once: their sign-in and memberships are removed; the jobs they
 * worked stay with the shop. The only owner of a shop can't be removed without deciding
 * what happens to the shop's records (sent reports, invoices), so that becomes a request to
 * support, done within 30 days.
 */
export async function deleteAccount(db: SupabaseClient): Promise<AccountDeletion> {
  const { data: who, error } = await db.auth.getUser();
  if (error || !who.user) throw new Error("Sign in again.");
  const user = who.user;

  const { data: owned } = await db
    .from("membership")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .is("deleted_at", null);
  const soleOwnerOf: string[] = [];
  for (const m of owned ?? []) {
    const { count } = await db
      .from("membership")
      .select("user_id", { count: "exact", head: true })
      .eq("company_id", m.company_id)
      .eq("role", "owner")
      .eq("status", "active")
      .is("deleted_at", null)
      .neq("user_id", user.id);
    if (!count) soleOwnerOf.push(m.company_id as string);
  }

  const admin = adminClient();
  if (soleOwnerOf.length === 0 && admin) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);
    return { status: "deleted" };
  }

  if (!emailConfigured())
    throw new Error(
      `Email ${SUPPORT_EMAIL} from ${user.email ?? "your account's address"} to delete your account.`,
    );
  await sendEmail({
    from: fromAddress("Tidemark"),
    to: SUPPORT_EMAIL,
    replyTo: user.email ?? null,
    subject: `Account deletion request: ${user.email ?? user.id}`,
    text: `Delete the account ${user.email ?? ""} (${user.id}).\nOnly owner of: ${soleOwnerOf.join(", ") || "none"}.\nDo this within 30 days and reply to confirm.`,
    html: `<p>Delete the account ${user.email ?? ""} (${user.id}).</p><p>Only owner of: ${soleOwnerOf.join(", ") || "none"}.</p><p>Do this within 30 days and reply to confirm.</p>`,
  });
  return {
    status: "requested",
    message:
      "You’re the only owner of your shop, so we’ll delete your account and the shop’s data within 30 days and email you when it’s done.",
  };
}
