import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
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
  chooseFromLibrary,
  currentPosition,
  type CapturedFile,
} from "../../lib/media";
import { useCompany } from "../../state/session";
import { Button, Row, Section, T } from "../../ui/components";
import { chooseAction } from "../../ui/confirm";
import { MarkupLayer } from "../../ui/MarkupLayer";
import { color, face, radius, space } from "../../ui/theme";
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
  // At large text sizes the three buttons stack instead of squeezing their labels.
  const stack = useWindowDimensions().fontScale >= 1.3;
  // Four thumbnails per row, sized from the grid's measured width.
  const [gridWidth, setGridWidth] = useState(0);
  const thumbSize =
    gridWidth > 0 ? Math.floor((gridWidth - GAP * (PER_ROW - 1)) / PER_ROW) : FALLBACK_THUMB;

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

  /** Photo and Video ask: take a new one, or choose one already on the phone. */
  function choose(kind: "photo" | "video") {
    const noun = kind === "photo" ? "Photo" : "Video";
    chooseAction({
      title: `Add ${noun}`,
      actions: [
        { label: `Take ${noun}`, onPress: () => void capture(kind, "camera") },
        { label: "Choose from Library", onPress: () => void capture(kind, "library") },
      ],
    });
  }

  async function capture(kind: "photo" | "video", source: "camera" | "library") {
    setBusy(kind);
    try {
      if (source === "library") {
        // Taken earlier, maybe elsewhere: where the phone is now isn't where it was taken.
        const file = await chooseFromLibrary(kind);
        if (file) await save(file, Promise.resolve(null));
        return;
      }
      await askLocationOnce();
      const position = currentPosition();
      const file = await captureWithCamera(kind);
      if (file) await save(file, position);
    } catch (e) {
      const title = kind === "photo" ? "Couldn’t take the photo" : "Couldn’t record the video";
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof MediaError && e.needsSettings) {
        Alert.alert(title, message, [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else Alert.alert(title, message);
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
        <Row style={[styles.buttons, stack && { flexDirection: "column", alignItems: "stretch" }]}>
          <Button
            title="Photo"
            kind="secondary"
            onPress={() => choose("photo")}
            loading={busy === "photo"}
            disabled={busy !== null}
            style={stack ? undefined : styles.button}
          />
          <Button
            title="Video"
            kind="secondary"
            onPress={() => choose("video")}
            loading={busy === "video"}
            disabled={busy !== null}
            style={stack ? undefined : styles.button}
          />
          <Button
            title="Voice Note"
            kind="secondary"
            onPress={() => setRecording(true)}
            disabled={busy !== null}
            style={stack ? undefined : styles.button}
          />
        </Row>
      )}
      {media.length > 0 ? (
        <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {media.map((m) => (
            <Thumb key={m.id} media={m} size={thumbSize} />
          ))}
        </View>
      ) : null}
    </Section>
  );
}

const PER_ROW = 4;
const GAP = space["2"];
/** Size before the grid is measured (one frame). */
const FALLBACK_THUMB = 80;

function Thumb({ media, size }: { media: Media; size: number }) {
  const uri = useMediaUri(media);
  const markup = parseMarkup(media.markup);
  const label = `${MEDIA_KIND_LABELS[media.kind]}${media.duration_ms ? `, ${formatDuration(media.duration_ms)}` : ""}${media.upload_state === "pending" ? ", waiting to upload" : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(`/jobs/${media.job_id}/media/${media.id}`)}
      style={({ pressed }) => [
        styles.thumb,
        { width: size, height: size },
        pressed && { opacity: 0.8 },
      ]}
    >
      {media.kind === "photo" && uri ? (
        <>
          <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
          {markup.shapes.length > 0 && media.width && media.height ? (
            <CoverMarkup media={media} shapes={markup.shapes} size={size} />
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
  size,
}: {
  media: Media;
  shapes: Parameters<typeof MarkupLayer>[0]["shapes"];
  size: number;
}) {
  const w = media.width!;
  const h = media.height!;
  const scale = Math.max(size / w, size / h);
  const dw = w * scale;
  const dh = h * scale;
  return (
    <View
      style={{
        position: "absolute",
        left: (size - dw) / 2,
        top: (size - dh) / 2,
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  thumb: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.navy,
  },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  duration: { color: color.onHeader, ...face.semiBold, fontVariant: ["tabular-nums"] },
  badge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: 3,
  },
});
