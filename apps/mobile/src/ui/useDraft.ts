import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { DRAFT_SAVE_DELAY_MS, draftChanges } from "@leakbook/core";
import { dropDraft, loadDraft, saveDraft, sweepDrafts } from "../lib/drafts";
import { getServices } from "../lib/services";
import { useSession } from "../state/session";

// Drafts (owner, 2026-10-27: "Fix the draft text"). Typed text in a form is kept on the phone as
// you type, when you leave the app, and put back when the form opens again, until it is saved,
// sent or discarded ("Discard Changes" clears it). Words and expiry: core drafts.ts.

export interface DraftHandle {
  /** A draft was put back into the form: show the note (DraftNote). */
  restored: boolean;
  /** Discard Draft: the form goes back to how it opened and the draft is removed. */
  discard: () => void;
  /**
   * Saved, sent or discarded: the draft is removed, and what the form holds now counts as its
   * starting point, so only typing after this is kept again.
   */
  clear: () => void;
}

/**
 * Keeps `fields` (typed text by name; only strings) as the draft for `form` and `id` (the record
 * being edited, "new" for a form that makes one). `restore` puts back the fields a draft holds
 * that differ from the form's: set your state from them. Pass `ready` false while the form's
 * own starting values are still loading. Call `clear` after a save, and pass the handle to
 * useDiscardChanges / useUnsavedChanges so Discard Changes clears it.
 */
export function useDraft({
  form,
  id = "new",
  fields,
  restore,
  ready = true,
}: {
  form: string;
  id?: string;
  fields: Record<string, string>;
  restore: (changes: Record<string, string>) => void;
  ready?: boolean;
}): DraftHandle {
  const userId = useSession().user?.id ?? null;
  const [restored, setRestored] = useState(false);
  const latest = useRef(fields);
  const apply = useRef(restore);
  // The newest text and setter, for the timers and the app-state listener.
  useEffect(() => {
    latest.current = fields;
    apply.current = restore;
  });
  // How the form opened, to tell typing from the starting values, and to undo a restore.
  const opened = useRef<Record<string, string> | null>(null);
  const before = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const keep = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!userId || !opened.current) return;
    const { kv } = getServices();
    const now = latest.current;
    const same = Object.keys(now).every((k) => now[k] === opened.current![k]);
    // Back to how it opened: nothing to keep.
    if (same) dropDraft(kv, userId, form, id);
    else saveDraft(kv, userId, form, id, now, Date.now());
  }, [userId, form, id]);

  // Opened: note the starting values and put a draft back (once).
  useEffect(() => {
    if (!ready || !userId || opened.current) return;
    const { kv } = getServices();
    sweepDrafts(kv, Date.now());
    opened.current = { ...latest.current };
    const draft = loadDraft(kv, userId, form, id, Date.now());
    if (!draft) return;
    const changes = draftChanges(latest.current, draft);
    if (Object.keys(changes).length === 0) return;
    before.current = Object.fromEntries(Object.keys(changes).map((k) => [k, latest.current[k]!]));
    apply.current(changes);
    setRestored(true);
  }, [ready, userId, form, id]);

  // Typing: kept a moment after the last change.
  const signature = JSON.stringify(fields);
  useEffect(() => {
    if (!opened.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(keep, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [signature, keep]);

  // The app going to the background (or the screen closing) keeps it at once: the phone may
  // end the app there.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") keep();
    });
    return () => {
      sub.remove();
      if (timer.current !== undefined) keep();
    };
  }, [keep]);

  const discard = useCallback(() => {
    apply.current(before.current);
    before.current = {};
    clearTimeout(timer.current);
    timer.current = undefined;
    if (userId) dropDraft(getServices().kv, userId, form, id);
    setRestored(false);
  }, [userId, form, id]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    opened.current = { ...latest.current };
    if (userId) dropDraft(getServices().kv, userId, form, id);
    setRestored(false);
  }, [userId, form, id]);

  return { restored, discard, clear };
}
