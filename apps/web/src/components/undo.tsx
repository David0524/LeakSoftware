"use client";

import { useEffect, useState } from "react";
import { createAutosave, createUndoTimer, type AutosaveStatus } from "@/lib/autosave";
import { buttonClass, cx } from "./ui";

/**
 * Undo after Mark Remaining (owner, 2026-10-20): the five-second window in the place of the
 * button. Leaving the screen while it's open runs what was waiting, if anything.
 */
export function useUndoWindow() {
  const [open, setOpen] = useState(false);
  const [timer] = useState(() => createUndoTimer(setOpen));
  useEffect(() => () => timer.flush(), [timer]);
  return { open, start: timer.start, cancel: timer.cancel };
}

/** "Marked N" in secondary text and an Undo pill, where the button was. Not a toast. */
export function UndoNotice({
  text,
  onUndo,
  pending = false,
  label,
}: {
  text: string;
  onUndo: () => void;
  pending?: boolean;
  /** Undo's spoken name when several are on screen, e.g. "Undo Marked 6: Service". */
  label?: string;
}) {
  return (
    <div role="status" className="flex min-h-11 items-center gap-3">
      <span className="text-[0.9375rem] text-text-muted">{text}</span>
      <button
        type="button"
        disabled={pending}
        aria-label={label}
        onClick={onUndo}
        className={buttonClass("secondary", "min-h-11 px-5")}
      >
        {pending ? "Undoing…" : "Undo"}
      </button>
    </div>
  );
}

/**
 * Typed text that saves by itself (owner, 2026-10-20): call `change` as it's typed and `flush`
 * when the field is left; leaving the screen saves too. `save` returns an error, or null.
 */
export function useAutosave(initial: string, save: (value: string) => Promise<string | null>) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [saver] = useState(() => createAutosave({ initial, save, onStatus: setStatus }));
  useEffect(() => {
    saver.setSave(save);
  });
  useEffect(() => () => void saver.flush(), [saver]);
  return {
    status,
    change: saver.change,
    flush: saver.flush,
    pause: saver.pause,
    reset: saver.reset,
  };
}

/** A short "Saved" in secondary text after each save, or what went wrong. */
export function SavedNote({ status, className }: { status: AutosaveStatus; className?: string }) {
  return (
    <span aria-live="polite" className={cx("text-[0.9375rem]", className)}>
      {typeof status === "object" ? (
        <span role="alert" className="text-status-fail">
          {status.error}
        </span>
      ) : status === "saving" ? (
        <span className="text-text-muted">Saving…</span>
      ) : status === "saved" ? (
        <span className="text-text-muted">Saved</span>
      ) : null}
    </span>
  );
}
