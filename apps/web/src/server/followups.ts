import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  followupEmail,
  followupText,
  planFollowup,
  toE164,
  type Followup,
  type FollowupEmail,
} from "@leakbook/core";
import { emailConfigured, fromAddress, sendEmail } from "./email";
import { activeLine, sendCompanyText } from "./texting";

// The daily follow-ups (M10, and text reminders, 2026-11-16): ask the database what is due, work
// out what the shop's channel and the customer allow (core planFollowup), claim each message in
// the message log (a unique index per channel makes a second run skip it), send it, and record
// how it went. Reminders go by email, text, or both; the review request is always email.

export interface FollowupRun {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** What sends, so the daily run's choices can be tested without a mailer or a phone line. */
export interface FollowupIo {
  emailReady: () => boolean;
  sendEmail: (m: {
    companyId: string;
    fromName: string;
    to: string;
    cc: string[];
    replyTo: string | null;
    email: FollowupEmail;
  }) => Promise<{ id: string }>;
  /** Whether the shop has a working company number (not pending or released). */
  hasLine: (db: SupabaseClient, companyId: string) => Promise<boolean>;
  /** The numbers (as +1...) that replied STOP to the shop. */
  optedOut: (db: SupabaseClient, companyId: string) => Promise<Set<string>>;
  /** Send the text from the shop's number, as the shop; throws with the reason. */
  sendText: (
    db: SupabaseClient,
    m: { companyId: string; jobId: string; phone: string; body: string },
    origin: string,
  ) => Promise<{ id: string }>;
}

const live: FollowupIo = {
  emailReady: emailConfigured,
  sendEmail: async (m) =>
    sendEmail({
      companyId: m.companyId,
      from: fromAddress(m.fromName),
      to: m.to,
      cc: m.cc,
      replyTo: m.replyTo,
      ...m.email,
    }),
  hasLine: async (db, companyId) => (await activeLine(db, companyId))?.status === "active",
  optedOut: async (db, companyId) => {
    const { data } = await db
      .from("conversation")
      .select("phone")
      .eq("company_id", companyId)
      .eq("opted_out", true)
      .is("deleted_at", null);
    return new Set(((data ?? []) as { phone: string }[]).map((c) => c.phone));
  },
  sendText: async (db, m, origin) =>
    sendCompanyText(
      db,
      null,
      { companyId: m.companyId, phone: m.phone, body: m.body, jobId: m.jobId },
      origin,
    ),
};

export async function runFollowups(
  admin: SupabaseClient,
  origin: string,
  at: Date = new Date(),
  io: FollowupIo = live,
): Promise<FollowupRun> {
  const run: FollowupRun = { due: 0, sent: 0, failed: 0, skipped: 0 };
  const { data, error } = await admin.rpc("due_followups", { at: at.toISOString() });
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Followup[];
  run.due = due.length;
  // Per shop, once: its number and who told it STOP.
  const shops = new Map<string, { texting: boolean; stopped: Set<string> }>();
  const shopFor = async (companyId: string) => {
    let s = shops.get(companyId);
    if (!s) {
      const texting = await io.hasLine(admin, companyId);
      s = { texting, stopped: texting ? await io.optedOut(admin, companyId) : new Set() };
      shops.set(companyId, s);
    }
    return s;
  };

  /** Claim the message in the log, then send it; false when another run claimed it first. */
  const deliver = async (
    f: Followup,
    channel: "email" | "sms",
    recipient: string,
    send: () => Promise<{ id: string }>,
  ) => {
    const { data: claim, error: claimError } = await admin
      .from("message")
      .insert({
        company_id: f.company_id,
        job_id: f.job_id,
        quote_id: f.quote_id,
        invoice_id: f.invoice_id,
        channel,
        recipient,
        template: f.template,
        status: "queued",
      })
      .select("id")
      .single();
    if (claimError || !claim) {
      run.skipped++; // Another run claimed it first.
      return;
    }
    try {
      const sent = await send();
      await admin
        .from("message")
        .update({ status: "sent", provider_id: sent.id })
        .eq("id", claim.id);
      run.sent++;
    } catch (e) {
      await admin
        .from("message")
        .update({ status: "failed", error: e instanceof Error ? e.message : String(e) })
        .eq("id", claim.id);
      run.failed++;
    }
  };

  for (const f of due) {
    const shop = await shopFor(f.company_id);
    const phone = toE164(f.customer.phone);
    const plan = planFollowup(f, {
      email: io.emailReady(),
      texting: shop.texting,
      textOptedOut: phone ? shop.stopped.has(phone) : false,
    });
    if (!plan.email && !plan.text) {
      run.skipped++; // Nothing this customer can get on the shop's channel today.
      continue;
    }
    if (plan.email) {
      const to = f.customer.email.trim();
      const cc = [...new Set(f.customer.cc_emails.map((e) => e.trim().toLowerCase()))].filter(
        (e) => e && e !== to.toLowerCase(),
      );
      await deliver(f, "email", [to, ...cc].join(", "), () =>
        io.sendEmail({
          companyId: f.company_id,
          fromName: f.company.name,
          to,
          cc,
          replyTo: f.company.email,
          email: followupEmail(f, origin),
        }),
      );
    }
    if (plan.text) {
      const number = plan.text;
      await deliver(f, "sms", number, () =>
        io.sendText(
          admin,
          {
            companyId: f.company_id,
            jobId: f.job_id,
            phone: number,
            body: followupText(f, origin),
          },
          origin,
        ),
      );
    }
  }
  return run;
}
