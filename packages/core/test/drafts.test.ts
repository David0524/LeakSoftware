import { describe, expect, it } from "vitest";
import {
  DISCARD_DRAFT_LABEL,
  DRAFT_DAYS,
  DRAFT_MAX_CHARS,
  DRAFT_MAX_FIELDS,
  DRAFT_NOTE,
  DRAFT_TTL_MS,
  draftChanges,
  draftExpired,
  draftKey,
  draftRecord,
  keepableDraft,
  readDraft,
} from "../src";

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("drafts (owner, 2026-10-27)", () => {
  it("says it in the same words everywhere", () => {
    expect(DRAFT_NOTE).toBe("Draft restored");
    expect(DISCARD_DRAFT_LABEL).toBe("Discard Draft");
    expect(DRAFT_DAYS).toBe(7);
    expect(DRAFT_TTL_MS).toBe(7 * DAY);
  });

  it("keys a draft by person, form and record", () => {
    expect(draftKey("u1", "finding", "f9")).toBe("draft:u1:finding:f9");
    expect(draftKey("u1", "new-job")).toBe("draft:u1:new-job:new");
    expect(draftKey("a:b", "x:y", "")).toBe("draft:a_b:x_y:new");
  });

  it("keeps text only, within the limits", () => {
    expect(keepableDraft({ a: "x", b: 3, c: null, "": "no" })).toEqual({ a: "x" });
    expect(keepableDraft({ a: "x".repeat(DRAFT_MAX_CHARS + 5) }).a).toHaveLength(DRAFT_MAX_CHARS);
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, "t"]));
    expect(Object.keys(keepableDraft(many))).toHaveLength(DRAFT_MAX_FIELDS);
  });

  it("stores nothing for blanks", () => {
    expect(draftRecord({ a: "", b: "  " }, NOW)).toBeNull();
    expect(draftRecord({ a: "Leak", b: "" }, NOW)).toEqual({
      v: 1,
      at: NOW,
      fields: { a: "Leak", b: "" },
    });
  });

  it("expires after seven days", () => {
    expect(draftExpired(NOW - 6 * DAY, NOW)).toBe(false);
    expect(draftExpired(NOW - 7 * DAY, NOW)).toBe(true);
    expect(draftExpired(Number.NaN, NOW)).toBe(true);
    expect(draftExpired(NOW + DAY, NOW)).toBe(true);
  });

  it("reads back what was stored, and nothing that is damaged or old", () => {
    const raw = JSON.stringify(draftRecord({ notes: "Check the skimmer" }, NOW));
    expect(readDraft(raw, NOW + DAY)).toEqual({ notes: "Check the skimmer" });
    expect(readDraft(raw, NOW + 8 * DAY)).toBeNull();
    expect(readDraft("not json", NOW)).toBeNull();
    expect(readDraft(null, NOW)).toBeNull();
    expect(readDraft(JSON.stringify({ v: 2, at: NOW, fields: { a: "x" } }), NOW)).toBeNull();
    expect(readDraft(JSON.stringify({ v: 1, at: NOW, fields: { a: " " } }), NOW)).toBeNull();
    expect(readDraft(JSON.stringify({ v: 1, at: NOW, fields: { a: 4, b: "ok" } }), NOW)).toEqual({
      b: "ok",
    });
  });

  it("restores only fields that differ and still exist", () => {
    expect(draftChanges({ a: "x", b: "" }, { a: "x", b: "typed", gone: "q" })).toEqual({
      b: "typed",
    });
    expect(draftChanges({ a: "x" }, { a: "x" })).toEqual({});
  });
});
