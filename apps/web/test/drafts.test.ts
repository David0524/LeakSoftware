import { describe, expect, it } from "vitest";
import {
  dropAllDrafts,
  dropDraft,
  keepsField,
  loadDraft,
  saveDraft,
  sweepDrafts,
  type DraftStorage,
} from "../src/lib/drafts";

// Drafts on the website (owner, 2026-10-27: "Fix the draft text").

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("draft storage", () => {
  it("keeps typed text and gives it back", () => {
    const s = memory();
    saveDraft(s, "u1", "finding", "f1", { description: "Crack at the skimmer" }, NOW);
    expect(loadDraft(s, "u1", "finding", "f1", NOW + 1000)).toEqual({
      description: "Crack at the skimmer",
    });
    expect(s.data.has("draft:u1:finding:f1")).toBe(true);
  });

  it("is per person and per record", () => {
    const s = memory();
    saveDraft(s, "u1", "finding", "f1", { description: "One" }, NOW);
    expect(loadDraft(s, "u2", "finding", "f1", NOW)).toBeNull();
    expect(loadDraft(s, "u1", "finding", "f2", NOW)).toBeNull();
  });

  it("drops a draft that is cleared to blanks, and one after seven days", () => {
    const s = memory();
    saveDraft(s, "u1", "notes", "j1", { notes: "Hello" }, NOW);
    saveDraft(s, "u1", "notes", "j1", { notes: "  " }, NOW);
    expect(s.data.size).toBe(0);
    saveDraft(s, "u1", "notes", "j1", { notes: "Hello" }, NOW);
    expect(loadDraft(s, "u1", "notes", "j1", NOW + 8 * DAY)).toBeNull();
    expect(s.data.size).toBe(0);
  });

  it("clears one draft, one person's, or all of them", () => {
    const s = memory();
    saveDraft(s, "u1", "a", "1", { x: "t" }, NOW);
    saveDraft(s, "u1", "b", "1", { x: "t" }, NOW);
    saveDraft(s, "u2", "a", "1", { x: "t" }, NOW);
    s.setItem("recent:u1", "keep");
    dropDraft(s, "u1", "a", "1");
    expect([...s.data.keys()].sort()).toEqual(["draft:u1:b:1", "draft:u2:a:1", "recent:u1"]);
    dropAllDrafts(s, "u1");
    expect([...s.data.keys()].sort()).toEqual(["draft:u2:a:1", "recent:u1"]);
    dropAllDrafts(s);
    expect([...s.data.keys()]).toEqual(["recent:u1"]);
  });

  it("sweeps expired and damaged drafts only", () => {
    const s = memory();
    saveDraft(s, "u1", "a", "1", { x: "old" }, NOW - 9 * DAY);
    saveDraft(s, "u1", "b", "1", { x: "new" }, NOW - DAY);
    s.setItem("draft:u1:c:1", "{broken");
    sweepDrafts(s, NOW);
    expect([...s.data.keys()]).toEqual(["draft:u1:b:1"]);
  });

  it("works with storage blocked", () => {
    const blocked: DraftStorage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveDraft(blocked, "u", "a", "1", { x: "t" }, NOW)).not.toThrow();
    expect(loadDraft(blocked, "u", "a", "1", NOW)).toBeNull();
    expect(() => dropDraft(blocked, "u", "a", "1")).not.toThrow();
    expect(loadDraft(undefined, "u", "a", "1", NOW)).toBeNull();
  });
});

describe("which fields are kept", () => {
  const field = (more: Partial<Parameters<typeof keepsField>[0]> = {}) => ({
    type: "text",
    name: "notes",
    readOnly: false,
    disabled: false,
    autocomplete: "",
    closest: () => null,
    ...more,
  });

  it("keeps typed text", () => {
    for (const type of ["text", "textarea", "email", "tel", "url", "number"])
      expect(keepsField(field({ type }))).toBe(true);
  });

  it("never keeps passwords, codes, files, choices or hidden values", () => {
    expect(keepsField(field({ type: "password" }))).toBe(false);
    expect(keepsField(field({ name: "newPassword" }))).toBe(false);
    expect(keepsField(field({ autocomplete: "one-time-code" }))).toBe(false);
    for (const type of ["hidden", "file", "checkbox", "radio", "date"])
      expect(keepsField(field({ type }))).toBe(false);
    expect(keepsField(field({ readOnly: true }))).toBe(false);
  });

  it("leaves out fields that save by themselves", () => {
    expect(keepsField(field({ closest: () => ({}) }))).toBe(false);
  });
});
