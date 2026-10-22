// Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"). One email to
// the customers a filter picks, sent by the website's server for every platform. The wording
// here is the same on the websites and both apps; the iPhone app's port is
// apps/ios/Sources/SundeckCore/MassEmail.swift (fixtures: apps/ios/fixtures/cases/mass-email.ts).
// Design: docs/design/2026-10-22-mass-email.md.

/** The page's title, the Customers button, and the label screen readers read. */
export const MASS_EMAIL_TITLE = "Email Customers";

export const MASS_EMAIL_LIMITS = { subject: 150, body: 10_000 } as const;

/** Last Job: whether they had a job in the last N days (null: any time). */
export const LAST_JOB_CHOICES: readonly { days: number | null; label: string }[] = [
  { days: null, label: "Any Time" },
  { days: 30, label: "Last 30 Days" },
  { days: 90, label: "Last 90 Days" },
  { days: 365, label: "Last Year" },
];

/** City's first choice. */
export const ANY_CITY = "Any City";

/** Who gets it: the Customers Show choice, a city, and how recent their last job was. */
export interface MassEmailAudience {
  /** 'all', 'plan', 'no_plan', or a customer kind. */
  show: string;
  /** A city of the shop's pools; null for any. */
  city: string | null;
  /** Had a job in the last N days; null for any time. */
  days: number | null;
}

/** An audience from untrusted input (a form, an app's request), with safe defaults. */
export function massEmailAudience(input: unknown): MassEmailAudience {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const show = typeof o.show === "string" && /^[a-z_]{1,40}$/.test(o.show) ? o.show : "all";
  const city =
    typeof o.city === "string" && o.city.trim()
      ? o.city.trim().replace(/\s+/g, " ").slice(0, 100)
      : null;
  const days = Number(o.days);
  return {
    show,
    city,
    days: LAST_JOB_CHOICES.some((c) => c.days === days) && days > 0 ? days : null,
  };
}

