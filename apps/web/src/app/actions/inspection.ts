"use server";

import { revalidatePath } from "next/cache";
import {
  DIAGRAM_SHAPES,
  calculate,
  nextInstance,
  normalizeTestData,
  parseDollars,
  planComponents,
  userTransitions,
  uuidv7,
  validateFinding,
  validateTestData,
  verdictValues,
  type ComponentType,
  type FindingStatus,
  type JobComponent,
  type JobStatus,
  type Outcome,
  type TestData,
  type TestType,
  type Verdict,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

// Working a job from the website (M9.5): the same rows and rules as the phone app, written
// straight to the server as the signed-in member (row security and column grants apply).

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const VERDICTS: Verdict[] = ["ok", "leaking", "attention", "na"];
const OUTCOMES: Outcome[] = ["pass", "fail", "inconclusive"];
const FINDING_STATUSES: FindingStatus[] = ["open", "quoted", "repaired", "monitor"];

async function ctx() {
  const office = await getOffice();
  return { office, db: await createClient() };
}

function done(jobId: string, message = "Saved."): FormState {
  revalidatePath(`/jobs/${jobId}`);
  return { message };
}

// ---------------------------------------------------------------------------
// Job status (Start Job, Move Back to Scheduled, Reopen Job, Cancel Job)
// ---------------------------------------------------------------------------

export async function changeJobStatus(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const to = text(form, "to") as JobStatus;
  const { data: job } = await db
    .from("job")
    .select("status, started_at, type")
    .eq("id", jobId)
    .eq("company_id", office.company.id)
    .single();
  if (!job) return { error: "Job not found." };
  if (!userTransitions(job.status as JobStatus, job.type as string).includes(to))
    return { error: "The job can't move to that status now." };
  const values: Record<string, string> = { status: to };
  if (to === "in_progress" && !job.started_at) values.started_at = new Date().toISOString();
  const { error } = await db.from("job").update(values).eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath("/jobs");
  revalidatePath("/schedule");
  return done(jobId, "Updated.");
}

/** Detection fee, "Leak location marked", and the job notes, as on the phone's job screen. */
export async function saveJobDetails(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const fee = text(form, "fee");
  const feeCents = fee ? parseDollars(fee) : null;
  if (fee && feeCents === null) return { fields: { fee: "Enter an amount like 649 or 649.00." } };
  const { error } = await db
    .from("job")
    .update({
      fee_cents: feeCents,
      location_marked: form.get("location_marked") === "on",
      summary_notes: text(form, "notes") || null,
    })
    .eq("id", jobId)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  return done(jobId);
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

/** The default checklist for the pool, for a job that has none yet. */
export async function setUpChecklist(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  // Two reads: the job's foreign key to its pool is composite, so it can't be embedded.
  const { data: job } = await db.from("job").select("property_id, type").eq("id", jobId).single();
  const { data: property } = job
    ? await db
        .from("property")
        .select("has_pool, has_spa, pool_type")
        .eq("id", (job as { property_id: string }).property_id)
        .maybeSingle()
    : { data: null };
  const { data: types } = await db
    .from("component_type")
    .select("*")
    .eq("company_id", office.company.id)
    .is("deleted_at", null);
  const pool = property as {
    has_pool: boolean;
    has_spa: boolean;
    pool_type: string | null;
  } | null;
  const jobType =
    (job as { type?: string } | null)?.type === "maintenance" ? "maintenance" : "detection";
  const planned = planComponents(
    (types ?? []) as ComponentType[],
    {
      has_pool: pool?.has_pool ?? true,
      has_spa: pool?.has_spa ?? false,
      pool_type: pool?.pool_type ?? null,
    },
    jobType,
  ).map((p) => ({ ...p, id: uuidv7(), company_id: office.company.id, job_id: jobId }));
  if (planned.length === 0) return { error: "No checklist items are set up in Settings." };
  const { error } = await db.from("job_component").insert(planned);
  if (error) return { error: error.message };
  const { error: rowError } = await db.from("checklist_item_result").insert(
    planned.map((p) => ({
      id: uuidv7(),
      company_id: office.company.id,
      job_id: jobId,
      job_component_id: p.id,
      status: "pending",
    })),
  );
  if (rowError) return { error: rowError.message };
  return done(jobId, "Checklist ready.");
}

/** One tap: the verdict for an item (a result row exists for every item). */
export async function setVerdict(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const verdict = text(form, "verdict") as Verdict;
  if (!VERDICTS.includes(verdict)) return { error: "Pick a result." };
  const values = verdictValues(verdict, office.user.id);
  const resultId = text(form, "result");
  const { error } = resultId
    ? await db.from("checklist_item_result").update(values).eq("id", resultId)
    : await db.from("checklist_item_result").insert({
        ...values,
        id: uuidv7(),
        company_id: office.company.id,
        job_id: jobId,
        job_component_id: text(form, "component"),
      });
  if (error) return { error: error.message };
  return done(jobId);
}

/**
 * "Mark Rest Not Leaking": every item in a section still to do gets the first verdict (Not
 * Leaking, or No for yes/no questions). Items already answered are left alone.
 */
export async function markRest(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const ids = text(form, "components").split(",").filter(Boolean);
  if (ids.length === 0) return { message: "Nothing to mark." };
  const { error } = await db
    .from("checklist_item_result")
    .update(verdictValues("ok", office.user.id))
    .eq("job_id", jobId)
    .eq("status", "pending")
    .in("job_component_id", ids)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  return done(jobId);
}

/** Where on a Leaking or Attention item ("Seam at the skimmer throat"). */
export async function saveWhere(_: FormState, form: FormData): Promise<FormState> {
  const { db } = await ctx();
  const { error } = await db
    .from("checklist_item_result")
    .update({ location_text: text(form, "where") || null })
    .eq("id", text(form, "result"));
  if (error) return { error: error.message };
  return done(text(form, "job"));
}

/** "+ Return": the next instance of a type, with its checklist row. */
export async function addComponent(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const [{ data: type }, { data: existing }] = await Promise.all([
    db.from("component_type").select("*").eq("id", text(form, "type")).single(),
    db.from("job_component").select("*").eq("job_id", jobId).is("deleted_at", null),
  ]);
  if (!type) return { fields: { type: "Pick an item." } };
  const planned = nextInstance(type as ComponentType, (existing ?? []) as JobComponent[]);
  const { data: comp, error } = await db
    .from("job_component")
    .insert({ ...planned, id: uuidv7(), company_id: office.company.id, job_id: jobId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const { error: rowError } = await db.from("checklist_item_result").insert({
    id: uuidv7(),
    company_id: office.company.id,
    job_id: jobId,
    job_component_id: comp.id,
    status: "pending",
  });
  if (rowError) return { error: rowError.message };
  return done(jobId, `Added ${planned.label}.`);
}

/** Remove an item added by mistake; its checklist row goes with it. */
export async function removeComponent(_: FormState, form: FormData): Promise<FormState> {
  const { db } = await ctx();
  const now = new Date().toISOString();
  const id = text(form, "component");
  const { error } = await db
    .from("checklist_item_result")
    .update({ deleted_at: now })
    .eq("job_component_id", id)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  const { error: compError } = await db
    .from("job_component")
    .update({ deleted_at: now })
    .eq("id", id);
  if (compError) return { error: compError.message };
  return done(text(form, "job"), "Removed.");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Record or edit a test. The fields come from the test type's schema, as on the phone. */
export async function saveTest(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const testId = text(form, "test");
  const { data: type } = await db
    .from("test_type")
    .select("*")
    .eq("id", text(form, "type"))
    .single();
  if (!type) return { fields: { type: "Pick a test." } };
  const testType = type as TestType;
  const values: TestData = {};
  for (const field of testType.field_schema.fields)
    values[field.key] = text(form, `f_${field.key}`);
  const fieldErrors = validateTestData(testType.field_schema, values);
  if (Object.keys(fieldErrors).length) {
    return {
      fields: Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [`f_${k}`, v])),
    };
  }
  const data = normalizeTestData(testType.field_schema, values);
  const calc = calculate(testType, data);
  const chosen = text(form, "outcome") as Outcome;
  const record = {
    job_component_id: text(form, "component") || null,
    schema_version: testType.schema_version,
    data,
    computed: calc.computed,
    outcome: OUTCOMES.includes(chosen) ? chosen : (calc.suggested ?? null),
    notes: text(form, "notes") || null,
  };
  const { error } = testId
    ? await db.from("test_result").update(record).eq("id", testId)
    : await db.from("test_result").insert({
        ...record,
        id: uuidv7(),
        company_id: office.company.id,
        job_id: jobId,
        test_type_id: testType.id,
        performed_at: new Date().toISOString(),
      });
  if (error) return { error: error.message };
  return done(jobId, testId ? "Test saved." : "Test added.");
}

export async function deleteTest(_: FormState, form: FormData): Promise<FormState> {
  const { db } = await ctx();
  const { error } = await db
    .from("test_result")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", text(form, "test"));
  if (error) return { error: error.message };
  return done(text(form, "job"), "Test deleted.");
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/** Record or edit a finding: what, where, how serious, and a pin on the pool diagram. */
export async function saveFinding(_: FormState, form: FormData): Promise<FormState> {
  const { office, db } = await ctx();
  const jobId = text(form, "job");
  const findingId = text(form, "finding");
  const title = text(form, "title");
  const severity = text(form, "severity");
  const errors = validateFinding({ title, severity_key: severity });
  if (Object.keys(errors).length) {
    return {
      fields: Object.fromEntries(
        Object.entries(errors).map(([k, v]) => [k === "severity_key" ? "severity" : k, v]),
      ),
    };
  }
  const pinX = Number(text(form, "pin_x"));
  const pinY = Number(text(form, "pin_y"));
  const pinned = text(form, "pin_x") !== "" && pinX >= 0 && pinX <= 1 && pinY >= 0 && pinY <= 1;
  const status = text(form, "status") as FindingStatus;
  const record = {
    title,
    job_component_id: text(form, "component") || null,
    severity_key: severity,
    location_text: text(form, "location") || null,
    pin_x: pinned ? pinX : null,
    pin_y: pinned ? pinY : null,
    status: FINDING_STATUSES.includes(status) ? status : "open",
    notes: text(form, "notes") || null,
  };
  const { error } = findingId
    ? await db.from("finding").update(record).eq("id", findingId)
    : await db
        .from("finding")
        .insert({ ...record, id: uuidv7(), company_id: office.company.id, job_id: jobId });
  if (error) return { error: error.message };
  return done(jobId, findingId ? "Finding saved." : "Finding added.");
}

export async function deleteFinding(_: FormState, form: FormData): Promise<FormState> {
  const { db } = await ctx();
  const { error } = await db
    .from("finding")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", text(form, "finding"));
  if (error) return { error: error.message };
  return done(text(form, "job"), "Finding deleted.");
}

/** The pool's shape, for the diagram findings are pinned on (the job page's Findings part). */
export async function setPoolShape(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  const shape = String(form.get("shape") ?? "");
  if (!DIAGRAM_SHAPES.some((s) => s.key === shape)) return { error: "Pick a shape." };
  const { error } = await (
    await createClient()
  )
    .from("property")
    .update({ diagram_shape: shape })
    .eq("id", String(form.get("property") ?? ""));
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${String(form.get("job") ?? "")}`);
  return {};
}
