import { roleLabel } from "@leakbook/core";
import { accountPage, type AccountEmail } from "./password-reset-email";

// The invite email (owner, 2026-11-24: "When adding a tech with an invite link, we should have
// it automatically send them an email"). Plain like the account emails: one card, one button.

export interface InviteEmailInput {
  shopName: string;
  /** Who invited them, or null when their profile has no name. */
  inviterName: string | null;
  role: string;
  link: string;
}

export function inviteEmail(input: InviteEmailInput): AccountEmail {
  const shop = input.shopName.trim() || "a shop";
  const who = input.inviterName?.trim() || shop;
  const role = roleLabel(input.role).toLowerCase();
  const article = /^[aeiou]/.test(role) ? "an" : "a";
  const subject = `Join ${shop} on Sundeck Pro`;
  const intro = `${who} invited you to join ${shop} on Sundeck Pro as ${article} ${role}.`;
  const action =
    "Tap the button to make your account, or sign in if you have one. Use this email address.";
  const footer =
    "The link works once and expires in 14 days. If you weren’t expecting it, ignore this email.";
  return {
    subject,
    text: [subject, "", intro, action, "", `Accept Invite: ${input.link}`, "", footer].join("\n"),
    html: accountPage({
      subject,
      preview: `${who} invited you to ${shop}.`,
      title: `Join ${shop}`,
      paragraphs: [intro, action],
      button: { label: "Accept Invite", href: input.link },
      footer,
    }),
  };
}
