// Discard changes, everywhere (owner, 2026-10-20: "should apply everywhere"): every way out of
// an editor with unsaved changes asks first, once. This is the bookkeeping, free of React so
// it's tested; ui/discard.ts wires it to navigation.

export type LeaveDecision = "ask" | "leave" | "skip";

/**
 * Decides what one attempt to leave a screen does. Several editors on a screen each hear the
 * same attempt (the same action object): only the first answers. A screen leaving by its own
 * code (after Save, or Discard Changes) goes without asking.
 */
export function createLeaveDecider() {
  const answered = new WeakSet<object>();
  const leaving = new Set<string>();
  return {
    decide(action: object, screen: string): LeaveDecision {
      if (answered.has(action)) return "skip";
      answered.add(action);
      return leaving.has(screen) ? "leave" : "ask";
    },
    /** Runs `go` (router.back after a save) with this screen allowed to close. */
    leave(screen: string, go: () => void) {
      leaving.add(screen);
      try {
        go();
      } finally {
        leaving.delete(screen);
      }
    },
  };
}

/** Whether a form differs from what it started with (trimmed text, so a space isn't a change). */
export function formChanged(
  initial: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);
  for (const k of keys)
    if (JSON.stringify(norm(initial[k]) ?? null) !== JSON.stringify(norm(current[k]) ?? null))
      return true;
  return false;
}
