import { MEDIA_KIND_LABELS, type Media } from "@leakbook/core";
import type { SyncService } from "../../lib/sync-service";
import { confirmDestructive } from "../../ui/confirm";

/**
 * Asks, then deletes, a photo, video, or voice note from the job. Shared by the photo viewer
 * and the cards in the Photos section. The original file stays in storage; the row is marked
 * deleted through the sync layer.
 */
export function confirmDeleteMedia(
  sync: SyncService,
  companyId: string,
  media: Media,
  after?: () => void,
) {
  const kind = MEDIA_KIND_LABELS[media.kind];
  confirmDestructive({
    title: `Remove this ${kind.toLowerCase()} from the job?`,
    message: "The original stays on file.",
    confirm: `Delete ${kind}`,
    onConfirm: () => {
      sync.write("media", media.id, companyId, { deleted_at: new Date().toISOString() });
      after?.();
    },
  });
}
