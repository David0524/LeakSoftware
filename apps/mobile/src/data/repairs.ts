import { useMemo } from "react";
import {
  addRepairWrites,
  jobRepairLines,
  removeRepairWrites,
  type JobRepair,
  type RepairJob,
  type RepairLine,
  type RepairValues,
  type RepairWrite,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../lib/services";
import { useJobRowsWithRemoved } from "./hooks";

// A repair job's repairs on this phone (owner, 2026-10-22: "add additional repair";
// packages/core/src/repairs.ts). Table `job_repair`. Every change is local first (row + outbox),
// with the job's price written beside it, so it works offline; the server keeps the price at the
// repairs' sum when two phones add at once.

type Job = RepairJob & { company_id: string };

/** The job's repairs in order (its rows, or the repair it was booked for). */
export function useJobRepairs(job: Job): RepairLine[] {
  const rows = useJobRowsWithRemoved<JobRepair>("job_repair", job.company_id, job.id);
  return useMemo(() => jobRepairLines(job, rows), [job, rows]);
}

function rowsOf(job: Job): JobRepair[] {
  return getServices().sync.list(
    "job_repair",
    job.company_id,
    job.id,
    true,
  ) as unknown as JobRepair[];
}

function apply(job: Job, writes: RepairWrite[], fee: number) {
  const { sync } = getServices();
  sync.batch(() => {
    for (const w of writes) {
      const values = w.values as Record<string, JsonValue>;
      if (w.kind === "update") sync.write("job_repair", w.id, job.company_id, values);
      else if (w.id) sync.write("job_repair", w.id, job.company_id, values);
      else sync.insert("job_repair", job.company_id, values);
    }
    sync.write("job", job.id, job.company_id, { fee_cents: fee });
  });
}

/** Add Additional Repair. */
export function addRepair(job: Job, repair: RepairValues) {
  const { writes, fee_cents } = addRepairWrites(job, rowsOf(job), repair);
  apply(job, writes, fee_cents);
}

/** Removes one repair (soft delete, so it syncs). */
export function removeRepair(job: Job, id: string) {
  const { writes, fee_cents } = removeRepairWrites(job, rowsOf(job), id, new Date().toISOString());
  if (writes.length) apply(job, writes, fee_cents);
}
