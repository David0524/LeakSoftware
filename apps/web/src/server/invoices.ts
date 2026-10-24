import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dateFormat,
  formatCents,
  invoiceShareText,
  latestReceiptPayment,
  receiptRecipientError,
  receiptRows,
  receiptTextMessage,
  type ReceiptChannel,
  type ReceiptPayment,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { EmailNotConfigured, emailConfigured, fromAddress, sendEmail } from "./email";
import { ccList, emailRefusal } from "./usage";
import { Refusal, dbFailure } from "./failures";
import { TextingError, activeLine, sendCompanyText } from "./texting";

// Invoices (M9): sending and receipts, shared by the office (cookie session), the phone
// (bearer token), and Stripe webhooks (service role). `db` acts as whoever is calling; the
// database functions check access.

export type InvoiceChannel = "email" | "sms_device" | "link";

export interface MailDetails {
  invoice_id: string;
  job_id: string;
  number: number | null;
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  due_date: string | null;
  token: string | null;
  company: { name: string; email: string | null; phone: string | null };
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    cc_emails: string[] | null;
  } | null;
  property: string | null;
}

export interface SendInvoiceResult {
  token: string;
  link: string;
  message: string;
  status: string;
  emailed: boolean;
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw dbFailure(error);
  return data as T;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The customer's other addresses (valid, once each, at most 5), without the main one. */
function ccFor(d: MailDetails, to: string): string[] {
  return ccList(d.customer?.cc_emails, to);
}

/** Make the job's invoice draft, or return the open one. */
export async function createInvoice(db: SupabaseClient, jobId: string): Promise<string> {
  return rpc<string>(db, "create_invoice", { target_job: jobId });
}

/**
 * Sends an invoice and returns its customer link. Email goes to `to` and the customer's other
 * addresses; "sms_device" logs that the tech texted the link; "link" only sends it.
 */
export async function sendInvoice(
  db: SupabaseClient,
  invoiceId: string,
  opts: { channel: InvoiceChannel; to?: string | null; origin: string },
): Promise<SendInvoiceResult> {
  const to = opts.to?.trim() || null;
  if (opts.channel === "email") {
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) throw new Refusal("Enter the customer’s email.");
    if (!emailConfigured()) throw new EmailNotConfigured();
  }
  const sent = await rpc<{ token: string; status: string }>(db, "send_invoice", {
    target_invoice: invoiceId,
  });
  const link = `${opts.origin}/i/${sent.token}`;
  const d = await rpc<MailDetails>(db, "invoice_mail_details", { target_invoice: invoiceId });
  const shop = d.company.name;
  const message = invoiceShareText(shop, link);
  const result = { token: sent.token, link, message, status: sent.status, emailed: false };

  if (opts.channel === "sms_device") {
    await db.rpc("log_message", {
      target_job: d.job_id,
      via: "sms_device",
      sent_to: to ?? d.customer?.phone ?? "phone",
      template_key: "invoice",
      delivery: "sent",
    });
    return result;
  }
  if (opts.channel === "link") return result;

