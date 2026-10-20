import "server-only";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import {
  FINISH_PHOTO_MESSAGE,
  completeJobBlocker,
  requiresFinishPhoto,
  requiresFinishedChecklist,
  narrativeTemplate,
  reportShareText,
  toFinalSections,
  type FinalSection,
  type NarrativeProblem,
  type ReportSnapshot,
  type ReportTemplateKey,
} from "@leakbook/core";
import { after } from "next/server";
import { siteOrigin } from "@/lib/origin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { adminClient } from "./admin";
import { EmailNotConfigured, emailConfigured, fromAddress, sendEmail } from "./email";
import { ccList, emailRefusal } from "./usage";
import { Refusal, dbFailure } from "./failures";
import { writeNarrative } from "./narrative";
import { renderPdf, reportPdfPath } from "./pdf";

// Report actions shared by the office website (cookie session) and the phone API (bearer
// token). `db` always acts as the signed-in member; the database functions check access.

export interface DraftResult {
  reportId: string;
  version: number;
  final: FinalSection[];
  problems: NarrativeProblem[];
  model: string;
}

export async function draftReport(
  db: SupabaseClient,
  jobId: string,
  template: ReportTemplateKey,
): Promise<DraftResult> {
  const { data, error } = await db.rpc("prepare_report", { target_job: jobId, template });
  if (error) throw dbFailure(error);
  const prepared = data as {
    report_id: string;
    version: number;
    snapshot: ReportSnapshot;
    tone: string;
  };
  const result = writeNarrative(prepared.snapshot, narrativeTemplate(template));
  const final = toFinalSections(result.narrative);
  const { error: saveError } = await db.rpc("save_report_draft", {
    target_report: prepared.report_id,
    draft: result.narrative,
    final,
    model_id: result.model,
    prompt: result.promptVersion,
    problems: result.problems,
  });
  if (saveError) throw dbFailure(saveError);
  return {
    reportId: prepared.report_id,
    version: prepared.version,
    final,
    problems: result.problems,
    model: result.model,
  };
}

/** Saves the tech's edited text (a client-writable column; RLS applies). */
export async function saveReportText(db: SupabaseClient, reportId: string, final: FinalSection[]) {
  const { error } = await db
    .from("report")
    .update({ final_sections: final })
    .eq("id", reportId)
    .eq("status", "draft");
  if (error) throw dbFailure(error);
}

export type Channel = "email" | "sms_device";

export interface SendResult {
  token: string;
  link: string;
  /** For texting: the prefilled message. */
  message: string;
  emailed: boolean;
}

