"use server";

import { revalidatePath } from "next/cache";
import { isDiagramShape, parseDiagramLayout, parseMarkup } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { friendlyDbError } from "@/lib/limits";
type Result = { ok: true } | { ok: false; error: string };

/**
 * The pool's diagram (owner, 2026-10-19): its shape (blank: not known yet), mirrored or not,
 * whether it has a spa, and where the spa sits, how big, and round or square.
 */
export async function savePoolDiagram(input: {
  jobId: string;
  propertyId: string;
  shape: string | null;
  hasSpa: boolean;
  layout: unknown;
}): Promise<Result> {
  const office = await getOffice();
  if (input.shape && !isDiagramShape(input.shape)) return { ok: false, error: "Pick a shape." };
  const layout = parseDiagramLayout(input.layout);
  const { error } = await (
    await createClient()
  )
    .from("property")
    .update({
      diagram_shape: input.shape || null,
      has_spa: input.hasSpa,
      diagram_layout: Object.keys(layout).length ? layout : null,
    })
    .eq("id", input.propertyId)
    .eq("company_id", office.company.id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true };
}

/** Pen, arrows, circles, and labels drawn on the job's pool diagram (owner, 2026-10-19). */
export async function saveDiagramMarkup(input: {
  jobId: string;
  markup: unknown;
}): Promise<Result> {
  const office = await getOffice();
  const markup = parseMarkup(input.markup);
  const { error } = await (
    await createClient()
  )
    .from("job")
    .update({ diagram_markup: markup.shapes.length ? markup : null })
    .eq("id", input.jobId)
    .eq("company_id", office.company.id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true };
}
