import { useEffect, useState } from "react";
import { createAutosave } from "../lib/autosave";

/** Holds the latest save function between renders. */
class Latest<T> {
  constructor(private value: T) {}
  get = () => this.value;
  set = (value: T) => {
    this.value = value;
  };
}

/**
 * A text field that saves by itself (owner, 2026-10-20: one-handed use, item 4): one second
 * after typing stops, when the field loses focus, and when the screen is left. `saved` is
 * the value on the phone now; `save` writes through the sync layer. `justSaved` is true after
 * each save until typing starts again, for a short "Saved" in secondary text.
 */
export function useAutosaveText(saved: string, save: (value: string) => void) {
  const [text, setText] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // One saver per field; it remembers what it saved and calls the latest `save`.
  const [box] = useState(() => new Latest(save));
  useEffect(() => box.set(save));
  const [auto] = useState(() =>
    createAutosave<string>({
      initial: saved,
      save: (v) => {
        box.get()(v);
        setJustSaved(true);
      },
    }),
  );
  // Leaving the screen saves what's waiting (leaving often doesn't blur the field).
  useEffect(() => () => void auto.flush(), [auto]);
  return {
    value: text ?? saved,
    onChangeText: (v: string) => {
      setText(v);
      setJustSaved(false);
      auto.change(v);
    },
    onBlur: () => {
      auto.flush();
      setText(null);
    },
    justSaved,
  };
}
