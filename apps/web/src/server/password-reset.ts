import "server-only";
import { siteOrigin } from "@/lib/origin";
import { passwordChangedEmail, passwordResetEmail, resetLink } from "@/lib/password-reset-email";
import { SUPPORT_EMAIL } from "@/lib/site";
import { adminClient } from "./admin";
import { emailConfigured, sendEmail } from "./email";

// Password reset (owner, 2026-10-22). The server makes the recovery token and emails the link
// itself (Resend), rather than Supabase's own email: Supabase's link only works in the browser
// that asked, and the apps ask from the phone. The link opens /auth/confirm, which checks the
// token and signs the person in for /reset-password.

function from(): string {
  const domain = process.env.EMAIL_FROM_DOMAIN || "send.sundeckpro.com";
  return `"Sundeck Pro" <account@${domain}>`;
}

export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export type ResetOutcome = "sent" | "no_account" | "too_many" | "unavailable";

/**
 * Emails `email` a link to choose a new password, if it has an account. Callers answer the same
 * whatever the outcome, so nobody learns which addresses have accounts.
 */
export async function sendPasswordReset(rawEmail: string): Promise<ResetOutcome> {
  const email = rawEmail.trim().toLowerCase();
  const admin = adminClient();
  if (!admin || !emailConfigured() || !EMAIL_PATTERN.test(email) || email.length > 200)
    return "unavailable";
  const { data: allowed } = await admin.rpc("take_password_reset", { target_email: email });
  if (allowed !== true) return "too_many";
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return "no_account";
  const message = passwordResetEmail(resetLink(await siteOrigin(), hashed));
  await sendEmail({ from: from(), to: email, replyTo: SUPPORT_EMAIL, ...message });
  return "sent";
}

/** After a reset: tells the person, in case it wasn't them. Never fails the reset itself. */
export async function sendPasswordChanged(email: string): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const message = passwordChangedEmail({
      signInUrl: `${await siteOrigin()}/sign-in`,
      supportEmail: SUPPORT_EMAIL,
    });
    await sendEmail({ from: from(), to: email, replyTo: SUPPORT_EMAIL, ...message });
  } catch (error) {
    console.error("[password-reset] couldn't send the password-changed email:", error);
  }
}
