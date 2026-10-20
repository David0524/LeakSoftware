// Typed text saves by itself (owner, 2026-10-20: one-handed use, item 4): one second after
// typing stops, and when the field or screen is left. No Save button.

export const AUTOSAVE_DELAY_MS = 1000;

export type AutosaveStatus = "idle" | "saving" | "saved" | { error: string };

export interface Autosave {
  /** The field's text changed: save it once typing has stopped for the delay. */
  change(value: string): void;
  /** Save now if anything is waiting (the field or screen was left). */
  flush(): Promise<void>;
  /** Stop the timer without saving. */
  cancel(): void;
  /** Use a new save function from now on (a component's latest props). */
  setSave(save: (value: string) => Promise<string | null | undefined>): void;
  /**
   * Stop saving: drop what's waiting and ignore changes until `reset`. For text about to be
   * replaced on the server (Write the Draft Again), so old text never overwrites the new.
   */
  pause(): void;
  /** Save again, from a new baseline when given (the replacement text now on screen). */
  reset(initial?: string): void;
}

/**
 * Debounced saving of one value. `save` returns an error message, or null when it worked;
 * a value equal to the last one saved isn't sent again.
 */
export function createAutosave({
  initial,
  save,
  onStatus,
  delay = AUTOSAVE_DELAY_MS,
}: {
  initial: string;
  save: (value: string) => Promise<string | null | undefined>;
  onStatus?: (status: AutosaveStatus) => void;
  delay?: number;
}): Autosave {
  let saved = initial;
  let waiting: string | null = null;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  async function flush() {
    stop();
    if (waiting === null || paused) return;
    const value = waiting;
    waiting = null;
    if (value === saved) return;
    onStatus?.("saving");
    let error: string | null | undefined;
    try {
      error = await save(value);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    // Replaced while it was saving: don't count it as the baseline.
    if (paused) {
      onStatus?.("idle");
      return;
    }
    if (error) {
      onStatus?.({ error });
      return;
    }
    saved = value;
    onStatus?.("saved");
  }
  return {
    change(value) {
      if (paused) return;
      waiting = value;
      stop();
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
    cancel() {
      stop();
      waiting = null;
    },
    setSave(next) {
      save = next;
    },
    pause() {
      stop();
      waiting = null;
      paused = true;
    },
    reset(next) {
      stop();
      waiting = null;
      paused = false;
      if (next !== undefined) saved = next;
    },
  };
}

// Undo after Mark Remaining (owner, 2026-10-20: one-handed use, item 5): the change is saved at
// once, and "Marked N" with Undo stays where the button was for five seconds. Anything waiting
// on the window runs when it closes without Undo, or when the screen is left sooner.

export const UNDO_WINDOW_MS = 5000;

export interface UndoTimer {
  /** Open the window; `onExpire` runs when it closes without Undo. */
  start(onExpire?: () => void): void;
  /** Undo: close the window and drop what was waiting. */
  cancel(): void;
  /** Close the window now and run what was waiting (the screen was left). */
  flush(): void;
  readonly open: boolean;
}

export function createUndoTimer(onChange: (open: boolean) => void, ms = UNDO_WINDOW_MS): UndoTimer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let expire: (() => void) | null = null;
  let open = false;
  const close = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (open) {
      open = false;
      onChange(false);
    }
  };
  const flush = () => {
    const run = expire;
    expire = null;
    close();
    run?.();
  };
  return {
    start(onExpire) {
      if (timer) clearTimeout(timer);
      expire = onExpire ?? null;
      open = true;
      onChange(true);
      timer = setTimeout(flush, ms);
    },
    cancel() {
      expire = null;
      close();
    },
    flush,
    get open() {
      return open;
    },
  };
}
