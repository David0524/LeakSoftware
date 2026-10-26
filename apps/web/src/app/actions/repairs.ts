"use server";

import { revalidatePath } from "next/cache";
import {
  RESTORE_ROW,
  addRepairWrites,
  checkRepairDraft,
  removeRepairWrites,
  type JobRepair,
  type RepairItem,
  type RepairJob,
  type RepairWrite,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

import { friendlyDbError } from "@/lib/limits";
// A repair job's repairs, from the job page (owner, 2026-10-22: "add additional repair";
// packages/core/src/repairs.ts). The same rows and rules as the phones, written as the signed-in
// member (row security applies). The server keeps the job's price at their sum
// (supabase/migrations/20261022000800_job_repairs.sql).

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function load(jobId: string) {
  const office = await getOffice();
  const db = await createClient();
  if (!isUuid(jobId)) return { office, db, job: null, rows: [] as JobRepair[] };
  const { data: job } = await db
    .from("job")
    .select("id, type, fee_cents, intake")
    .eq("id", jobId)
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .maybeSingle();
  const { data: rows } = await db
    .from("job_repair")
    .select(
      "id, job_id, price_book_item_id, description, price_cents, sort_order, created_at, deleted_at",
    )
    .eq("job_id", jobId);
  return {
    office,
    db,
    job: job as RepairJob | null,
    rows: (rows ?? []) as JobRepair[],
  };
}

async function apply(
  db: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  writes: RepairWrite[],
): Promise<string | null> {
  for (const w of writes) {
    if (w.kind === "update") {
      const { error } = await db
        .from("job_repair")
        .update(w.values)
        .eq("id", w.id)
        .eq("company_id", companyId);
      if (error) return error.message;
      continue;
    }
    // Removed as it's written (the booked repair): the row first, then its removal, as the
    // phones' sync does (deleted_at is not an insert column).
    const { deleted_at: removed, ...values } = w.values;
    const { error } = await db
      .from("job_repair")
      .insert({ ...(w.id ? { id: w.id } : {}), company_id: companyId, ...values });
    // The booked repair written by a phone a moment ago: it's there already.
    if (error && !(w.id && error.code === "23505")) return error.message;
    if (removed && w.id) {
      const { error: removeError } = await db
        .from("job_repair")
        .update({ deleted_at: removed })
        .eq("id", w.id)
        .eq("company_id", companyId);
      if (removeError) return removeError.message;
    }
  }
  return null;
}

/** Add Additional Repair: a price book item or a description, and its price. */
export async function addRepairAction(_: FormState, form: FormData): Promise<FormState> {
  const jobId = text(form, "job");
  const { office, db, job, rows } = await load(jobId);
  if (!job || job.type !== "repair") return { error: "This job is gone. Refresh the page." };
  const pick = text(form, "pick");
  let items: RepairItem[] = [];
  if (pick && isUuid(pick)) {
    const { data } = await db
      .from("price_book_item")
      .select("id, name, price_cents")
      .eq("id", pick)
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      const item = data as { id: string; name: string; price_cents: number };
      items = [{ id: item.id, name: item.name, cents: item.price_cents }];
    }
  }
  const { repair, errors } = checkRepairDraft(
    { pick, description: text(form, "description"), price: text(form, "price") },
    // With no item found, a typed description is what's saved.
    items.length ? items : [],
    true,
  );
  if (!repair) {
    return {
      fields: {
        ...(errors.description
          ? { [pick === "" || pick === "custom" ? "description" : "pick"]: errors.description }
          : {}),
        ...(errors.price ? { price: errors.price } : {}),
      },
    };
  }
  const { writes } = addRepairWrites(job, rows, repair);
  const error = await apply(db, office.company.id, writes);
  if (error) return { error };
  revalidatePath(`/jobs/${jobId}`);
  return { message: "Repair added." };
}

/** Removes one repair (soft delete, so it leaves the phones too). */
export async function removeRepairAction(jobId: string, repairId: string): Promise<FormState> {
  const { office, db, job, rows } = await load(jobId);
  if (!job || job.type !== "repair") return { error: "This job is gone. Refresh the page." };
  const { writes } = removeRepairWrites(job, rows, repairId, new Date().toISOString());
  if (!writes.length) return { error: "This repair is gone. Refresh the page." };
  const error = await apply(db, office.company.id, writes);
  if (error) return { error };
  revalidatePath(`/jobs/${jobId}`);
  return { message: "Removed." };
}

/** Undo for Remove on a repair: the row is live again (the server keeps the job's price at their sum). */
export async function restoreRepairAction(jobId: string, repairId: string): Promise<FormState> {
  const { office, db, job } = await load(jobId);
  if (!job || job.type !== "repair") return { error: "This job is gone. Refresh the page." };
  const { error } = await db
    .from("job_repair")
    .update(RESTORE_ROW)
    .eq("id", repairId)
    .eq("company_id", office.company.id);
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath(`/jobs/${jobId}`);
  return { message: "Restored." };
}
