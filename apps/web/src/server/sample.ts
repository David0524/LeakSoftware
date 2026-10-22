import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sampleSentText } from "@leakbook/core";
import { emailConfigured } from "./email";
import { Refusal, dbFailure } from "./failures";
import { sendReport } from "./reports";

// The sample job (owner, 2026-10-22: "open it to a finished report with their own logo, then
// prompt 'Send yourself this report'"; docs/design/2026-10-22-first-win.md). Shared by the
// website (cookie session) and the phones (bearer token); `db` acts as the signed-in person.

export interface SampleSent {
  /** Emailed to `to`; false when this server can't send email (then open `link`). */
  emailed: boolean;
  to: string;
  link: string;
  message: string;
}

/** The sample's finished report and its link, or a refusal when it isn't a sample. */
async function sampleReport(db: SupabaseClient, jobId: string) {
  const { data: job, error } = await db
    .from("job")
    .select("id, sample")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw dbFailure(error);
  if (!job?.sample) throw new Refusal("This isn’t the sample job.");
  const { data: report } = await db
    .from("report")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "sent")
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!report) throw new Refusal("The sample’s report is gone.");
  const { data: link } = await db
    .from("share_link")
    .select("token")
    .eq("report_id", report.id)
    .is("revoked_at", null)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!link) throw new Refusal("The sample’s report link was turned off.");
  return { reportId: report.id as string, token: link.token as string };
}

/**
 * Send Yourself This Report: the sample's report to the signed-in person's own address, and
 * nobody else's (the address comes from their sign-in, never from the request).
 */
export async function sendSampleToSelf(
  db: SupabaseClient,
  jobId: string,
  me: { id: string; email: string },
  origin: string,
): Promise<SampleSent> {
  if (!me.email) throw new Refusal("Your account has no email address.");
  const { reportId, token } = await sampleReport(db, jobId);
  const link = `${origin}/r/${token}`;
  if (!emailConfigured()) {
    return { emailed: false, to: me.email, link, message: "Email isn’t set up on this server." };
  }
  const { data: profile } = await db
    .from("profile")
    .select("full_name")
    .eq("id", me.id)
    .maybeSingle();
  const first = ((profile?.full_name as string | null) ?? "").trim().split(/\s+/)[0] || null;
  await sendReport(db, reportId, {
    channel: "email",
    to: me.email,
    origin,
    self: { name: first },
  });
  return { emailed: true, to: me.email, link, message: sampleSentText(me.email) };
}

/** Delete Sample: the job and what was made for it. It never comes back. */
export async function deleteSample(db: SupabaseClient, jobId: string): Promise<void> {
  const { data, error } = await db.rpc("delete_sample_job", { target_job: jobId });
  if (error) throw dbFailure(error);
  if (data !== true) throw new Refusal("This isn’t the sample job, or it was already deleted.");
}
