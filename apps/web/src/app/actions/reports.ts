"use server";

import { revalidatePath } from "next/cache";
import type { ReportTemplateKey } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { draftReport, saveReportText, sendReport, type Channel } from "@/server/reports";
import type { FormState } from "./auth";
import { sectionsOf } from "./report-form";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export interface ReportFormState extends FormState {
  link?: string;
  sms?: string;
}

export async function writeDraft(_: ReportFormState, form: FormData): Promise<ReportFormState> {
  await getOffice();
  const jobId = text(form, "job");
  const template = text(form, "template") as ReportTemplateKey;
  try {
    const result = await draftReport(await createClient(), jobId, template);
    revalidatePath(`/jobs/${jobId}`);
    return {
      message: result.problems.length
        ? `Draft written. ${result.problems.length} thing${result.problems.length === 1 ? "" : "s"} to check below.`
        : "Draft written. Read it over and edit anything before sending.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveText(_: ReportFormState, form: FormData): Promise<ReportFormState> {
  await getOffice();
  const final = sectionsOf(form);
  if (final.every((s) => !s.text)) return { error: "The report has no text." };
  try {
    await saveReportText(await createClient(), text(form, "report"), final);
    revalidatePath(`/jobs/${text(form, "job")}`);
    return { message: "Saved." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendReportAction(
  _: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  await getOffice();
  const channel = text(form, "channel") as Channel;
  if (channel !== "email" && channel !== "sms_device") return { error: "Choose how to send it." };
  // The send buttons share the form with the text, so what is on screen is what gets sent.
  const final = sectionsOf(form);
  if (final.length && final.every((s) => !s.text)) return { error: "The report has no text." };
  try {
    if (final.length) await saveReportText(await createClient(), text(form, "report"), final);
    const result = await sendReport(await createClient(), text(form, "report"), {
      channel,
      to: text(form, "to"),
      origin: await siteOrigin(),
    });
    revalidatePath(`/jobs/${text(form, "job")}`);
    return {
      message: result.emailed
        ? `Sent to ${text(form, "to")}.`
        : "Report sent. Copy the message below.",
      link: result.link,
      sms: result.message,
    };
  } catch (e) {
    revalidatePath(`/jobs/${text(form, "job")}`);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
