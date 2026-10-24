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

// ---------------------------------------------------------------------------
// A visit's Chemicals (owner, 2026-10-24): saved as the tech types and taps, no Submit
// ---------------------------------------------------------------------------

export interface VisitReadingInput {
  job: string;
  property: string;
  gallons: string;
  readings: Partial<Record<ReadingKey, string>>;
  goals: Partial<Record<ReadingKey, string>>;
  chlorine: string;
  acid: string;
  notes: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The visit's readings: one row per visit, its id the visit's id (so two phones write the same
 * row), updated in place. Cleared of every reading, it's removed (and comes back when typed).
 */
export async function saveVisitReadingAction(input: VisitReadingInput): Promise<FormState> {
  const office = await getOffice();
  if (!UUID.test(input.job) || !UUID.test(input.property)) return { error: "This visit is gone." };
  const readings: Partial<Record<ReadingKey, number | null>> = {};
  const goals: Partial<Record<ReadingKey, number>> = {};
  for (const key of Object.keys(READING_LIMITS) as ReadingKey[]) {
    const { min, max } = READING_LIMITS[key];
    const raw = (input.readings[key] ?? "").replace(/,/g, "").trim();
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min || n > max)
        return { error: `${READING_LABELS[key]} should be between ${min} and ${max}.` };
      readings[key] = n;
    } else readings[key] = null;
    const goal = Number((input.goals[key] ?? "").replace(/,/g, "").trim() || "x");
    if (Number.isFinite(goal) && goal >= min && goal <= max) goals[key] = goal;
  }
  const gallonsText = input.gallons.replace(/[,\s]/g, "");
  const gallons = gallonsText ? Math.round(Number(gallonsText)) : null;
  if (gallons !== null && !(gallons > 0 && gallons < 10_000_000))
    return { error: "Enter the gallons as a number, like 20,000." };
  const any = Object.values(readings).some((v) => v !== null);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("chemical_reading")
    .select("id, deleted_at")
    .eq("id", input.job)
    .maybeSingle();
  const fields = {
    gallons,
    goals,
    chlorine_product: input.chlorine in CHLORINE_PRODUCTS ? input.chlorine : null,
    acid_product: input.acid in ACID_PRODUCTS ? input.acid : null,
    notes: input.notes.trim() || null,
  };
  let error: { message: string } | null = null;
  if (!existing) {
    if (!any) return {};
    ({ error } = await supabase.from("chemical_reading").insert({
      id: input.job,
      company_id: office.company.id,
      property_id: input.property,
      job_id: input.job,
      ...fields,
      ...readings,
    }));
  } else if (!any) {
    ({ error } = await supabase
      .from("chemical_reading")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.job));
  } else {
    ({ error } = await supabase
      .from("chemical_reading")
      .update({ ...fields, ...readings, deleted_at: null })
      .eq("id", input.job));
  }
  if (error) return { error: error.message };
  if (gallons !== null)
    await supabase
      .from("property")
      .update({ approx_gallons: gallons })
      .eq("id", input.property)
      .is("approx_gallons", null);
  return { message: "Saved." };
}

export interface ChemicalInput {
  id: string;
  price_book_item_id: string | null;
  name: string;
  unit: string;
  reading_key: ReadingKey | null;
  suggested_quantity: number | null;
  quantity: number;
  customer_supplied?: boolean;
  note?: string | null;
  sort_order?: number;
}

function checkChemical(
  c: Pick<ChemicalInput, "name" | "unit" | "quantity" | "note">,
): string | null {
  if (!c.name?.trim() || c.name.trim().length > 120) return "Pick a chemical.";
  if (!c.unit?.trim() || c.unit.trim().length > 20) return "Pick a chemical.";
  if (!(Number.isFinite(c.quantity) && c.quantity > 0 && c.quantity <= 100_000))
    return "Enter how much was added.";
  if (c.note && c.note.length > 200) return "Keep the note under 200 characters.";
  return null;
}

/** Added: one chemical, or every open suggestion at once (Mark All Added). */
export async function addChemicalsAction(
  job: string,
  property: string,
  chemicals: ChemicalInput[],
): Promise<FormState> {
  const office = await getOffice();
  if (!UUID.test(job) || !UUID.test(property)) return { error: "This visit is gone." };
  for (const c of chemicals) {
    const problem = checkChemical(c);
    if (problem) return { error: problem };
    if (!UUID.test(c.id)) return { error: "Try again." };
  }
  const { error } = await (await createClient()).from("chemical_addition").insert(
    chemicals.map((c, i) => ({
      id: c.id,
      company_id: office.company.id,
      job_id: job,
      property_id: property,
      price_book_item_id:
        c.price_book_item_id && UUID.test(c.price_book_item_id) ? c.price_book_item_id : null,
      name: c.name.trim(),
      unit: c.unit.trim(),
      reading_key: c.reading_key && c.reading_key in READING_LIMITS ? c.reading_key : null,
      suggested_quantity: c.suggested_quantity,
      quantity: c.quantity,
      customer_supplied: !!c.customer_supplied,
      note: c.note?.trim() || null,
      sort_order: c.sort_order ?? i,
    })),
  );
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${job}`);
  return { message: chemicals.length === 1 ? "Added." : `${chemicals.length} added.` };
}

/** A change to an added chemical: another chemical, the amount, Customer Supplied, the note. */
export async function updateChemicalAction(
  job: string,
  c: Pick<
    ChemicalInput,
    "id" | "price_book_item_id" | "name" | "unit" | "quantity" | "customer_supplied" | "note"
  >,
): Promise<FormState> {
  await getOffice();
  const problem = checkChemical(c);
  if (problem) return { error: problem };
  const { error } = await (
    await createClient()
  )
    .from("chemical_addition")
    .update({
      price_book_item_id:
        c.price_book_item_id && UUID.test(c.price_book_item_id) ? c.price_book_item_id : null,
      name: c.name.trim(),
      unit: c.unit.trim(),
      quantity: c.quantity,
      customer_supplied: !!c.customer_supplied,
      note: c.note?.trim() || null,
    })
    .eq("id", c.id);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${job}`);
  return { message: "Saved." };
}

/** Not added after all (soft delete, so it leaves the phones too). */
export async function removeChemicalAction(job: string, id: string): Promise<FormState> {
  await getOffice();
  const { error } = await (
    await createClient()
  )
    .from("chemical_addition")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${job}`);
  return { message: "Removed." };
}
