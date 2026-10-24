import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { heldId, reviewRecipients, reviewShops } from "./review-shop";

// Email delivery (BUILD_PLAN 6.5). Resend in production; tests write messages to a folder
// (EMAIL_OUTBOX_DIR) so the end-to-end suite can open the link a customer would get.

export interface Email {
  /**
   * The shop it's sent for, or null for Sundeck Pro's own mail (account emails, support). The
   * App Review shop's email is recorded as sent but not delivered (review-shop.ts).
   */
  companyId: string | null;
  from: string;
  to: string;
  /** The customer's other addresses (M8.5); they see each other, like a family email. */
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
  /** Extra headers, such as List-Unsubscribe on a mass email. */
  headers?: Record<string, string>;
}

export interface Sent {
  id: string;
}

export class EmailNotConfigured extends Error {
  constructor() {
    super("Email isn’t set up yet (RESEND_API_KEY). Send the link by text instead.");
  }
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_OUTBOX_DIR);
}

export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<Sent> {
  // The App Review shop: only sundeckpro.com recipients get it; otherwise it's recorded as
  // sent and goes nowhere.
  if ((await reviewShops([email.companyId])).size) {
    const kept = reviewRecipients(email);
    if (!kept) return { id: heldId() };
    email = kept;
  }
  return deliver(email, fetchImpl);
}

/** The test outbox, or Resend. */
async function deliver(email: Email, fetchImpl: typeof fetch): Promise<Sent> {
  const outbox = process.env.EMAIL_OUTBOX_DIR;
  if (!process.env.RESEND_API_KEY && outbox) {
    await mkdir(outbox, { recursive: true });
    const id = `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(
      join(outbox, `${id}.json`),
      JSON.stringify({
        ...email,
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          bytes: a.content.length,
        })),
      }),
    );
    return { id };
  }
  if (!process.env.RESEND_API_KEY) throw new EmailNotConfigured();

  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      cc: email.cc?.length ? email.cc : undefined,
      reply_to: email.replyTo || undefined,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Email failed: ${body.message ?? res.status}`);
  return { id: body.id };
}

/**
 * "{Shop} via Sundeck Pro" <reports@domain>, replies go to the shop (6.5). Mass emails come
 * from news@ (Email Customers, 2026-10-22).
 */
export function fromAddress(shopName: string, mailbox: "reports" | "news" = "reports"): string {
  const domain = process.env.EMAIL_FROM_DOMAIN || "send.sundeckpro.com";
  const name = shopName.replace(/["<>]/g, "").trim() || "Sundeck Pro";
  return `"${name} via Sundeck Pro" <${mailbox}@${domain}>`;
}

/** One email's result in a batch: its provider id, or why it didn't go. */
export type BatchResult = { id: string } | { error: string };

/** Resend's batch endpoint takes up to 100 emails a request. */
export const BATCH_SIZE = 100;

/**
 * Sends many emails, each to one person (no attachments, no cc): Resend's batch endpoint, 100 a
 * request, about two requests a second (Resend's default rate), a 429 tried once more after a
 * pause. Results come back in order. Without a key, EMAIL_OUTBOX_DIR gets one file per email.
 */
export async function sendEmailBatch(
  emails: Email[],
  fetchImpl: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<BatchResult[]> {
  // The App Review shop's emails are recorded as sent and go nowhere, but to sundeckpro.com.
  const review = await reviewShops(emails.map((e) => e.companyId));
  if (!review.size) return deliverBatch(emails, fetchImpl, pause);
  const results: BatchResult[] = emails.map(() => ({ id: "" }));
  const going: { at: number; email: Email }[] = [];
  emails.forEach((email, at) => {
    const kept = email.companyId && review.has(email.companyId) ? reviewRecipients(email) : email;
    if (kept) going.push({ at, email: kept });
    else results[at] = { id: heldId() };
  });
  const sent = going.length
    ? await deliverBatch(
        going.map((g) => g.email),
        fetchImpl,
        pause,
      )
    : [];
  going.forEach((g, i) => (results[g.at] = sent[i]!));
  return results;
}

async function deliverBatch(
  emails: Email[],
  fetchImpl: typeof fetch,
  pause: (ms: number) => Promise<void>,
): Promise<BatchResult[]> {
  if (!process.env.RESEND_API_KEY) {
    if (!process.env.EMAIL_OUTBOX_DIR) throw new EmailNotConfigured();
    const results: BatchResult[] = [];
    for (const email of emails) {
      try {
        results.push(await deliver(email, fetchImpl));
      } catch (e) {
        results.push({ error: e instanceof Error ? e.message : String(e) });
      }
    }
    return results;
  }
  const results: BatchResult[] = [];
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    if (i > 0) await pause(600);
    const chunk = emails.slice(i, i + BATCH_SIZE);
    const post = () =>
      fetchImpl("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((email) => ({
            from: email.from,
            to: [email.to],
            reply_to: email.replyTo || undefined,
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: email.headers,
          })),
        ),
      });
    try {
      let res = await post();
      if (res.status === 429) {
        await pause(1500);
        res = await post();
      }
      const body = (await res.json().catch(() => ({}))) as {
        data?: { id?: string }[];
        message?: string;
      };
      if (!res.ok || !Array.isArray(body.data)) throw new Error(body.message ?? String(res.status));
      chunk.forEach((_, j) => {
        const id = body.data?.[j]?.id;
        results.push(id ? { id } : { error: "No id from the email service" });
      });
    } catch (e) {
      const error = `Email failed: ${e instanceof Error ? e.message : String(e)}`;
      chunk.forEach(() => results.push({ error }));
    }
  }
  return results;
}