/** Anonymous client: what a customer opening the link can see. */
export function publicClient(): SupabaseClient {
  return createSupabase(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The stored PDF if there is one; otherwise render it (and store it when allowed). */
export async function reportPdf(
  origin: string,
  token: string,
  ids: { companyId: string; jobId: string; reportId: string },
): Promise<Buffer> {
  const path = reportPdfPath(ids.companyId, ids.jobId, ids.reportId);
  const stored = await publicClient().storage.from("documents").download(path);
  if (stored.data) return Buffer.from(await stored.data.arrayBuffer());
  const pdf = await renderPdf(`${origin}/r/${token}?print=1`);
  const server = adminClient();
  if (server) {
    await server.storage
      .from("documents")
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  }
  return pdf;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Finishes a draft: locks it with the signatures taken since the last version, or with the
 * reason nobody signed. Returns the customer link token.
 */
export async function finishReport(
  db: SupabaseClient,
  reportId: string,
  unsignedReason: string | null = null,
): Promise<string> {
  const { data: report } = await db
    .from("report")
    .select("job_id, company_id")
    .eq("id", reportId)
    .single();
  if (report) await requireFinishPhoto(db, report.job_id as string);
  const { data, error } = await db.rpc("send_report", {
    target_report: reportId,
    unsigned_reason: unsignedReason,
  });
  if (error) throw dbFailure(error);
  const token = (data as { token: string }).token;
  // Make the PDF now, after the reply, so opening it later is instant instead of a white
  // screen while it renders (owner, 2026-10-20: "a long white screen when loading").
  if (report) {
    const origin = await siteOrigin();
    after(async () => {
      try {
        await reportPdf(origin, token, {
          companyId: report.company_id as string,
          jobId: report.job_id as string,
          reportId,
        });
      } catch {
        // Not made now: it's made the first time someone opens it, as before.
      }
    });
  }
  return token;
}

/**
 * With the shop's "Require a pool photo to finish a job" on (owner, 2026-10-19), a job can't
 * be finished (report sent, visit marked Done) until it has a photo. Photos still uploading
 * from a phone count: the row is there.
 */
export async function requireFinishPhoto(db: SupabaseClient, jobId: string): Promise<void> {
  const { data: job } = await db
    .from("job")
    .select("company:company!job_company_id_fkey(settings)")
    .eq("id", jobId)
    .single();
  const company = job?.company as unknown as { settings: unknown } | null;
  if (!requiresFinishPhoto(company?.settings)) return;
  const { count } = await db
    .from("media")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("kind", "photo")
    .is("deleted_at", null);
  if (!count) throw new Refusal(FINISH_PHOTO_MESSAGE);
}

/**
 * Complete Job (owner, 2026-10-19): with the shop's "Finish the checklist first" on, every
 * checklist item must be answered; then the photo rule as above.
 */
export async function requireCompletable(db: SupabaseClient, jobId: string): Promise<void> {
  const { data: job } = await db
    .from("job")
    .select("company:company!job_company_id_fkey(settings)")
    .eq("id", jobId)
    .single();
  const settings = (job?.company as unknown as { settings: unknown } | null)?.settings;
  const [toDo, photos] = await Promise.all([
    requiresFinishedChecklist(settings)
      ? db
          .from("checklist_item_result")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("status", "pending")
          .is("deleted_at", null)
      : { count: 0 },
    requiresFinishPhoto(settings)
      ? db
          .from("media")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("kind", "photo")
          .is("deleted_at", null)
      : { count: 1 },
  ]);
  const blocker = completeJobBlocker(settings, {
    checklistToDo: toDo.count ?? 0,
    photos: photos.count ?? 0,
  });
  if (blocker) throw new Refusal(blocker);
}

/** The link of a report to send: a draft is finished first; a finished one is sent as is. */
async function finishedToken(db: SupabaseClient, reportId: string): Promise<string> {
  const { data: report, error } = await db
    .from("report")
    .select("status")
    .eq("id", reportId)
    .single();
  if (error) throw dbFailure(error);
  if (report.status === "draft") return finishReport(db, reportId);
  if (report.status !== "sent") throw new Refusal("A newer version of this report has been sent.");
  const { data: link } = await db
    .from("share_link")
    .select("token")
    .eq("report_id", reportId)
    .is("revoked_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!link) throw new Refusal("This report’s link was turned off.");
  return link.token as string;
}

export async function sendReport(
  db: SupabaseClient,
  reportId: string,
  opts: { channel: Channel; to?: string | null; origin: string },
): Promise<SendResult> {
  const to = opts.to?.trim() || null;
  if (opts.channel === "email") {
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) throw new Refusal("Enter the customer’s email.");
    if (!emailConfigured()) throw new EmailNotConfigured();
  }

  const token = await finishedToken(db, reportId);
  const link = `${opts.origin}/r/${token}`;

  const { data: report, error: readError } = await db
    .from("report")
    .select("company_id, job_id, template_key, data_snapshot")
    .eq("id", reportId)
    .single();
  if (readError) throw dbFailure(readError);
  const snapshot = report.data_snapshot as ReportSnapshot;
  const shop = snapshot.company.name;
  const message = reportShareText(shop, link);

  if (opts.channel === "sms_device") {
    await db.rpc("log_message", {
      target_job: report.job_id,
      via: "sms_device",
      sent_to: to ?? snapshot.customer?.phone ?? "phone",
      template_key: `report_${report.template_key}`,
      delivery: "sent",
    });
    return { token, link, message, emailed: false };
  }

  // The customer's other addresses get the report too, once each.
  const cc = ccList(snapshot.customer?.cc_emails, to!);
  const refusal = await emailRefusal(db, report.company_id as string, 1 + cc.length);
  if (refusal) throw new Refusal(refusal);
  let pdf: Buffer | null = null;
  try {
    pdf = await reportPdf(opts.origin, token, {
      companyId: report.company_id,
      jobId: report.job_id,
      reportId,
    });
  } catch {
    // The link still works; the PDF can be downloaded from the report page.
  }
  const attach = pdf && pdf.length < 5 * 1024 * 1024;
  const greeting = snapshot.customer?.name ? `Hi ${snapshot.customer.name},` : "Hello,";
  const sentTo = [to!, ...cc].join(", ");
  try {
    const sent = await sendEmail({
      from: fromAddress(shop),
      to: to!,
      cc,
      replyTo: snapshot.company.email,
      subject: `Your leak detection report from ${shop}`,
      text: `${greeting}\n\nYour leak detection report for ${snapshot.property.address} is ready:\n${link}\n\n${shop}${snapshot.company.phone ? `\n${snapshot.company.phone}` : ""}`,
      html: `<p>${escapeHtml(greeting)}</p><p>Your leak detection report for ${escapeHtml(snapshot.property.address)} is ready.</p><p><a href="${link}">View your report</a></p><p>${escapeHtml(shop)}${snapshot.company.phone ? `<br>${escapeHtml(snapshot.company.phone)}` : ""}</p>`,
      attachments: attach ? [{ filename: `${shop} leak detection report.pdf`, content: pdf! }] : [],
    });
    await db.rpc("log_message", {
      target_job: report.job_id,
      via: "email",
      sent_to: sentTo,
      template_key: `report_${report.template_key}`,
      delivery: "sent",
      provider: sent.id,
    });
  } catch (e) {
    await db.rpc("log_message", {
      target_job: report.job_id,
      via: "email",
      sent_to: sentTo,
      template_key: `report_${report.template_key}`,
      delivery: "failed",
      failure: e instanceof Error ? e.message : String(e),
    });
    throw new Error(
      `The report is sent and its link works, but the email failed: ${e instanceof Error ? e.message : e}. Text the link instead.`,
    );
  }
  return { token, link, message, emailed: true };
}
