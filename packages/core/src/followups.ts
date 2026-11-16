import { formatCents } from "./money";
import { isUsNumber, toE164 } from "./texting";

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
  /** The shop's reminder channel (settings.reminders.channel); a review request is always email. */
  channel?: ReminderChannel;
  /** Whether the review request asks "How did we do?" first (settings.ask_feedback_first). */
  feedback_first?: boolean;
  /** Channels ("email", "sms") already sent for this step. */
  sent_channels?: string[];
  customer: {
    name: string | null;
    email: string;
    phone?: string | null;
    cc_emails: string[];
  };
  company: { name: string; email: string | null; phone: string | null; review_url: string | null };
}

/** How reminders for unpaid invoices and unaccepted quotes go (Settings › Company and Branding). */
export type ReminderChannel = "email" | "text" | "both";

export const REMINDER_CHANNELS: { value: ReminderChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "both", label: "Both" },
];

export const REMINDER_CHANNEL_HINT =
  "Texts go from your company number to customers with a mobile number who haven’t replied STOP. Set up texting under Phone and Texting.";

/** The channel setting as stored; anything unknown is email, as before texts existed. */
export function reminderChannel(settings: unknown): ReminderChannel {
  const r = (settings as { reminders?: { channel?: unknown } } | null | undefined)?.reminders;
  return r?.channel === "text" || r?.channel === "both" ? r.channel : "email";
}

/** Whether the review request asks "How did we do?" first: on unless turned off. */
export function askFeedbackFirst(settings: unknown): boolean {
  return (
    (settings as { ask_feedback_first?: unknown } | null | undefined)?.ask_feedback_first !== false
  );
}

export interface FollowupPlan {
  /** Send the email (to the customer's address). */
  email: boolean;
  /** Send a text, to this number. */
  text: string | null;
}

/**
 * What goes for a due follow-up, by the shop's channel and what the customer can get. An email
 * needs an address and a configured mailer; a text needs the shop's working number, a US mobile
 * number, and no STOP reply. Channels that already went for the step are left out. The review
 * request is always email.
 */
export function planFollowup(
  f: Followup,
  can: { email: boolean; texting: boolean; textOptedOut: boolean },
): FollowupPlan {
  const channel = f.template === "review_request" ? "email" : (f.channel ?? "email");
  const sent = f.sent_channels ?? [];
  const phone = toE164(f.customer.phone);
  const wantsEmail = channel !== "text";
  const wantsText = channel !== "email";
  return {
    email: wantsEmail && can.email && !sent.includes("email") && f.customer.email.trim().length > 0,
    text:
      wantsText && can.texting && !can.textOptedOut && !sent.includes("sms") && isUsNumber(phone)
        ? phone
        : null,
  };
}

/**
 * The text for a quote or invoice reminder: short, the shop's name and the link. (Carriers
 * answer STOP, START and HELP themselves, so the words aren't added.)
 */
export function followupText(f: Followup, origin: string): string {
  const shop = f.company.name;
  if (f.template.startsWith("quote_reminder_")) {
    const quote = f.number ? `quote #${f.number}` : "quote";
    return `${shop}: a reminder about your ${quote} for ${formatCents(f.amount_cents)}. Review and accept it: ${origin}/q/${f.token}`;
  }
  const invoice = f.number ? `invoice #${f.number}` : "invoice";
  return `${shop}: a reminder that ${formatCents(f.amount_cents)} is still due on your ${invoice}. Pay online: ${origin}/i/${f.token}`;
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
  let feedback: { up: string; down: string } | null = null;
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
    if (f.feedback_first) {
      // The thumbs links only show the answer; nothing is recorded until the customer sends it
      // on the page (mail scanners open every link).
      feedback = {
        up: `${origin}/f/${f.token}?rating=up`,
        down: `${origin}/f/${f.token}?rating=down`,
      };
      lines = ["Thank you for choosing us. How did we do?"];
      link = { url: feedback.up, label: "Thumbs up" };
    } else {
      lines = [
        "Thank you for choosing us. If you were happy with the work, a short review helps other pool owners find us.",
      ];
      link = { url: f.company.review_url ?? origin, label: "Leave a review" };
    }
  }
  const text = [
    greeting,
    "",
    ...lines,
    ...(feedback
      ? [
          `Thumbs up (we did great): ${feedback.up}`,
          `Thumbs down (something went wrong): ${feedback.down}`,
        ]
      : [`${link.label}: ${link.url}`]),
    "",
    "Thank you!",
    signoff,
    "",
    `Stop reminder, review and shop emails from ${shop}: ${stop}`,
  ].join("\n");
  const html = [
    `<p>${escape(greeting)}</p>`,
    ...lines.map((l) => `<p>${escape(l)}</p>`),
    feedback
      ? `<p><a href="${escape(feedback.up)}"><b>&#128077; We did great</b></a><br><a href="${escape(feedback.down)}"><b>&#128078; Something went wrong</b></a></p>`
      : `<p><a href="${escape(link.url)}">${escape(link.label)}</a></p>`,
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
