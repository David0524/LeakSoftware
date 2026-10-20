// Typed text saves by itself (owner, 2026-10-20: one-handed use, item 4): one second after
// typing stops, and when the field or screen is left. No Save Text button. The same rule as
// the website's lib/autosave.ts; on the phone a save is a local write, so it never fails.

export const AUTOSAVE_DELAY_MS = 1000;

export interface Autosave<T> {
  /** The value changed: save it once typing has stopped for the delay. */
  change(value: T): void;
  /** Save now if anything is waiting (the field or screen was left). Returns whether it saved. */
  flush(): boolean;
  /** Stop the timer without saving. */
  cancel(): void;
}

/** Debounced saving of one value; a value equal to the last one saved isn't saved again. */
export function createAutosave<T>({
  initial,
  save,
  same = (a, b) => a === b,
  delay = AUTOSAVE_DELAY_MS,
}: {
  initial: T;
  save: (value: T) => void;
  same?: (a: T, b: T) => boolean;
  delay?: number;
}): Autosave<T> {
  let saved = initial;
  let waiting: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  function flush(): boolean {
    stop();
    if (!waiting) return false;
    const { value } = waiting;
    waiting = null;
    if (same(value, saved)) return false;
    save(value);
    saved = value;
    return true;
  }
  return {
    change(value) {
      waiting = { value };
      stop();
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      stop();
      waiting = null;
    },
  };
}
