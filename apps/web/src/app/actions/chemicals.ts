"use server";

import { revalidatePath } from "next/cache";
import {
  ACID_PRODUCTS,
  CHLORINE_PRODUCTS,
  READING_LABELS,
  READING_LIMITS,
  uuidv7,
  type ReadingKey,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Submit on the Chemical screen (owner, 2026-10-19): the gallons, readings, and products on
 * the left side go into the pool's chemical log.
 */
export async function submitReadings(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const property = text(form, "property");
  if (!property) return { error: "Open Chemical from a pool to save its readings." };
  const job = text(form, "job") || null;
  const readings: Partial<Record<ReadingKey, number>> = {};
  for (const key of Object.keys(READING_LIMITS) as ReadingKey[]) {
    const raw = text(form, key).replace(/,/g, "");
    if (!raw) continue;
    const n = Number(raw);
    const { min, max } = READING_LIMITS[key];
    if (!Number.isFinite(n) || n < min || n > max)
      return { error: `${READING_LABELS[key]} should be between ${min} and ${max}.` };
    readings[key] = n;
  }
  if (Object.keys(readings).length === 0) return { error: "Enter at least one reading." };
  const gallonsText = text(form, "gallons").replace(/[,\s]/g, "");
  const gallons = gallonsText ? Math.round(Number(gallonsText)) : null;
  if (gallons !== null && !(gallons > 0 && gallons < 10_000_000))
    return { error: "Enter the gallons as a number, like 20,000." };
  const chlorine = text(form, "chlorine");
  const acid = text(form, "acid");
  const supabase = await createClient();
  const { error } = await supabase.from("chemical_reading").insert({
    id: uuidv7(),
    company_id: office.company.id,
    property_id: property,
    job_id: job,
    gallons,
    ...readings,
    chlorine_product: chlorine in CHLORINE_PRODUCTS ? chlorine : null,
    acid_product: acid in ACID_PRODUCTS ? acid : null,
  });
  if (error) return { error: error.message };
  // A pool's gallons fill in from the first submit that has them.
  if (gallons !== null)
    await supabase
      .from("property")
      .update({ approx_gallons: gallons })
      .eq("id", property)
      .is("approx_gallons", null);
  revalidatePath("/chemicals");
  revalidatePath("/customers", "layout");
  // From the visit's Checklist: its Chemical line shows the new readings.
  if (job) revalidatePath(`/jobs/${job}`);
  return { message: "Submitted." };
}

/** Remove a reading submitted by mistake. */
export async function removeReading(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  const { error } = await (
    await createClient()
  )
    .from("chemical_reading")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", text(form, "reading"));
  if (error) return { error: error.message };
  revalidatePath("/chemicals");
  revalidatePath("/customers", "layout");
  return { message: "Removed." };
}
