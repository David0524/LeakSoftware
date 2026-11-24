import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inviteEmail } from "@/lib/invite-email";
import { siteOrigin } from "@/lib/origin";
import { emailConfigured, fromAddress, sendEmail } from "./email";
import { emailRefusal } from "./usage";

// Invites (owner, 2026-11-24): making one also emails the link to the person invited. The
// website's Team page and the Android app both come here; the link stays under Open invites
// to copy, in case the email doesn't arrive.

export const INVITE_EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export type InviteResult =
  | { ok: true; emailed: true; message: string }
  | { ok: true; emailed: false; message: string }
  | { ok: false; error: string };

export const invitedMessage = (email: string, emailed: boolean, why?: string) =>
  emailed
    ? `Invite emailed to ${email}. The link is also under Open invites.`
    : `Invite created for ${email}, but the email didn’t go.${why ? ` ${why}` : ""} Send the link from Open invites yourself.`;

/**
 * Makes the invite as the signed-in owner or admin (create_invite checks who may invite whom),
 * then emails the link. A failed email never undoes the invite.
 */
export async function createAndSendInvite(
  db: SupabaseClient,
  input: { companyId: string; userId: string; email: string; role: string },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const { data: token, error } = await db.rpc("create_invite", {
    target_company: input.companyId,
    invite_email: email,
    invite_role: input.role,
  });
  if (error || typeof token !== "string") return { ok: false, error: error?.message ?? "" };
  const sent = await sendInvite(db, { ...input, email, token });
  return { ok: true, emailed: sent.ok, message: invitedMessage(email, sent.ok, sent.why) };
}

async function sendInvite(
  db: SupabaseClient,
  input: { companyId: string; userId: string; email: string; role: string; token: string },
): Promise<{ ok: boolean; why?: string }> {
  if (!emailConfigured()) return { ok: false, why: "Email isn’t set up yet." };
  try {
    const refused = await emailRefusal(db, input.companyId, 1);
    if (refused) return { ok: false, why: refused };
    const [{ data: company }, { data: profile }, origin] = await Promise.all([
      db.from("company").select("name").eq("id", input.companyId).maybeSingle(),
      db.from("profile").select("full_name, email").eq("id", input.userId).maybeSingle(),
      siteOrigin(),
    ]);
    const shopName = (company as { name: string } | null)?.name ?? "";
    const inviter = profile as { full_name: string | null; email: string | null } | null;
    const message = inviteEmail({
      shopName,
      inviterName: inviter?.full_name ?? null,
      role: input.role,
      link: `${origin}/invite/${input.token}`,
    });
    await sendEmail({
      companyId: input.companyId,
      from: fromAddress(shopName),
      to: input.email,
      replyTo: inviter?.email ?? null,
      ...message,
    });
    return { ok: true };
  } catch (e) {
    console.error("[invites] couldn't email the invite:", e);
    return { ok: false };
  }
}
