import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { REPORT_PHOTO_TEXT, reportPhotoBlock, friendlyError } from "@leakbook/core";
import { forgetCapture, rememberCapture, saveCapture, useJobMedia } from "../../data/media";
import { MediaError, askLocationOnce, captureWithCamera, currentPosition } from "../../lib/media";
import { photoCount } from "../../lib/visitReports";
import { useCompany } from "../../state/session";
import { Button, T } from "../../ui/components";
import { space } from "../../ui/theme";

// Require a Photo (owner, 2026-10-25: "require photo to send report"; core report-photo.ts).
// With the shop's switch on, a visit's report can't be sent until the visit has a photo. The
// phone decides from its own rows, so a photo still waiting to upload already counts; the
// server checks again (send_visit_report).

/** Why this visit's report can't be sent yet (core reportPhotoBlock), or null. */
export function useReportPhotoBlock(jobId: string): string | null {
  const company = useCompany();
  const media = useJobMedia(company.id, jobId);
  return reportPhotoBlock(company.settings, photoCount(media));
}

/**
 * "Add a photo to send this report." with Add Photo (the camera, as on the Photos section),
 * where Send Visit Report would be. Once the photo is saved the send buttons come back.
 */
export function ReportPhotoNotice({ jobId }: { jobId: string }) {
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
    <View style={{ gap: space["3"] }}>
      {/* Where the send buttons would be: what it needs, in plain text, not a red bar (owner,
          2026-10-26: no warnings before the person acts). */}
      <T muted>{REPORT_PHOTO_TEXT.blocked}</T>
      <Button
        title={busy ? "Opening Camera…" : REPORT_PHOTO_TEXT.addPhoto}
        disabled={busy}
        onPress={() => void take()}
      />
      {error ? <T muted>{error}</T> : null}
    </View>
  );
}
