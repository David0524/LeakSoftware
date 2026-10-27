// Drafts (owner, 2026-10-27: "Fix the draft text"): typed text in a form that isn't saved yet is
// kept on the device and put back when the same form is opened again, until it is saved, sent,
// or discarded. Only text, never files, photos or passwords; kept per signed-in person; gone
// after seven days and at sign-out. The same words, expiry and limits on the website,
// iPhone (SundeckCore/Drafts.swift) and Android.

/** The note under a form whose draft was put back, and its button. */
export const DRAFT_NOTE = "Draft restored";
export const DISCARD_DRAFT_LABEL = "Discard Draft";

/** A draft older than this is dropped, not restored. */
export const DRAFT_DAYS = 7;
export const DRAFT_TTL_MS = DRAFT_DAYS * 24 * 60 * 60 * 1000;

/** Typing is kept this long after the last keystroke (and at once when the app goes away). */
export const DRAFT_SAVE_DELAY_MS = 400;

/** Limits, so a draft stays small: fields per form, characters per field. */
export const DRAFT_MAX_FIELDS = 40;
export const DRAFT_MAX_CHARS = 20_000;

/** Every stored draft's key starts with this. */
export const DRAFT_PREFIX = "draft:";

/** A stored draft: when it was last typed, and each field's text by name. */
export interface DraftRecord {
  v: 1;
  at: number;
  fields: Record<string, string>;
}

/**
 * Where a form's draft lives: per person, per form, per record ("new" for a form that makes
 * one). A colon in a part can't tell two keys apart, so colons are replaced.
 */
export function draftKey(userId: string, form: string, id = "new"): string {
  const part = (s: string) => s.replace(/:/g, "_");
  return `${DRAFT_PREFIX}${part(userId)}:${part(form)}:${part(id || "new")}`;
}

/** The fields worth keeping: text only, within the limits (extra characters and fields drop). */
export function keepableDraft(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (Object.keys(out).length >= DRAFT_MAX_FIELDS) break;
    if (typeof value !== "string" || !name) continue;
    out[name] = value.length > DRAFT_MAX_CHARS ? value.slice(0, DRAFT_MAX_CHARS) : value;
  }
  return out;
}

/** Whether any field holds something typed (a draft of only blanks isn't kept). */
export function hasDraftText(fields: Record<string, string>): boolean {
  return Object.values(fields).some((v) => v.trim() !== "");
}

/** What to store for these fields at time `now` (ms), or null when there is nothing to keep. */
export function draftRecord(fields: Record<string, unknown>, now: number): DraftRecord | null {
  const kept = keepableDraft(fields);
  return hasDraftText(kept) ? { v: 1, at: now, fields: kept } : null;
}

/** Whether a draft saved at `savedAt` (ms) has outlived its seven days. */
export function draftExpired(savedAt: number, now: number): boolean {
  return !(Number.isFinite(savedAt) && now - savedAt < DRAFT_TTL_MS && savedAt <= now + 60_000);
}

/** A stored draft's fields, or null when it is missing, damaged, expired or empty. */
export function readDraft(
  raw: string | null | undefined,
  now: number,
): Record<string, string> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const rec = parsed as { v?: unknown; at?: unknown; fields?: unknown };
  if (rec.v !== 1 || typeof rec.at !== "number" || draftExpired(rec.at, now)) return null;
  if (typeof rec.fields !== "object" || rec.fields === null) return null;
  const fields = keepableDraft(rec.fields as Record<string, unknown>);
  return hasDraftText(fields) ? fields : null;
}

/**
 * The fields to put back: those the draft holds that differ from what the form shows now. Empty
 * when the draft adds nothing (so no "Draft restored" note for text that is already there).
 */
export function draftChanges(
  current: Record<string, string>,
  draft: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(draft)) {
    if (name in current && current[name] !== value) out[name] = value;
  }
  return out;
}
