import type { MediaKind } from "./media";

// Undo instead of "Are you sure?" (owner, 2026-10-26: Apple principle 1; docs/design/
// 2026-10-26-undo.md). Taking something off a visit that can be put back (a checklist item, an
// added chemical, a reading, a photo, a test, a finding, a repair) happens at once and says so
// for five seconds with Undo; Undo writes the same rows back, through the same save path as the
// removal. Anything that can't be taken back, or that others see, still asks first. The same
// words on the website, iPhone (SundeckCore/Removal.swift) and Android.

export type RemovedKind =
  | "checklistItem"
  | "chemical"
  | "readings"
  | "photo"
  | "video"
  | "voiceNote"
  | "test"
  | "finding"
  | "repair";

/** One short line in the banner: "Photo removed" with Undo beside it. */
export const REMOVED_TEXT: Record<RemovedKind, string> = {
  checklistItem: "Item removed",
  chemical: "Chemical removed",
  readings: "Readings removed",
  photo: "Photo removed",
  video: "Video removed",
  voiceNote: "Voice note removed",
  test: "Test removed",
  finding: "Finding removed",
  repair: "Repair removed",
};

/** The banner's button, and how long it stays (a screen reader gets longer). */
export const REMOVED_UNDO_LABEL = "Undo";
export const REMOVED_UNDO_SECONDS = 5;

/** What a removed photo, video or voice note is called. */
export function removedKindOfMedia(kind: MediaKind): RemovedKind {
  return kind === "photo" ? "photo" : kind === "video" ? "video" : "voiceNote";
}

/**
 * What Undo writes to each row a removal marked deleted: it's live again. (A removal is a soft
 * delete everywhere, so the row, its id and every other column are exactly as they were.)
 */
export const RESTORE_ROW = { deleted_at: null } as const;
