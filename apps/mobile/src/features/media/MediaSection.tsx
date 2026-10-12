import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, View } from "react-native";
import { MEDIA_KIND_LABELS, formatDuration, parseMarkup, type Media } from "@leakbook/core";
import {
  saveCapture,
  prepareLocation,
  useJobMedia,
  useMediaUri,
  type MediaTarget,
} from "../../data/media";
import {
  MediaError,
  askLocationOnce,
  captureWithCamera,
  currentPosition,
  type CapturedFile,
} from "../../lib/media";
import { useCompany } from "../../state/session";
import { Button, Row, Section, T } from "../../ui/components";
import { MarkupLayer } from "../../ui/MarkupLayer";
import { color, font, radius, space } from "../../ui/theme";
import { VoiceRecorder } from "./VoiceRecorder";

/**
 * Photos, videos, and voice notes for a job or one part of it, with capture buttons.
 * Everything is saved on the phone first and uploads in the background.
 */
export function MediaSection({
  target,
  title = "Photos and Notes",
  disabledReason,
}: {
  target: MediaTarget;
  title?: string;
  /** Shown instead of the buttons when captures cannot be attached yet. */
  disabledReason?: string;
}) {
  const company = useCompany();
  const media = useJobMedia(company.id, target.jobId, target);
  const [busy, setBusy] = useState<"photo" | "video" | null>(null);
  const [recording, setRecording] = useState(false);

  async function save(
    file: CapturedFile,
    position: Promise<{ latitude: number; longitude: number } | null>,
  ) {
    try {
      await saveCapture(company.id, target, file, position);
    } catch (e) {
      Alert.alert("Couldn’t save", e instanceof Error ? e.message : String(e));
    }
  }

  async function capture(kind: "photo" | "video") {
    setBusy(kind);
    try {
      await askLocationOnce();
      const position = currentPosition();
      const file = await captureWithCamera(kind);
      if (file) await save(file, position);
    } catch (e) {
      Alert.alert(
        kind === "photo" ? "Couldn’t take the photo" : "Couldn’t record the video",
        e instanceof MediaError ? e.message : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title={title}>
      {disabledReason ? (
        <T variant="muted">{disabledReason}</T>
      ) : recording ? (
        <VoiceRecorder
          onSaved={(file) => save(file, prepareLocation())}
          onClose={() => setRecording(false)}
        />
      ) : (
        <Row style={styles.buttons}>
          <Button
            title="Photo"
            kind="secondary"
            onPress={() => void capture("photo")}
            loading={busy === "photo"}
            disabled={busy !== null}
            style={styles.button}
          />
          <Button
            title="Video"
            kind="secondary"
            onPress={() => void capture("video")}
            loading={busy === "video"}
            disabled={busy !== null}
            style={styles.button}
          />
          <Button
            title="Voice Note"
            kind="secondary"
            onPress={() => setRecording(true)}
            disabled={busy !== null}
            style={styles.button}
          />
        </Row>
      )}
      {media.length > 0 ? (
        <View style={styles.grid}>
          {media.map((m) => (
            <Thumb key={m.id} media={m} />
          ))}
        </View>
      ) : null}
    </Section>
  );
}

const THUMB = 104;

function Thumb({ media }: { media: Media }) {
  const uri = useMediaUri(media);
  const markup = parseMarkup(media.markup);
  const label = `${MEDIA_KIND_LABELS[media.kind]}${media.duration_ms ? `, ${formatDuration(media.duration_ms)}` : ""}${media.upload_state === "pending" ? ", waiting to upload" : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(`/jobs/${media.job_id}/media/${media.id}`)}
      style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.8 }]}
    >
      {media.kind === "photo" && uri ? (
        <>
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          {markup.shapes.length > 0 && media.width && media.height ? (
            <CoverMarkup media={media} shapes={markup.shapes} />
          ) : null}
        </>
      ) : (
        <View style={styles.placeholder}>
          <Ionicons
            name={media.kind === "audio" ? "mic" : media.kind === "video" ? "videocam" : "image"}
            size={30}
            color={color.onHeader}
          />
          {media.duration_ms ? (
            <T variant="small" style={styles.duration}>
              {formatDuration(media.duration_ms)}
            </T>
          ) : null}
        </View>
      )}
      {media.upload_state === "pending" ? (
        <View style={styles.badge}>
          <Ionicons name="cloud-upload-outline" size={16} color={color.navy} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Markup positioned the way resizeMode "cover" crops the photo into a square. */
function CoverMarkup({
  media,
  shapes,
}: {
  media: Media;
  shapes: Parameters<typeof MarkupLayer>[0]["shapes"];
}) {
  const w = media.width!;
  const h = media.height!;
  const scale = Math.max(THUMB / w, THUMB / h);
  const dw = w * scale;
  const dh = h * scale;
  return (
    <View
      style={{
        position: "absolute",
        left: (THUMB - dw) / 2,
        top: (THUMB - dh) / 2,
        width: dw,
        height: dh,
      }}
      pointerEvents="none"
    >
      <MarkupLayer shapes={shapes} width={dw} height={dh} scale={dw / 400} />
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: space["2"] },
  button: { flex: 1, paddingHorizontal: space["2"] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.navy,
  },
  image: { width: THUMB, height: THUMB },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  duration: { color: color.onHeader, fontFamily: font.bodySemiBold, fontVariant: ["tabular-nums"] },
  badge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: 3,
  },
});