/** The server's count: who gets it, and who is left out. */
export interface MassEmailCount {
  recipients: number;
  no_email: number;
  unsubscribed: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Under the To group: "42 customers with an email." and, when anyone is left out,
 * "5 left out: 3 without an email, 2 unsubscribed."
 */
export function massEmailCountText(c: MassEmailCount): { count: string; skipped: string | null } {
  const count = `${plural(c.recipients, "customer", "customers")} with an email.`;
  const parts = [
    c.no_email > 0 ? `${c.no_email} without an email` : null,
    c.unsubscribed > 0 ? `${c.unsubscribed} unsubscribed` : null,
  ].filter((p): p is string => !!p);
  return {
    count,
    skipped: parts.length ? `${c.no_email + c.unsubscribed} left out: ${parts.join(", ")}.` : null,
  };
}

/** The send button: "Send to 42 Customers", "Send to 1 Customer", or "Send" for nobody. */
export function massEmailSendLabel(recipients: number): string {
  if (recipients <= 0) return "Send";
  return `Send to ${recipients} ${recipients === 1 ? "Customer" : "Customers"}`;
}

/** The alert before sending. */
export function massEmailConfirm(
  recipients: number,
  subject: string,
  shop: string,
): { title: string; message: string; confirmLabel: string } {
  return {
    title: `Send to ${plural(recipients, "customer", "customers")}?`,
    // "Demo Leak Co." already ends the sentence.
    message: `“${subject.trim()}” goes out now from ${shop.trim().replace(/\.$/, "")}. It can’t be unsent.`,
    confirmLabel: "Send",
  };
}

/** After sending: "Sent to 42 customers." or "Sent to 40 customers. 2 didn’t go." */
export function massEmailSentText(sent: number, failed: number): string {
  if (sent === 0) return "It didn’t go. Check the addresses and try again.";
  return `Sent to ${plural(sent, "customer", "customers")}.${failed > 0 ? ` ${failed} didn’t go.` : ""}`;
}

/** A history row's second line after the date: "Sent to 40 · 2 didn’t go", "Sending…". */
export function massEmailHistoryText(c: {
  status: string;
  sent_count: number;
  failed_count: number;
  recipient_count: number;
}): string {
  if (c.status === "sending") return `Sending to ${c.recipient_count}…`;
  if (c.status === "failed" || c.sent_count === 0) return "Didn’t go";
  return `Sent to ${c.sent_count}${c.failed_count > 0 ? ` · ${c.failed_count} didn’t go` : ""}`;
}

/**
 * When the list is bigger than what's left of today's mass email allowance. Mass email has its
 * own daily allowance (owner, 2026-10-22: "Give mass email its own limit"), apart from reports,
 * quotes, invoices and receipts, so the words say "email customers", not "send emails".
 */
export function massEmailLimitText(left: number): string {
  return left <= 0
    ? "Your shop has reached today’s limit for emailing customers. It resets tomorrow."
    : `Your shop can email ${plural(left, "more customer", "more customers")} today. Narrow the list or send the rest tomorrow.`;
}

/** Field errors before sending (empty when it can go). */
export function massEmailErrors(
  subject: string,
  body: string,
): { subject?: string; body?: string } {
  const errors: { subject?: string; body?: string } = {};
  if (!subject.trim()) errors.subject = "Add a subject.";
  else if (subject.trim().length > MASS_EMAIL_LIMITS.subject)
    errors.subject = `Keep the subject under ${MASS_EMAIL_LIMITS.subject} characters.`;
  if (!body.trim()) errors.body = "Write a message.";
  else if (body.trim().length > MASS_EMAIL_LIMITS.body)
    errors.body = "This message is too long. Keep it under 10,000 characters.";
  return errors;
}

/** Under the Message group. */
export const MASS_EMAIL_MESSAGE_NOTE =
  "Write {first name} to use each customer’s first name. Every email ends with your shop’s name, mailing address and an unsubscribe link.";

/** When the shop has no mailing address (CAN-SPAM asks for one in every such email). */
export const MASS_EMAIL_NO_ADDRESS =
  "Add your shop’s mailing address in Settings › Company first. The law asks for it in every email like this.";

/** The apps, offline. */
export const MASS_EMAIL_OFFLINE = "Sending needs a connection. Try again when you have signal.";

/** The server refused a list that moved between the count and the send. */
export const MASS_EMAIL_LIST_CHANGED = "The list changed. Check the count and send again.";

export const MASS_EMAIL_NOBODY = "No customers with an email match. Change who it goes to.";

export const MASS_EMAIL_HISTORY_EMPTY = "No emails sent yet.";

/** "Test sent to dana@example.com." */
export const massEmailTestSent = (email: string) => `Test sent to ${email}.`;

/** Customer kinds that are businesses: greeted "there" rather than by a first word. */
const BUSINESS_KINDS = new Set(["pool_company", "builder", "insurer", "property_manager"]);

/**
 * What {first name} becomes: the first word of a person's name ("Rosa Diaz" → "Rosa"), or
 * "there" for a business, or when there's no name ("Hi {first name}" → "Hi there").
 */
export function massEmailFirstName(name: string | null | undefined, kind?: string | null): string {
  if (kind && BUSINESS_KINDS.has(kind)) return "there";
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.replace(/[,;:]+$/, "") || "there";
}

/** The message with {first name} filled in (any case, spaces inside the braces allowed). */
export function fillFirstName(text: string, firstName: string): string {
  return text.replace(/\{\s*first\s+name\s*\}/gi, firstName);
}

/** The shop's mailing address on one line, or null when a part is missing. */
export function shopMailingAddress(company: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}): string | null {
  const t = (s: string | null | undefined) => (s ?? "").trim();
  if (!t(company.address_line1) || !t(company.city) || !t(company.state) || !t(company.postal_code))
    return null;
  const street = [t(company.address_line1), t(company.address_line2)].filter(Boolean).join(", ");
  return `${street}, ${t(company.city)}, ${t(company.state)} ${t(company.postal_code)}`;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One mass email, as it goes to one customer (or to the sender as a test). */
export function massEmailContent(input: {
  subject: string;
  body: string;
  firstName: string;
  shop: { name: string; address: string };
  unsubscribeUrl: string;
  test?: boolean;
}): { subject: string; text: string; html: string } {
  const body = fillFirstName(input.body.trim().replace(/\r\n?/g, "\n"), input.firstName);
  const subject = `${input.test ? "Test: " : ""}${fillFirstName(input.subject.trim(), input.firstName)}`;
  const shop = input.shop.name.trim() || "Your pool company";
  const why = `You’re getting this because you’re a customer of ${shop}.`;
  const text = [
    body,
    "",
    "--",
    `${shop} · ${input.shop.address}`,
    why,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = [
    `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#0B1F33">`,
    paragraphs,
    `<hr style="border:none;border-top:1px solid #D9E1E8;margin:24px 0 12px">`,
    `<p style="font-size:13px;color:#5B6B7A">${escape(shop)} · ${escape(input.shop.address)}<br>`,
    `${escape(why)} <a href="${escape(input.unsubscribeUrl)}" style="color:#5B6B7A">Unsubscribe</a></p>`,
    `</div>`,
  ].join("");
  return { subject, text, html };
}

/**
 * The customer's one email setting (owner, 2026-10-22): one unsubscribe covers mass, reminder
 * and review emails (customer.marketing_opt_out). Its row on the customer page (On or Off) and
 * its switch in Contact Details. Reports, quotes, invoices and receipts always go.
 */
export const CUSTOMER_EMAILS_LABEL = "Reminder, review and shop emails";
export const CUSTOMER_EMAILS_OFF_LABEL = "No reminder, review or shop emails";

/** The unsubscribe page's words. */
export const UNSUBSCRIBE_TEXT = {
  title: (shop: string) => `Stop emails from ${shop}?`,
  body: (shop: string) =>
    `You’ll stop getting news and offers, reminders and review requests from ${shop}. You’ll still get reports, quotes, invoices and receipts.`,
  button: "Unsubscribe",
  done: (shop: string) => `You’re unsubscribed. ${shop} won’t send you emails like this again.`,
  test: "This is a test email, so there’s nothing to unsubscribe from. In the real email this link works.",
  broken: "This link no longer works. Reply to the email instead.",
} as const;
