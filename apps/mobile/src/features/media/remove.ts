import { removedKindOfMedia, type Media } from "@leakbook/core";
import { announceRemoved } from "../../lib/removedBanner";
import { removeRows } from "../../lib/removal";
import type { SyncService } from "../../lib/sync-service";

/**
 * Removes a photo, video, or voice note from the job, at once, with Undo for five seconds
 * (owner, 2026-10-26: Undo instead of "Are you sure?"). Shared by the photo viewer and the cards
 * in the Photos section. The original file stays in storage; the row is marked deleted through
 * the sync layer, and Undo clears that.
 */
export function deleteMedia(
  sync: SyncService,
  companyId: string,
  media: Media,
  after?: () => void,
) {
  announceRemoved(
    removeRows(sync, companyId, removedKindOfMedia(media.kind), [{ table: "media", id: media.id }]),
  );
  after?.();
}