  const cc = ccFor(d, to!);
  const { data: inv } = await db.from("invoice").select("company_id").eq("id", invoiceId).single();
  const refusal = await emailRefusal(db, inv?.company_id as string, 1 + cc.length);
  if (refusal) throw new Refusal(refusal);
  const sentTo = [to!, ...cc].join(", ");
  const greeting = d.customer?.name ? `Hi ${d.customer.name},` : "Hello,";
  const what = `Invoice${d.number ? ` #${d.number}` : ""} for ${formatCents(d.total_cents)}`;
  const due =
    d.balance_cents > 0 ? `Amount due: ${formatCents(d.balance_cents)}.` : "Nothing is due.";
  try {
    const email = await sendEmail({
      companyId: inv?.company_id as string,
      from: fromAddress(shop),
      to: to!,
      cc,
      replyTo: d.company.email,
      subject: `Your invoice from ${shop}`,
      text: `${greeting}\n\n${what}${d.property ? ` (${d.property})` : ""}. ${due}\nView and pay it here:\n${link}\n\n${shop}${d.company.phone ? `\n${d.company.phone}` : ""}`,
      html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(what)}${d.property ? ` (${escapeHtml(d.property)})` : ""}. ${escapeHtml(due)}</p><p><a href="${link}">View and pay your invoice</a></p><p>${escapeHtml(shop)}${d.company.phone ? `<br>${escapeHtml(d.company.phone)}` : ""}</p>`,
    });
    await db.rpc("log_message", {
      target_job: d.job_id,
      via: "email",
      sent_to: sentTo,
      template_key: "invoice",
      delivery: "sent",
      provider: email.id,
    });
  } catch (e) {
    await db.rpc("log_message", {
      target_job: d.job_id,
      via: "email",
      sent_to: sentTo,
      template_key: "invoice",
      delivery: "failed",
      failure: e instanceof Error ? e.message : String(e),
    });
    throw new Error(
      `The invoice is sent and its link works, but the email failed: ${e instanceof Error ? e.message : e}. Text the link instead.`,
    );
  }
  return { ...result, emailed: true };
}

/**
 * Emails the receipt once an invoice is paid in full. Best effort: a payment is never undone
 * because an email failed, and nothing is sent when email isn't set up or there's no address.
 */
export async function sendReceipt(
  invoiceId: string,
  origin: string,
  db: SupabaseClient | null = adminClient(),
): Promise<boolean> {
  // Callers pass the signed-in member's client (office) or nothing (webhook: service role).
  if (!db || !emailConfigured()) return false;
  try {
    const d = await rpc<MailDetails>(db, "invoice_mail_details", { target_invoice: invoiceId });
    const to = d.customer?.email?.trim();
    if (!to || d.status !== "paid" || !d.token) return false;
    const cc = ccFor(d, to);
    const shop = d.company.name;
    const link = `${origin}/i/${d.token}`;
    // The shop, so the App Review shop's receipts are held (review-shop.ts).
    const { data: job } = await db.from("job").select("company_id").eq("id", d.job_id).single();
    if (!job) return false;
    const greeting = d.customer?.name ? `Hi ${d.customer.name},` : "Hello,";
    const what = `We received your payment. Invoice${d.number ? ` #${d.number}` : ""} for ${formatCents(d.total_cents)} is paid in full.`;
    const email = await sendEmail({
      companyId: job.company_id as string,
      from: fromAddress(shop),
      to,
      cc,
      replyTo: d.company.email,
      subject: `Receipt from ${shop}`,
      text: `${greeting}\n\n${what}\nYour receipt:\n${link}\n\nThank you!\n${shop}`,
      html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(what)}</p><p><a href="${link}">View your receipt</a></p><p>Thank you!<br>${escapeHtml(shop)}</p>`,
    });
    const recipient = [to, ...cc].join(", ");
    const { error } = await db.rpc("log_message", {
      target_job: d.job_id,
      via: "email",
      sent_to: recipient,
      template_key: "receipt",
      delivery: "sent",
      provider: email.id,
    });
    if (error) {
      // The webhook runs as the server, not a member: write the log row directly.
      await db.from("message").insert({
        company_id: job.company_id,
        job_id: d.job_id,
        channel: "email",
        recipient,
        template: "receipt",
        status: "sent",
        provider_id: email.id,
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check")
// ---------------------------------------------------------------------------

export interface SendPaymentReceiptResult {
  channel: ReceiptChannel;
  to: string;
  link: string;
  paymentId: string;
}

/**
 * Sends the receipt for one payment (the latest received when none is named), as the signed-in
 * member, by email or by text from the shop's company number. The receipt is the invoice's own
 * page: its payments and what's left. Logged on the job and in Activity (log_receipt).
 */
export async function sendPaymentReceipt(
  db: SupabaseClient,
  userId: string,
  invoiceId: string,
  opts: { channel: ReceiptChannel; to: string; paymentId?: string | null; origin: string },
): Promise<SendPaymentReceiptResult> {
  const channel: ReceiptChannel = opts.channel === "text" ? "text" : "email";
  const to = (opts.to ?? "").trim();
  const problem = receiptRecipientError(channel, to);
  if (problem) throw new Refusal(problem);
  if (channel === "email" && !emailConfigured()) throw new EmailNotConfigured();

  const d = await rpc<MailDetails>(db, "invoice_mail_details", { target_invoice: invoiceId });
  if (!d.token || d.status === "draft" || d.status === "void")
    throw new Refusal("Send the invoice before sending a receipt.");
  const { data: rows, error } = await db
    .from("payment")
    .select("id, amount_cents, method, check_number, status, paid_at, company_id")
    .eq("invoice_id", invoiceId)
    .is("deleted_at", null);
  if (error) throw dbFailure(error);
  const payments = (rows ?? []) as (ReceiptPayment & { company_id: string })[];
  const payment = opts.paymentId
    ? payments.find((p) => p.id === opts.paymentId && p.status === "succeeded")
    : latestReceiptPayment(payments);
  if (!payment) throw new Refusal("Record a payment before sending a receipt.");
  const companyId = payment.company_id;
  const { data: co } = await db.from("company").select("timezone").eq("id", companyId).single();
  const timeZone = (co?.timezone as string | undefined) ?? "America/Phoenix";

  const shop = d.company.name;
  const link = `${opts.origin}/i/${d.token}`;
  const log = (via: "email" | "sms", sentTo: string, delivery: "sent" | "failed", extra = {}) =>
    db.rpc("log_receipt", {
      target_payment: payment.id,
      via,
      sent_to: sentTo,
      delivery,
      ...extra,
    });

  if (channel === "text") {
    const line = await activeLine(db, companyId);
    if (line?.status !== "active")
      throw new Refusal("Texting isn’t set up. Send the receipt by email instead.");
    const body = receiptTextMessage(shop, payment, d, link);
    try {
      await sendCompanyText(
        db,
        userId,
        { companyId, phone: to, body, jobId: d.job_id },
        opts.origin,
      );
    } catch (e) {
      const failure = e instanceof Error ? e.message : String(e);
      await log("sms", to, "failed", { failure });
      if (e instanceof TextingError) throw new Refusal(e.message);
      throw e;
    }
    await log("sms", to, "sent");
    return { channel, to, link, paymentId: payment.id };
  }

  const cc = ccFor(d, to);
  const refusal = await emailRefusal(db, companyId, 1 + cc.length);
  if (refusal) throw new Refusal(refusal);
  const paidOn = payment.paid_at
    ? dateFormat("en-US", { dateStyle: "long", timeZone }).format(new Date(payment.paid_at))
    : null;
  const lines = receiptRows(d, payment, paidOn);
  const greeting = d.customer?.name ? `Hi ${d.customer.name},` : "Hello,";
  const sentTo = [to, ...cc].join(", ");
  try {
    const email = await sendEmail({
      companyId,
      from: fromAddress(shop),
      to,
      cc,
      replyTo: d.company.email,
      subject: `Receipt from ${shop}`,
      text: `${greeting}\n\nThank you for your payment.\n\n${lines.map((l) => `${l.label}: ${l.value}`).join("\n")}\n\nYour receipt:\n${link}\n\n${shop}${d.company.phone ? `\n${d.company.phone}` : ""}`,
      html: `<p>${escapeHtml(greeting)}</p><p>Thank you for your payment.</p><table cellpadding="4" style="border-collapse:collapse">${lines
        .map(
          (l) =>
            `<tr><td style="color:#555">${escapeHtml(l.label)}</td><td style="text-align:right;font-weight:600">${escapeHtml(l.value)}</td></tr>`,
        )
        .join(
          "",
        )}</table><p><a href="${link}">View your receipt</a></p><p>${escapeHtml(shop)}${d.company.phone ? `<br>${escapeHtml(d.company.phone)}` : ""}</p>`,
    });
    await log("email", sentTo, "sent", { provider: email.id });
  } catch (e) {
    const failure = e instanceof Error ? e.message : String(e);
    await log("email", sentTo, "failed", { failure });
    throw new Error(`The receipt email failed: ${failure}. Try again, or text it instead.`);
  }
  return { channel, to, link, paymentId: payment.id };
}
