import { currentVerdict, type ChecklistItemResult } from "@leakbook/core";

// Undo after Mark Remaining (owner, 2026-10-20: one-handed use, item 5): the marks are saved
// at once, and "Marked N" with Undo sits where the button was for five seconds (not a toast).

export const UNDO_WINDOW_MS = 5000;

export interface UndoWindow {
  /** Open the window (again, if it was open). */
  start(): void;
  /** Close it now (Undo was tapped, or the screen was left). */
  close(): void;
  readonly open: boolean;
}

export function createUndoWindow(
  onChange: (open: boolean) => void,
  ms = UNDO_WINDOW_MS,
): UndoWindow {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let open = false;
  const close = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!open) return;
    open = false;
    onChange(false);
  };
  return {
    start() {
      if (timer) clearTimeout(timer);
      if (!open) {
        open = true;
        onChange(true);
      }
      timer = setTimeout(close, ms);
    },
    close,
    get open() {
      return open;
    },
  };
}

/**
 * The items Mark Remaining's Undo clears: the ones it marked that still have its answer. An
 * item answered again meanwhile keeps the newer answer.
 */
export function marksToUndo(
  marked: readonly string[],
  results: ReadonlyMap<string, Pick<ChecklistItemResult, "status" | "outcome">>,
): string[] {
  return marked.filter((id) => currentVerdict(results.get(id)) === "ok");
}
