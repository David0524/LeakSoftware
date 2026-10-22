import { tokens } from "@leakbook/tokens";

// Password reset emails (owner, 2026-10-22): the link to choose a new password, and the notice
// once it's changed. Plain like the weekly summary: light, one card, one button.

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const c = tokens.color;
const ink = c.role.light.text;
const muted = c.role.light.textMuted;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface AccountEmail {
  subject: string;
  text: string;
  html: string;
}

function page(input: {
  subject: string;
  preview: string;
  title: string;
  paragraphs: string[];
  button?: { label: string; href: string };
  footer: string;
}): string {
  const body = input.paragraphs
    .map(
      (p) =>
        `<tr><td style="padding:10px 22px 0;font-size:17px;line-height:24px;color:${ink}">${escape(p)}</td></tr>`,
    )
    .join("");
  const button = input.button
    ? `<tr><td style="padding:22px 22px 6px"><a href="${escape(input.button.href)}" style="display:block;background:${c.brand.water};color:${c.brand.paper};text-decoration:none;text-align:center;font-size:17px;line-height:22px;font-weight:600;padding:13px 20px;border-radius:999px">${escape(input.button.label)}</a></td></tr>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escape(input.subject)}</title></head>
<body style="margin:0;padding:0;background:${c.role.light.bg};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden">${escape(input.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.role.light.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.role.light.surface};border-radius:18px">
<tr><td style="padding:22px 22px 0"><div style="font-size:22px;line-height:28px;font-weight:700;color:${c.brand.navy}">Sundeck Pro</div>
<div style="font-size:28px;line-height:34px;font-weight:700;color:${ink};padding-top:14px">${escape(input.title)}</div></td></tr>
${body}
${button}
<tr><td style="padding:16px 22px 24px;font-size:15px;line-height:20px;color:${muted}">${escape(input.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** The reset link: good for an hour and once (Supabase's recovery token). */
export function passwordResetEmail(link: string): AccountEmail {
  const subject = "Reset your Sundeck Pro password";
  const intro = "Someone asked to reset the password for this Sundeck Pro account.";
  const action = "Choose a new password with the button below. The link works for an hour, once.";
  const ignore =
    "If it wasn’t you, ignore this email: your password stays the same, and no one can use this link without your email.";
  return {
    subject,
    text: [subject, "", intro, action, "", `Choose a New Password: ${link}`, "", ignore].join("\n"),
    html: page({
      subject,
      preview: "Choose a new password. The link works for an hour.",
      title: "Reset your password",
      paragraphs: [intro, action],
      button: { label: "Choose a New Password", href: link },
      footer: ignore,
    }),
  };
}

/** After the password changed, so someone who didn't change it finds out. */
export function passwordChangedEmail(input: {
  signInUrl: string;
  supportEmail: string;
}): AccountEmail {
  const subject = "Your Sundeck Pro password was changed";
  const what =
    "The password for this Sundeck Pro account was just changed, and every other device was signed out. Sign in again there with the new password.";
  const notYou = `If you didn’t change it, reset it again right away and email ${input.supportEmail}.`;
  return {
    subject,
    text: [subject, "", what, "", notYou, "", `Sign in: ${input.signInUrl}`].join("\n"),
    html: page({
      subject,
      preview: "Every other device was signed out.",
      title: "Password changed",
      paragraphs: [what, notYou],
      button: { label: "Sign In", href: input.signInUrl },
      footer: "Sent by Sundeck Pro because your account’s password changed.",
    }),
  };
}

/** The link in the reset email: /auth/confirm checks the token, then the new-password page. */
export function resetLink(origin: string, hashedToken: string): string {
  const q = new URLSearchParams({
    token_hash: hashedToken,
    type: "recovery",
    next: "/reset-password",
  });
  return `${origin}/auth/confirm?${q}`;
}

/** The new password's problem, or null: at least 10 characters (the project's minimum), and typed twice the same. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 72) return "Use 72 characters or fewer.";
  if (password !== confirm) return "The two passwords don’t match.";
  return null;
}

/** What every reset request answers, whether or not the address has an account. */
export function resetRequestedMessage(email: string): string {
  return `If ${email} has a Sundeck Pro account, a reset link is on its way. It works for an hour.`;
}

/** On /reset-password and /forgot-password when the link didn't work. */
export const RESET_LINK_EXPIRED =
  "That reset link has expired or was already used. Ask for a new one below.";

/** Set by /auth/confirm for 15 minutes after a reset link; /reset-password needs it. */
export const RESET_COOKIE = "lb_reset";
