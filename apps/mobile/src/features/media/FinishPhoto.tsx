import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import {
  FINISH_PHOTO_MESSAGE,
  requiresFinishPhoto,
  type Media,
  friendlyError,
} from "@leakbook/core";
import { forgetCapture, rememberCapture, saveCapture, useJobMedia } from "../../data/media";
import { MediaError, askLocationOnce, captureWithCamera, currentPosition } from "../../lib/media";
import { useCompany } from "../../state/session";
import { Button, Notice, T } from "../../ui/components";
import { space } from "../../ui/theme";

// "Require a pool photo to finish a job" (owner setting, 2026-10-19). With it on, a job can't
// be finished (marked Done, or its report finished or sent) until it has a photo, as the
// website checks in apps/web/src/server/reports.ts `requireFinishPhoto`. Here the phone's own
// rows count, so a photo still in the outbox or upload queue already counts.

/** Whether finishing this job still needs a photo: the setting is on and it has none. */
export function needsFinishPhoto(
  settings: unknown,
  media: (Pick<Media, "kind"> & { deleted_at?: string | null })[],
): boolean {
  return requiresFinishPhoto(settings) && !media.some((m) => m.kind === "photo" && !m.deleted_at);
}

/** needsFinishPhoto for a job on this phone. */
export function useNeedsFinishPhoto(jobId: string): boolean {
  const company = useCompany();
  const media = useJobMedia(company.id, jobId);
  return needsFinishPhoto(company.settings, media);
}

/** The website's message, with Take Photo (the camera, as on the Photos section). */
export function FinishPhotoNotice({ jobId }: { jobId: string }) {
  const company = useCompany();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take() {
    setBusy(true);
    setError(null);
    try {
      await askLocationOnce();
      const position = currentPosition();
      rememberCapture({
        companyId: company.id,
        target: { jobId },
        kind: "photo",
        source: "camera",
      });
      const file = await captureWithCamera("photo");
      if (file) await saveCapture(company.id, { jobId }, file, position);
    } catch (e) {
      const message = friendlyError(e);
      if (e instanceof MediaError && e.needsSettings) {
        Alert.alert("Couldn’t take the photo", message, [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else setError(message);
    } finally {
      forgetCapture();
      setBusy(false);
    }
  }

  return (
    <Notice tone="warning">
      <View style={{ gap: space["3"], flex: 1 }}>
        <T>{FINISH_PHOTO_MESSAGE}</T>
        <Button
          title={busy ? "Opening Camera…" : "Take Photo"}
          kind="secondary"
          disabled={busy}
          onPress={() => void take()}
        />
        {error ? <T>{error}</T> : null}
      </View>
    </Notice>
  );
}
