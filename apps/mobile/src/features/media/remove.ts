import { MEDIA_KIND_LABELS, type Media } from "@leakbook/core";
import type { SyncService } from "../../lib/sync-service";
import { confirmDestructive } from "../../ui/confirm";

/**
 * Asks, then deletes, a photo, video, or voice note from the job. Shared by the capture's own
 * screen (its Delete button) and the thumbnails (the screen reader's Delete action). The
 * original file stays in storage; the row is marked deleted through the sync layer.
 */
export function confirmDeleteMedia(
  sync: SyncService,
  companyId: string,
  media: Media,
  after?: () => void,
) {
  confirmDestructive({
    title: `Delete this ${MEDIA_KIND_LABELS[media.kind].toLowerCase()}?`,
    message: "It is removed from the job and its reports.",
    confirm: "Delete",
    onConfirm: () => {
      sync.write("media", media.id, companyId, { deleted_at: new Date().toISOString() });
      after?.();
    },
  });
}
