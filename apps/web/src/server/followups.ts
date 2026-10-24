import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { followupEmail, type Followup } from "@leakbook/core";
import { emailConfigured, fromAddress, sendEmail } from "./email";

// The daily follow-ups (M10): ask the database what is due, claim each one in the message
// log (a unique index makes a second run skip it), send it, and record how it went.

export interface FollowupRun {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function runFollowups(
  admin: SupabaseClient,
  origin: string,
  at: Date = new Date(),
): Promise<FollowupRun> {
  const run: FollowupRun = { due: 0, sent: 0, failed: 0, skipped: 0 };
  if (!emailConfigured()) return run;
  const { data, error } = await admin.rpc("due_followups", { at: at.toISOString() });
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Followup[];
  run.due = due.length;
  for (const f of due) {
    const to = f.customer.email.trim();
    const cc = [...new Set(f.customer.cc_emails.map((e) => e.trim().toLowerCase()))].filter(
      (e) => e && e !== to.toLowerCase(),
    );
    const { data: claim, error: claimError } = await admin
      .from("message")
      .insert({
        company_id: f.company_id,
        job_id: f.job_id,
        quote_id: f.quote_id,
        invoice_id: f.invoice_id,
        channel: "email",
        recipient: [to, ...cc].join(", "),
        template: f.template,
        status: "queued",
      })
      .select("id")
      .single();
    if (claimError || !claim) {
      run.skipped++; // Another run claimed it first.
      continue;
    }
    const email = followupEmail(f, origin);
    try {
      const sent = await sendEmail({
        companyId: f.company_id,
        from: fromAddress(f.company.name),
        to,
        cc,
        replyTo: f.company.email,
        ...email,
      });
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
  }
  return run;
}
