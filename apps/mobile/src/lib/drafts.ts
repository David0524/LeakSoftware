import { DRAFT_PREFIX, draftKey, draftRecord, readDraft } from "@leakbook/core";
import type { KeyValue } from "./database";

// Drafts on Android (owner, 2026-10-27: "Fix the draft text"): the phone's app_kv store, one row
// per form (draft:<user>:<form>:<id>) and a list of those keys, so sign-out and the seven-day
// sweep can find them. Words, expiry and limits: core drafts.ts. Every call is safe to make
// with the store unavailable: it just keeps nothing.

/** The list of stored draft keys. (Not itself a draft: no "draft:" prefix.) */
export const DRAFT_INDEX_KEY = "drafts:index";

function indexOf(kv: KeyValue): string[] {
  try {
    const raw = kv.get(DRAFT_INDEX_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((k): k is string => typeof k === "string" && k.startsWith(DRAFT_PREFIX))
      : [];
  } catch {
    return [];
  }
}

function setIndex(kv: KeyValue, keys: string[]) {
  if (keys.length) kv.set(DRAFT_INDEX_KEY, JSON.stringify(keys));
  else kv.remove(DRAFT_INDEX_KEY);
}

/** A saved draft's fields (an expired or damaged one is removed), or null. */
export function loadDraft(
  kv: KeyValue,
  user: string,
  form: string,
  id: string,
  now: number,
): Record<string, string> | null {
  try {
    const key = draftKey(user, form, id);
    const raw = kv.get(key);
    if (raw === null) return null;
    const fields = readDraft(raw, now);
    if (!fields) dropDraft(kv, user, form, id);
    return fields;
  } catch {
    return null;
  }
}

/** Keeps these fields as the form's draft; nothing typed (only blanks) removes it. */
export function saveDraft(
  kv: KeyValue,
  user: string,
  form: string,
  id: string,
  fields: Record<string, string>,
  now: number,
): void {
  try {
    const record = draftRecord(fields, now);
    if (!record) return dropDraft(kv, user, form, id);
    const key = draftKey(user, form, id);
    kv.set(key, JSON.stringify(record));
    const keys = indexOf(kv);
    if (!keys.includes(key)) setIndex(kv, [...keys, key]);
  } catch {
    // Full or unavailable: the draft isn't kept.
  }
}

/** Removes the form's draft (saved, sent or discarded). */
export function dropDraft(kv: KeyValue, user: string, form: string, id: string): void {
  try {
    const key = draftKey(user, form, id);
    kv.remove(key);
    const keys = indexOf(kv);
    if (keys.includes(key))
      setIndex(
        kv,
        keys.filter((k) => k !== key),
      );
  } catch {
    // Nothing kept to remove.
  }
}

/** Every draft on this phone (sign-out). */
export function dropAllDrafts(kv: KeyValue): void {
  try {
    for (const key of indexOf(kv)) kv.remove(key);
    kv.remove(DRAFT_INDEX_KEY);
  } catch {
    // Nothing kept to clear.
  }
}

/** Removes drafts past their seven days (run when the app opens). */
export function sweepDrafts(kv: KeyValue, now: number): void {
  try {
    const keys = indexOf(kv);
    const live = keys.filter((key) => {
      if (readDraft(kv.get(key), now)) return true;
      kv.remove(key);
      return false;
    });
    if (live.length !== keys.length) setIndex(kv, live);
  } catch {
    // Nothing kept to sweep.
  }
}
