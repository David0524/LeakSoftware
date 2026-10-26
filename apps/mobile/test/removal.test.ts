import { describe, expect, it, vi } from "vitest";
import { REMOVED_TEXT, REMOVED_UNDO_SECONDS } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { removalFor, removeRows, type RemovalSync } from "../src/lib/removal";
import { announceRemoved, onRemoved, removalNote } from "../src/lib/removedBanner";
import { BANNER_UNDO_MS, bannerDuration } from "../src/lib/resultBanner";

// Undo instead of "Are you sure?" (owner, 2026-10-26; docs/design/2026-10-26-undo.md): a removal
// is a soft delete through the sync layer and Undo writes the same rows back.

type Write = { table: string; id: string; company: string; values: Record<string, JsonValue> };

function fakeSync() {
  const writes: Write[] = [];
  let batches = 0;
  const sync: RemovalSync = {
    write: (table, id, company, values) => void writes.push({ table, id, company, values }),
    batch: (fn) => {
      batches++;
      return fn();
    },
  };
  return { sync, writes, batches: () => batches };
}

describe("removeRows", () => {
  it("marks every row deleted in one batch, with the removal's time", () => {
    const { sync, writes, batches } = fakeSync();
    removeRows(
      sync,
      "co",
      "checklistItem",
      [
        { table: "job_component", id: "c1" },
        { table: "checklist_item_result", id: "r1" },
      ],
      { now: "2026-10-26T12:00:00.000Z" },
    );
    expect(batches()).toBe(1);
    expect(writes).toEqual([
      {
        table: "job_component",
        id: "c1",
        company: "co",
        values: { deleted_at: "2026-10-26T12:00:00.000Z" },
      },
      {
        table: "checklist_item_result",
        id: "r1",
        company: "co",
        values: { deleted_at: "2026-10-26T12:00:00.000Z" },
      },
    ]);
  });

  it("says what was removed", () => {
    const { sync } = fakeSync();
    const r = removeRows(sync, "co", "photo", [{ table: "media", id: "m1" }]);
    expect(r.message).toBe("Photo removed");
    expect(r.message).toBe(REMOVED_TEXT.photo);
    expect(r.detail).toBeUndefined();
    expect(
      removeRows(sync, "co", "checklistItem", [{ table: "job_component", id: "c" }], {
        detail: "It’s still due, so it goes on the next visit.",
      }).detail,
    ).toBe("It’s still due, so it goes on the next visit.");
  });

  it("Undo clears deleted_at on the same rows, in the same order, and nothing else", () => {
    const { sync, writes, batches } = fakeSync();
    const r = removeRows(sync, "co", "checklistItem", [
      { table: "job_component", id: "c1" },
      { table: "checklist_item_result", id: "r1" },
    ]);
    writes.length = 0;
    r.undo();
    expect(batches()).toBe(2);
    // Plain `deleted_at: null` updates, in one batch, the component before its result.
    expect(writes.map((w) => [w.table, w.id, w.values])).toEqual([
      ["job_component", "c1", { deleted_at: null }],
      ["checklist_item_result", "r1", { deleted_at: null }],
    ]);
  });

  it("a removal made another way still says its line and Undoes", () => {
    const undo = vi.fn();
    const r = removalFor("repair", undo);
    expect(r.message).toBe("Repair removed");
    r.undo();
    expect(undo).toHaveBeenCalledOnce();
  });
});

describe("the removal banner", () => {
  it("shows the line and Undo for five seconds", () => {
    const note = removalNote({ message: "Test removed", undo: () => {} });
    expect(note.tone).toBe("info");
    expect(note.message).toBe("Test removed");
    expect(note.ms).toBe(REMOVED_UNDO_SECONDS * 1000);
    expect(bannerDuration(note)).toBe(5000);
    // Other Undo banners keep their eight seconds.
    expect(bannerDuration({ tone: "success", undo: () => {} })).toBe(BANNER_UNDO_MS);
  });

  it("tells the host, and Undo from it puts the rows back", () => {
    const { sync, writes } = fakeSync();
    const seen: ReturnType<typeof removalNote>[] = [];
    const stop = onRemoved((n) => seen.push(n));
    announceRemoved(removeRows(sync, "co", "finding", [{ table: "finding", id: "f1" }]));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.message).toBe("Finding removed");
    writes.length = 0;
    seen[0]!.undo!();
    expect(writes).toEqual([
      { table: "finding", id: "f1", company: "co", values: { deleted_at: null } },
    ]);
    stop();
    announceRemoved(removeRows(sync, "co", "finding", [{ table: "finding", id: "f2" }]));
    expect(seen).toHaveLength(1);
  });
});
