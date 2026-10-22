import { durationLabel } from "./routing";

// Progress cues (owner, 2026-10-22, goal-gradient ideas; docs/design/2026-10-22-progress-cues.md):
// the day's ring on Today, and Mark Complete standing out once a checklist is all done.

/** One stop of the day, as the ring counts it. */
export interface ProgressStop {
  /** Done for the day (stopDone). */
  done: boolean;
  /** The time planned at the pool (jobMinutes). */
  durationMin: number;
  /** The drive into it, when known. */
  driveMin: number | null;
  /** The tech is there (started): its drive is behind them. */
  onSite?: boolean;
}

export type DayProgressState = "start" | "going" | "closing" | "all_done";

export interface DayProgress {
  state: DayProgressState;
  done: number;
  total: number;
  left: number;
  /** The ring's fill, 0 to 1. */
  fraction: number;
  /** Remaining stops' time at the pool plus the drives into them (not the drive home). */
  minutesLeft: number;
  /**
   * The summary line's words, or null at the start of the day, when the line keeps the plan
   * ("11 stops · 2 hr 5 min driving"). "4 of 11 stops", "2 left · about 1 hr", "All 11 done".
   */
  text: string | null;
  /** What the ring says to VoiceOver and TalkBack. */
  spoken: string;
}

/** The last few stops count down instead of up (owner: "its last few steps should feel bigger"). */
export const CLOSING_STOPS = 3;

/** "about 1 hr", "about 35 min": nearest 5 minutes under an hour, else nearest 15. */
export function aboutLabel(min: number): string {
  const m = Math.max(0, min);
  const step = m < 60 ? 5 : 15;
  return `about ${durationLabel(Math.max(5, Math.round(m / step) * step))}`;
}

/** The ring and the words beside it on Today's summary line. */
export function dayProgress(stops: ProgressStop[]): DayProgress {
  const total = stops.length;
  const done = stops.filter((s) => s.done).length;
  const left = total - done;
  const minutesLeft = stops
    .filter((s) => !s.done)
    .reduce((sum, s) => sum + s.durationMin + (s.onSite ? 0 : (s.driveMin ?? 0)), 0);
  const fraction = total ? done / total : 0;
  const base = { done, total, left, fraction, minutesLeft };
  if (total > 0 && left === 0)
    return { ...base, state: "all_done", text: `All ${total} done`, spoken: `All ${total} done` };
  const spokenCount = `${done} of ${total} ${total === 1 ? "stop" : "stops"} done`;
  if (done === 0) return { ...base, state: "start", text: null, spoken: spokenCount };
  if (left <= CLOSING_STOPS) {
    const time = minutesLeft > 0 ? aboutLabel(minutesLeft) : null;
    return {
      ...base,
      state: "closing",
      text: [`${left} left`, time].filter(Boolean).join(" · "),
      spoken: [`${left} ${left === 1 ? "stop" : "stops"} left`, time].filter(Boolean).join(", "),
    };
  }
  return { ...base, state: "going", text: `${done} of ${total} stops`, spoken: spokenCount };
}

/** A checklist with nothing left to do, so Mark Complete is the last thing. */
export function checklistReady(done: number, total: number): boolean {
  return total > 0 && done >= total;
}

/** The line over Mark Complete once everything else is done. */
export const COMPLETE_READY_LINE = "Everything’s checked. Mark it complete.";
