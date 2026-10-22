"use client";

import { createContext, use, useOptimistic, type ReactNode } from "react";
import type { JobStatus } from "@leakbook/core";
import { showBanner } from "./top-banner";
import { StatusBadge } from "./ui";

/*
 * Changes show at once, the way the phones do (owner, 2026-10-22: "make changes instantly, the
 * way the phones do (save first, sync after)"). The phones write to their own database first;
 * the website can't, so it shows the new state while the save is under way (React's
 * useOptimistic) and the page catches up when the server answers. A save that fails puts the
 * old state back by itself (the optimistic state ends with the save) and says why in the top
 * banner. docs/design/2026-10-22-instant-and-skeletons.md.
 */

type Statuses = ReadonlyMap<string, JobStatus>;
const NONE: Statuses = new Map();

interface Instant {
  statuses: Statuses;
  /** Call inside the save's transition: the new status shows until the save ends. */
  setStatus: (jobId: string, status: JobStatus) => void;
}

const InstantContext = createContext<Instant>({ statuses: NONE, setStatus: () => {} });

/** Once, around the office pages: a job's new status shows everywhere it appears at once. */
export function InstantProvider({ children }: { children: ReactNode }) {
  const [statuses, add] = useOptimistic(NONE, (m: Statuses, [id, s]: [string, JobStatus]) =>
    new Map(m).set(id, s),
  );
  return (
    <InstantContext value={{ statuses, setStatus: (id, s) => add([id, s]) }}>
      {children}
    </InstantContext>
  );
}

/** The job's status as it is about to be: a change under way, else what was saved. */
export function useJobStatus<T extends JobStatus | null>(jobId: string, saved: T): JobStatus | T {
  return use(InstantContext).statuses.get(jobId) ?? saved;
}

/** Shows a job's new status at once; call it inside the save's transition. */
export function useSetJobStatus() {
  return use(InstantContext).setStatus;
}

/** A job's status pill that changes the moment someone changes the status. */
export function LiveStatusBadge({ jobId, status }: { jobId: string; status: JobStatus }) {
  return <StatusBadge status={useJobStatus(jobId, status)} />;
}

/**
 * A save that didn't go through: the change is already put back; the top banner says why and
 * stays until it's put away. `action` offers a way on, such as Open Job.
 */
export function saveFailed(error: string, action?: { label: string; onAction: () => void }) {
  showBanner({ tone: "error", message: error, detail: CHANGED_BACK, action });
}

/** The banner's second line after a failed save. */
export const CHANGED_BACK = "Changed back. Nothing was saved.";
