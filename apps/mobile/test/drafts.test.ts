import { describe, expect, it } from "vitest";
import {
  DRAFT_INDEX_KEY,
  dropAllDrafts,
  dropDraft,
  loadDraft,
  saveDraft,
  sweepDrafts,
} from "../src/lib/drafts";
import type { KeyValue } from "../src/lib/database";

// Drafts on Android (owner, 2026-10-27: "Fix the draft text"): typed text kept in app_kv.

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("drafts in app_kv", () => {
  it("keeps typed text and restores it for the same form and record", () => {
    const kv = memory();
    saveDraft(kv, "u1", "finding", "f1", { title: "Crack", notes: "At the skimmer" }, NOW);
    expect(loadDraft(kv, "u1", "finding", "f1", NOW + 1000)).toEqual({
      title: "Crack",
      notes: "At the skimmer",
    });
    expect(loadDraft(kv, "u1", "finding", "f2", NOW)).toBeNull();
    expect(loadDraft(kv, "u2", "finding", "f1", NOW)).toBeNull();
    expect(JSON.parse(kv.data.get(DRAFT_INDEX_KEY)!)).toEqual(["draft:u1:finding:f1"]);
  });

  it("indexes a draft once, and removes it from the index with the draft", () => {
    const kv = memory();
    saveDraft(kv, "u1", "a", "1", { x: "one" }, NOW);
    saveDraft(kv, "u1", "a", "1", { x: "two" }, NOW);
    saveDraft(kv, "u1", "b", "1", { x: "t" }, NOW);
    expect(JSON.parse(kv.data.get(DRAFT_INDEX_KEY)!)).toEqual(["draft:u1:a:1", "draft:u1:b:1"]);
    dropDraft(kv, "u1", "a", "1");
    expect(loadDraft(kv, "u1", "a", "1", NOW)).toBeNull();
    expect(JSON.parse(kv.data.get(DRAFT_INDEX_KEY)!)).toEqual(["draft:u1:b:1"]);
  });

  it("removes a draft that is cleared to blanks", () => {
    const kv = memory();
    saveDraft(kv, "u1", "a", "1", { x: "typed" }, NOW);
    saveDraft(kv, "u1", "a", "1", { x: "" }, NOW);
    expect(kv.data.size).toBe(0);
  });

  it("forgets a draft after seven days", () => {
    const kv = memory();
    saveDraft(kv, "u1", "a", "1", { x: "typed" }, NOW);
    expect(loadDraft(kv, "u1", "a", "1", NOW + 6 * DAY)).toEqual({ x: "typed" });
    expect(loadDraft(kv, "u1", "a", "1", NOW + 8 * DAY)).toBeNull();
    expect(kv.data.size).toBe(0);
  });

  it("sweeps old drafts and keeps current ones", () => {
    const kv = memory();
    saveDraft(kv, "u1", "a", "1", { x: "old" }, NOW - 9 * DAY);
    saveDraft(kv, "u1", "b", "1", { x: "new" }, NOW - DAY);
    sweepDrafts(kv, NOW);
    expect(loadDraft(kv, "u1", "a", "1", NOW)).toBeNull();
    expect(loadDraft(kv, "u1", "b", "1", NOW)).toEqual({ x: "new" });
    expect(JSON.parse(kv.data.get(DRAFT_INDEX_KEY)!)).toEqual(["draft:u1:b:1"]);
  });

  it("clears every draft at sign-out, and nothing else", () => {
    const kv = memory();
    kv.set("search:recent", "keep?");
    saveDraft(kv, "u1", "a", "1", { x: "t" }, NOW);
    saveDraft(kv, "u2", "b", "2", { x: "t" }, NOW);
    dropAllDrafts(kv);
    expect([...kv.data.keys()]).toEqual(["search:recent"]);
  });

  it("copes with a damaged index or store", () => {
    const kv = memory();
    kv.set(DRAFT_INDEX_KEY, "{broken");
    saveDraft(kv, "u1", "a", "1", { x: "t" }, NOW);
    expect(loadDraft(kv, "u1", "a", "1", NOW)).toEqual({ x: "t" });
    const broken: KeyValue = {
      get: () => {
        throw new Error("closed");
      },
      set: () => {
        throw new Error("closed");
      },
      remove: () => {
        throw new Error("closed");
      },
    };
    expect(() => saveDraft(broken, "u1", "a", "1", { x: "t" }, NOW)).not.toThrow();
    expect(loadDraft(broken, "u1", "a", "1", NOW)).toBeNull();
    expect(() => dropAllDrafts(broken)).not.toThrow();
  });
});
