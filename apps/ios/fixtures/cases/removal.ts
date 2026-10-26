import {
  HAPTIC_MOMENTS,
  HAPTIC_WEB_MS,
  REMOVED_TEXT,
  REMOVED_UNDO_LABEL,
  REMOVED_UNDO_SECONDS,
  removedKindOfMedia,
  type MediaKind,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// removal.ts (owner, 2026-10-26: Undo instead of "Are you sure?").

export const removal: ModuleCases = {
  HAPTIC_MOMENTS: rule(() => ({ moments: HAPTIC_MOMENTS, webMs: HAPTIC_WEB_MS }), [[]]),
  REMOVED_TEXT: rule(() => REMOVED_TEXT, [[]]),
  removedUndo: rule(() => ({ label: REMOVED_UNDO_LABEL, seconds: REMOVED_UNDO_SECONDS }), [[]]),
  removedKindOfMedia: rule(
    (kind: MediaKind) => removedKindOfMedia(kind),
    (["photo", "video", "audio"] as MediaKind[]).map((k) => [k]),
  ),
};
