import { formatCents } from "./money";

// Follow-up emails (M10): reminders for quotes not yet accepted and invoices not yet paid,
// and a review request after payment. The database decides what is due
// (public.due_followups); this writes the words.

export interface Followup {
  company_id: string;
  job_id: string;
  quote_id: string | null;
  invoice_id: string | null;
  /** quote_reminder_{days}, invoice_reminder_{days}, or review_request */
  template: string;
  number: number | null;
  amount_cents: number;
  token: string;
  customer: { name: string | null; email: string; cc_emails: string[] };
  company: { name: string; email: string | null; phone: string | null; review_url: string | null };
}

export interface FollowupEmail {
  subject: string;
  text: string;
  html: string;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The email for a follow-up, with the customer's link and a way to stop these emails. */
export function followupEmail(f: Followup, origin: string): FollowupEmail {
  const shop = f.company.name;
  const greeting = f.customer.name ? `Hi ${f.customer.name},` : "Hello,";
  const stop = `${origin}/stop/${f.token}`;
  const signoff = [shop, f.company.phone].filter(Boolean).join(" · ");
  let subject: string;
  let lines: string[];
  let link: { url: string; label: string };
  if (f.template.startsWith("quote_reminder_")) {
    const quote = f.number ? `quote #${f.number}` : "quote";
    subject = `Your repair quote from ${shop}`;
    lines = [
      `A reminder about your ${quote} for ${formatCents(f.amount_cents)}.`,
      "You can review it and accept it online. Reply to this email with any questions.",
    ];
    link = { url: `${origin}/q/${f.token}`, label: "Review your quote" };
  } else if (f.template.startsWith("invoice_reminder_")) {
    const invoice = f.number ? `invoice #${f.number}` : "invoice";
    subject = `Reminder: ${invoice} from ${shop}`;
    lines = [
      `A friendly reminder that ${formatCents(f.amount_cents)} is still due on your ${invoice}.`,
      "You can pay it online by card or bank account. If you’ve already paid, thank you, and please ignore this email.",
    ];
    link = { url: `${origin}/i/${f.token}`, label: "View and pay your invoice" };
  } else {
    subject = `How did we do? ${shop}`;
    lines = [
      "Thank you for choosing us. If you were happy with the work, a short review helps other pool owners find us.",
    ];
    link = { url: f.company.review_url ?? origin, label: "Leave a review" };
  }
  const text = [
    greeting,
    "",
    ...lines,
    `${link.label}: ${link.url}`,
    "",
    "Thank you!",
    signoff,
    "",
    `Stop reminder, review and shop emails from ${shop}: ${stop}`,
  ].join("\n");
  const html = [
    `<p>${escape(greeting)}</p>`,
    ...lines.map((l) => `<p>${escape(l)}</p>`),
    `<p><a href="${escape(link.url)}">${escape(link.label)}</a></p>`,
    `<p>Thank you!<br>${escape(signoff)}</p>`,
    `<p style="font-size:13px;color:#5B6B7A"><a href="${escape(stop)}">Stop reminder, review and shop emails from ${escape(shop)}</a></p>`,
  ].join("");
  return { subject, text, html };
}

/**
 * Reminder days typed in settings ("3, 7") as a sorted list without repeats, or null when
 * the text isn't whole days between 1 and 365. Empty means no reminders.
 */
export function parseReminderDays(input: string): number[] | null {
  const parts = input
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const days = parts.map(Number);
  if (days.some((d) => d < 1 || d > 365)) return null;
  return [...new Set(days)].sort((a, b) => a - b);
}
