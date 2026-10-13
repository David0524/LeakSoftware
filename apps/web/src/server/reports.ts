import "server-only";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import {
  narrativeTemplate,
  reportShareText,
  toFinalSections,
  type FinalSection,
  type NarrativeProblem,
  type ReportSnapshot,
  type ReportTemplateKey,
} from "@leakbook/core";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { adminClient } from "./admin";
import { EmailNotConfigured, emailConfigured, fromAddress, sendEmail } from "./email";
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
  if (error) throw new Error(error.message);
  const prepared = data as {
    report_id: string;
    version: number;
    snapshot: ReportSnapshot;
    tone: string;
  };
  const result = await writeNarrative(
    prepared.snapshot,
    narrativeTemplate(template),
    prepared.tone,
  );
  const final = toFinalSections(result.narrative);
  const { error: saveError } = await db.rpc("save_report_draft", {
    target_report: prepared.report_id,
    draft: result.narrative,
    final,
    model_id: result.model,
    prompt: result.promptVersion,
    problems: result.problems,
  });
  if (saveError) throw new Error(saveError.message);
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
  if (error) throw new Error(error.message);
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

export async function sendReport(
  db: SupabaseClient,
  reportId: string,
  opts: { channel: Channel; to?: string | null; origin: string },
): Promise<SendResult> {
  const to = opts.to?.trim() || null;
  if (opts.channel === "email") {
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) throw new Error("Enter the customer’s email.");
    if (!emailConfigured()) throw new EmailNotConfigured();
  }

  const { data, error } = await db.rpc("send_report", { target_report: reportId });
  if (error) throw new Error(error.message);
  const token = (data as { token: string }).token;
  const link = `${opts.origin}/r/${token}`;

  const { data: report, error: readError } = await db
    .from("report")
    .select("company_id, job_id, template_key, data_snapshot")
    .eq("id", reportId)
    .single();
  if (readError) throw new Error(readError.message);
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
  try {
    const sent = await sendEmail({
      from: fromAddress(shop),
      to: to!,
      replyTo: snapshot.company.email,
      subject: `Your leak detection report from ${shop}`,
      text: `${greeting}\n\nYour leak detection report for ${snapshot.property.address} is ready:\n${link}\n\n${shop}${snapshot.company.phone ? `\n${snapshot.company.phone}` : ""}`,
      html: `<p>${escapeHtml(greeting)}</p><p>Your leak detection report for ${escapeHtml(snapshot.property.address)} is ready.</p><p><a href="${link}">View your report</a></p><p>${escapeHtml(shop)}${snapshot.company.phone ? `<br>${escapeHtml(snapshot.company.phone)}` : ""}</p>`,
      attachments: attach ? [{ filename: `${shop} leak detection report.pdf`, content: pdf! }] : [],
    });
    await db.rpc("log_message", {
      target_job: report.job_id,
      via: "email",
      sent_to: to,
      template_key: `report_${report.template_key}`,
      delivery: "sent",
      provider: sent.id,
    });
  } catch (e) {
    await db.rpc("log_message", {
      target_job: report.job_id,
      via: "email",
      sent_to: to,
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
