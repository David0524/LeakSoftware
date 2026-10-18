import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Email delivery (BUILD_PLAN 6.5). Resend in production; tests write messages to a folder
// (EMAIL_OUTBOX_DIR) so the end-to-end suite can open the link a customer would get.

export interface Email {
  from: string;
  to: string;
  /** The customer's other addresses (M8.5); they see each other, like a family email. */
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
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

/** "{Shop} via Sundeck Pro" <reports@domain>, replies go to the shop (6.5). */
export function fromAddress(shopName: string): string {
  const domain = process.env.EMAIL_FROM_DOMAIN || "send.sundeckpro.app";
  const name = shopName.replace(/["<>]/g, "").trim() || "Sundeck Pro";
  return `"${name} via Sundeck Pro" <reports@${domain}>`;
}
