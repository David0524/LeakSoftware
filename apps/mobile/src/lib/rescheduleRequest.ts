// Reschedule on a skipped visit's card opens the job's schedule sheet (Move… with Suggest Times),
// which belongs to JobSchedule: the card asks, it answers (owner, 2026-11-16).

type Listener = (jobId: string) => void;
const listeners = new Set<Listener>();

/** Ask the job's schedule section to open its Move sheet. */
export function requestReschedule(jobId: string) {
  for (const l of listeners) l(jobId);
}

/** JobSchedule listens; returns how to stop. */
export function onRescheduleRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
