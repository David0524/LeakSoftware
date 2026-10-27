"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DISCARD_DRAFT_LABEL, DRAFT_NOTE, DRAFT_SAVE_DELAY_MS, draftChanges } from "@leakbook/core";
import {
  browserStorage,
  dropAllDrafts,
  dropDraft,
  keepsField,
  loadDraft,
  saveDraft,
  sweepDrafts,
} from "@/lib/drafts";
import { watchFormsIn } from "./discard-guard";

// Drafts (owner, 2026-10-27: "Fix the draft text"). Typed text in a form is kept in this
// browser as you type and put back when the same form opens again, until it is saved, or
// discarded. Wrap a form (or a sheet's fields) in <Draft form="…" id="…">. Fields that save by
// themselves (data-autosave) and passwords are never kept. Words and expiry: core drafts.ts.

type FieldEl = HTMLInputElement | HTMLTextAreaElement;

// Who is signed in: set by <DraftUser> in the office layout. Nothing is kept or restored
// until it is known.
let currentUser: string | null = null;
const listeners = new Set<() => void>();
function setUser(id: string | null) {
  if (id === currentUser) return;
  currentUser = id;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Mounted once in the office layout: names the person drafts belong to, clears old ones. */
export function DraftUser({ userId }: { userId: string }) {
  useEffect(() => {
    setUser(userId);
    sweepDrafts(browserStorage(), Date.now());
    return () => setUser(null);
  }, [userId]);
  return null;
}

/** Sign-out: nothing typed stays in this browser. */
export function forgetAllDrafts() {
  dropAllDrafts(browserStorage());
}

/** Drafts on screen by `form:id`, so a send that clears fields from code can forget its draft. */
const onScreen = new Map<string, () => void>();

/**
 * A form that clears its own fields after a send (state, not a reset event) calls this: its
 * draft goes, and any "Draft restored" note with it.
 */
export function forgetDraft(form: string, id = "new") {
  if (currentUser) dropDraft(browserStorage(), currentUser, form, id);
  onScreen.get(`${form}:${id}`)?.();
}

/** The typed fields under an element, by name (or id). */
function fieldEls(root: Element): Map<string, FieldEl> {
  const out = new Map<string, FieldEl>();
  // A field with neither a name nor an id can't be found again, so it isn't kept.
  root.querySelectorAll<FieldEl>("input, textarea").forEach((el) => {
    const keeps = keepsField({
      type: el.type,
      name: el.name,
      readOnly: el.readOnly,
      disabled: el.disabled,
      autocomplete: el.autocomplete,
      closest: (selector: string) => el.closest(selector),
    });
    if (keeps && (el.name || el.id)) out.set(el.name || el.id, el);
  });
  return out;
}

/** Sets a field the way typing does, so React-controlled fields and listeners notice. */
function setTyped(el: FieldEl, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** What a restore replaced, so Discard Draft can put it back. */
const before = new WeakMap<Element, Record<string, string>>();

/** Puts the text back that the draft replaced, and forgets the draft. Returns whether it did. */
export function discardRestored(root: Element, user: string, form: string, id: string): boolean {
  const old = before.get(root);
  dropDraft(browserStorage(), user, form, id);
  before.delete(root);
  if (!old) return false;
  const els = fieldEls(root);
  for (const [name, value] of Object.entries(old)) {
    const el = els.get(name);
    if (el) setTyped(el, value);
  }
  return true;
}

/**
 * Keeps the typed text of everything inside as a draft for `form` (and `id`: the record being
 * edited, "new" when the form makes one). Lays out as nothing (display: contents).
 */
export function Draft({
  form,
  id = "new",
  children,
}: {
  form: string;
  id?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const user = useSyncExternalStore(
    subscribe,
    () => currentUser,
    () => null,
  );
  const [restored, setRestored] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const applying = useRef(false);

  const read = useCallback(() => {
    const out: Record<string, string> = {};
    if (root.current) for (const [name, el] of fieldEls(root.current)) out[name] = el.value;
    return out;
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || !user) return;
    const storage = browserStorage();
    const keep = () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      saveDraft(storage, user, form, id, read(), Date.now());
    };
    const onInput = () => {
      if (applying.current) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(keep, DRAFT_SAVE_DELAY_MS);
    };
    // Saved on its way out (a closed tab, the app backgrounded): at once, not after the delay.
    const flush = () => {
      if (timer.current !== undefined) keep();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    // A save that worked resets the form (SettingsForm): nothing left to keep.
    const onReset = () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      dropDraft(storage, user, form, id);
      before.delete(el);
      setRestored(false);
    };

    // Put the text back after the page (or a sheet) has settled its own starting values, so the
    // restored text counts as unsaved to "Discard changes?".
    const restore = window.setTimeout(() => {
      const draft = loadDraft(storage, user, form, id, Date.now());
      if (!draft) return;
      const els = fieldEls(el);
      const current: Record<string, string> = {};
      for (const [name, f] of els) current[name] = f.value;
      const changes = draftChanges(current, draft);
      if (Object.keys(changes).length === 0) return;
      before.set(
        el,
        Object.fromEntries(Object.keys(changes).map((name) => [name, current[name] ?? ""])),
      );
      watchFormsIn(el);
      applying.current = true;
      for (const [name, value] of Object.entries(changes)) {
        const f = els.get(name);
        if (f) setTyped(f, value);
      }
      applying.current = false;
      setRestored(true);
    }, 80);

    const slot = `${form}:${id}`;
    onScreen.set(slot, onReset);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onInput);
    el.addEventListener("reset", onReset);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(restore);
      if (onScreen.get(slot) === onReset) onScreen.delete(slot);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onInput);
      el.removeEventListener("reset", onReset);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      // Taken off the page while the app stays open: it was saved, or its changes discarded
      // (leaving asks first), so the draft goes. A strict-mode re-run keeps the element.
      window.setTimeout(() => {
        if (!el.isConnected) dropDraft(storage, user, form, id);
      }, 0);
    };
  }, [user, form, id, read]);

  return (
    <div ref={root} data-draft={`${form}:${id}`} className="contents">
      {restored && user ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-surface py-1 pr-1 pl-4 text-[0.9375rem] text-text-muted"
        >
          <span>{DRAFT_NOTE}</span>
          <button
            type="button"
            onClick={() => {
              if (root.current) discardRestored(root.current, user, form, id);
              setRestored(false);
            }}
            className="min-h-11 rounded-full px-3 font-semibold text-link"
          >
            {DISCARD_DRAFT_LABEL}
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
