"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UNSIGNED_CUSTOMER_AWAY } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { finishReport, saveReportText } from "@/server/reports";
import { sectionsOf } from "./report-form";
import type { ReportFormState } from "./reports";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Finishes the report the customer just read: after they signed (the signature is already
 * saved), or with the reason nobody did. The version locks, so what they read is what they get.
 */
export async function finishSignOff(input: {
  reportId: string;
  jobId: string;
  customerAway: boolean;
}): Promise<Result> {
  await getOffice();
  try {
    await finishReport(
      await createClient(),
      input.reportId,
      input.customerAway ? UNSIGNED_CUSTOMER_AWAY : null,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true };
}

/** Review with Customer: saves the text on screen, then opens the report to sign. */
export async function reviewWithCustomer(
  _: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  await getOffice();
  const reportId = String(form.get("report") ?? "");
  const final = sectionsOf(form);
  if (final.length && final.every((s) => !s.text)) return { error: "The report has no text." };
  try {
    if (final.length) await saveReportText(await createClient(), reportId, final);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(`/sign-off/${reportId}`);
}
