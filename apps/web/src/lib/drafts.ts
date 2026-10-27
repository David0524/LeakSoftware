import {
  DRAFT_PREFIX,
  draftChanges,
  draftRecord,
  draftKey,
  readDraft,
  type DraftRecord,
} from "@leakbook/core";

// Drafts on the website (owner, 2026-10-27): the browser's localStorage, keyed
// draft:<user>:<form>:<id>. Every call is safe to make with storage blocked or full (private
// windows, cleared site data): it just keeps nothing. Words, expiry and limits: core drafts.ts.

/** The part of Storage used here. */
export interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's storage, or undefined where it is blocked. */
export function browserStorage(): DraftStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** A saved draft's fields (an expired or damaged one is removed), or null. */
export function loadDraft(
  storage: DraftStorage | undefined,
  user: string,
  form: string,
  id: string,
  now: number,
): Record<string, string> | null {
  if (!storage) return null;
  const key = draftKey(user, form, id);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const fields = readDraft(raw, now);
    if (!fields) storage.removeItem(key);
    return fields;
  } catch {
    return null;
  }
}

/** Keeps these fields as the form's draft; nothing typed (only blanks) removes it. */
export function saveDraft(
  storage: DraftStorage | undefined,
  user: string,
  form: string,
  id: string,
  fields: Record<string, string>,
  now: number,
): void {
  if (!storage) return;
  const key = draftKey(user, form, id);
  try {
    const record: DraftRecord | null = draftRecord(fields, now);
    if (record) storage.setItem(key, JSON.stringify(record));
    else storage.removeItem(key);
  } catch {
    // Full or blocked: the draft isn't kept.
  }
}

/** Removes the form's draft (saved, sent or discarded). */
export function dropDraft(
  storage: DraftStorage | undefined,
  user: string,
  form: string,
  id: string,
): void {
  try {
    storage?.removeItem(draftKey(user, form, id));
  } catch {
    // Nothing kept to remove.
  }
}

/** Every draft in this browser (sign-out), or only those of one person. */
export function dropAllDrafts(storage: DraftStorage | undefined, user?: string): void {
  if (!storage) return;
  try {
    const own = user === undefined ? DRAFT_PREFIX : `${DRAFT_PREFIX}${user.replace(/:/g, "_")}:`;
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(own)) storage.removeItem(key);
    }
  } catch {
    // Nothing kept to clear.
  }
}

/** Removes drafts past their seven days (run when the office opens). */
export function sweepDrafts(storage: DraftStorage | undefined, now: number): void {
  if (!storage) return;
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(DRAFT_PREFIX) && readDraft(storage.getItem(key), now) === null)
        storage.removeItem(key);
    }
  } catch {
    // Nothing kept to sweep.
  }
}

/** The fields of a form that are typed text and may be kept: never a password or a code. */
export function keepsField(el: {
  type: string;
  name: string;
  readOnly: boolean;
  disabled: boolean;
  autocomplete: string;
  closest(selector: string): unknown;
}): boolean {
  const typed = ["text", "textarea", "email", "tel", "url", "search", "number"];
  if (!typed.includes(el.type) || el.readOnly || el.disabled) return false;
  if (/pass|token|secret|card|cvc|otp/i.test(el.name)) return false;
  if (/^(cc-|one-time-code|new-password|current-password)/.test(el.autocomplete)) return false;
  return !el.closest("[data-autosave], [data-no-draft]");
}

export { draftChanges };
