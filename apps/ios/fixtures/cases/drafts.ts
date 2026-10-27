import {
  DISCARD_DRAFT_LABEL,
  DRAFT_DAYS,
  DRAFT_MAX_CHARS,
  DRAFT_MAX_FIELDS,
  DRAFT_NOTE,
  DRAFT_PREFIX,
  DRAFT_SAVE_DELAY_MS,
  DRAFT_TTL_MS,
  draftChanges,
  draftExpired,
  draftKey,
  draftRecord,
  keepableDraft,
  readDraft,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// drafts.ts (owner, 2026-10-27: "Fix the draft text").

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 24 * 60 * 60 * 1000;
const stored = JSON.stringify({ v: 1, at: NOW, fields: { notes: "Check the skimmer", job: "" } });

export const drafts: ModuleCases = {
  DRAFT_CONSTANTS: rule(
    () => ({
      note: DRAFT_NOTE,
      discard: DISCARD_DRAFT_LABEL,
      days: DRAFT_DAYS,
      ttlMs: DRAFT_TTL_MS,
      delayMs: DRAFT_SAVE_DELAY_MS,
      maxFields: DRAFT_MAX_FIELDS,
      maxChars: DRAFT_MAX_CHARS,
      prefix: DRAFT_PREFIX,
    }),
    [[]],
  ),
  draftKey: rule(
    (user: string, form: string, id?: string) => draftKey(user, form, id),
    [
      ["u1", "finding", "f9"],
      ["u1", "new-job"],
      ["a:b", "x:y", ""],
    ],
  ),
  keepableDraft: rule(
    (fields: Record<string, unknown>) => keepableDraft(fields),
    [[{ a: "x", b: 3, c: null, "": "no" }], [{ a: "x".repeat(DRAFT_MAX_CHARS + 5) }], [{}]],
  ),
  draftRecord: rule(
    (fields: Record<string, unknown>, now: number) => draftRecord(fields, now),
    [
      [{ a: "", b: "  " }, NOW],
      [{ a: "Leak", b: "" }, NOW],
    ],
  ),
  draftExpired: rule(
    (at: number, now: number) => draftExpired(at, now),
    [
      [NOW - 6 * DAY, NOW],
      [NOW - 7 * DAY, NOW],
      [NOW + DAY, NOW],
    ],
  ),
  readDraft: rule(
    (raw: string | null, now: number) => readDraft(raw, now),
    [
      [stored, NOW + DAY],
      [stored, NOW + 8 * DAY],
      ["not json", NOW],
      [null, NOW],
      [JSON.stringify({ v: 2, at: NOW, fields: { a: "x" } }), NOW],
      [JSON.stringify({ v: 1, at: NOW, fields: { a: " " } }), NOW],
      [JSON.stringify({ v: 1, at: NOW, fields: { a: 4, b: "ok" } }), NOW],
    ],
  ),
  draftChanges: rule(
    (current: Record<string, string>, draft: Record<string, string>) =>
      draftChanges(current, draft),
    [
      [
        { a: "x", b: "" },
        { a: "x", b: "typed", gone: "q" },
      ],
      [{ a: "x" }, { a: "x" }],
    ],
  ),
};
