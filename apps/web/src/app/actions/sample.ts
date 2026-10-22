"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOffice } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { deleteSample, sendSampleToSelf } from "@/server/sample";

export interface SampleState {
  message?: string;
  error?: string;
  /** Open this when the server couldn't email it. */
  link?: string;
}

/** Send Yourself This Report on the sample job (owner, 2026-10-22). */
export async function sendSampleAction(_: SampleState, form: FormData): Promise<SampleState> {
  const office = await getOffice();
  const jobId = String(form.get("job") ?? "");
  try {
    const sent = await sendSampleToSelf(
      await createClient(),
      jobId,
      { id: office.user.id, email: office.user.email },
      await siteOrigin(),
    );
    revalidatePath(`/jobs/${jobId}`);
    return sent.emailed
      ? { message: sent.message }
      : { message: `${sent.message} Here’s the report instead.`, link: sent.link };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Delete Sample: gone for good, back to Today. */
export async function deleteSampleAction(_: SampleState, form: FormData): Promise<SampleState> {
  await getOffice();
  try {
    await deleteSample(await createClient(), String(form.get("job") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/", "layout");
  redirect("/today");
}
