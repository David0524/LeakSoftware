import { describe, expect, it } from "vitest";
import {
  HAPTIC_MOMENTS,
  HAPTIC_WEB_MS,
  REMOVED_TEXT,
  REMOVED_UNDO_LABEL,
  REMOVED_UNDO_SECONDS,
  RESTORE_ROW,
  removedKindOfMedia,
} from "../src";

describe("Undo after removing", () => {
  it("says what was removed in one short line", () => {
    expect(REMOVED_TEXT.checklistItem).toBe("Item removed");
    expect(REMOVED_TEXT.chemical).toBe("Chemical removed");
    for (const text of Object.values(REMOVED_TEXT)) {
      expect(text).toMatch(/ removed$/);
      expect(text.length).toBeLessThan(26);
    }
  });

  it("names a photo, video or voice note by what it is", () => {
    expect(REMOVED_TEXT[removedKindOfMedia("photo")]).toBe("Photo removed");
    expect(REMOVED_TEXT[removedKindOfMedia("video")]).toBe("Video removed");
    expect(REMOVED_TEXT[removedKindOfMedia("audio")]).toBe("Voice note removed");
  });

  it("keeps Undo for five seconds", () => {
    expect(REMOVED_UNDO_LABEL).toBe("Undo");
    expect(REMOVED_UNDO_SECONDS).toBe(5);
  });

  it("puts a removed row back by clearing deleted_at, nothing else", () => {
    expect(RESTORE_ROW).toEqual({ deleted_at: null });
  });
});

describe("Haptics on completion", () => {
  it("lists the six moments once, with a light tap for items and the success tap for the rest", () => {
    expect(HAPTIC_MOMENTS).toEqual({
      checklistItemDone: "light",
      chemicalAdded: "light",
      allChemicalsAdded: "success",
      jobCompleted: "success",
      reportSent: "success",
      paymentRecorded: "success",
    });
    expect(HAPTIC_WEB_MS).toBe(10);
  });
});
