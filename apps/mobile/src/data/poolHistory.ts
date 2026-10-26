import { useMemo } from "react";
import {
  lastOtherReading,
  lastVisitNote,
  readingHints,
  usualChemicalIds,
  type LastVisitNote,
  type ReadingKey,
} from "@leakbook/core";
import { useChemicalLog } from "./chemicals";
import { useRows } from "./hooks";

// What a pool's earlier visits tell this one (owner, 2026-10-26: "pre-fill what the app already
// knows"), read from this phone's rows: each reading's last value as a hint ("Last 7.6"), the
// chemicals the pool usually gets (first in Add Chemical), and last visit's notes. The rules are
// core prefill.ts, as the website's getPoolHistory (lib/data.ts) and the iPhone's PoolHistory.

export interface PoolHistory {
  /** "Last 7.6" by reading; none for a reading the pool has never had. */
  hints: Partial<Record<ReadingKey, string>>;
  /** Price book item ids, the pool's usual chemicals first. */
  usual: string[];
  note: LastVisitNote | null;
}

interface AdditionRow {
  property_id: string;
  job_id: string;
  price_book_item_id: string | null;
  added_at: string;
  deleted_at?: string | null;
}
interface JobRow {
  id: string;
  property_id: string | null;
  summary_notes?: string | null;
  scheduled_start?: string | null;
  completed_at?: string | null;
  deleted_at?: string | null;
}

/** The pool's history for the visit `jobId` (its own readings and notes are left out). */
export function usePoolHistory(
  companyId: string,
  propertyId: string,
  jobId: string,
  timeZone: string,
): PoolHistory {
  const log = useChemicalLog(companyId);
  const additions = useRows<AdditionRow>("chemical_addition", companyId);
  const jobs = useRows<JobRow>("job", companyId);
  return useMemo(() => {
    const readings = log.filter((r) => r.property_id === propertyId);
    return {
      hints: readingHints(lastOtherReading(readings, jobId)),
      usual: usualChemicalIds(
        additions.filter(
          (a) => a.property_id === propertyId && a.job_id !== jobId && !a.deleted_at,
        ),
      ),
      note: lastVisitNote({
        jobId,
        jobs: jobs
          .filter((j) => j.property_id === propertyId && !j.deleted_at && j.summary_notes?.trim())
          .map((j) => ({
            id: j.id,
            summary_notes: j.summary_notes,
            when: j.completed_at ?? j.scheduled_start,
          })),
        readings,
        timeZone,
      }),
    };
  }, [log, additions, jobs, propertyId, jobId, timeZone]);
}
