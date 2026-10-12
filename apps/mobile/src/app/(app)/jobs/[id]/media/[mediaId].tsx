import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import {
  MARKUP_COLORS,
  MEDIA_KIND_LABELS,
  formatBytes,
  formatDuration,
  parseMarkup,
  shapeFromDrag,
  textShape,
  type Markup,
  type MarkupColor,
  type MarkupShape,
  type Media,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useJobInspection } from "../../../../../data/inspection";
import { useRow } from "../../../../../data/hooks";
import { useMediaUri } from "../../../../../data/media";
import { useCompany, useSession } from "../../../../../state/session";
import { Button, Card, Field, Notice, Row, Segmented, T } from "../../../../../ui/components";
import { MarkupLayer } from "../../../../../ui/MarkupLayer";
import { color, markupColor, space } from "../../../../../ui/theme";

type Tool = "arrow" | "circle" | "text";

const COLOR_NAMES: Record<MarkupColor, string> = { red: "Red", yellow: "Yellow", white: "White" };

/** One capture: view it, mark it up (photos), play it (video, voice), see its record. */
export default function MediaScreen() {
  const { mediaId } = useLocalSearchParams<{ id: string; mediaId: string }>();
  const company = useCompany();
  const { services } = useSession();
  const media = useRow<Media>("media", mediaId);
  const insp = useJobInspection(company.id, media?.job_id ?? "");
  const uri = useMediaUri(media);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MarkupShape[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [ink, setInk] = useState<MarkupColor>("red");
  const [label, setLabel] = useState("");

  // Caption saves when leaving the field and when leaving the screen.
  const [caption, setCaption] = useState<string | null>(null);
  const flushCaption = useRef(() => {});
  useEffect(() => {
    flushCaption.current = () => {
      if (media && caption !== null && caption.trim() !== (media.caption ?? ""))
        services.sync.write("media", media.id, company.id, { caption: caption.trim() || null });
    };
  });
  useEffect(() => () => flushCaption.current(), []);

  if (!media) {
    return (
      <View style={styles.screen}>
        <Notice tone="warning">This capture isn’t on this phone.</Notice>
      </View>
    );
  }
  const saved = parseMarkup(media.markup).shapes;

  function startEditing() {
    setDraft(saved);
    setEditing(true);
  }

  function saveMarkup() {
    const markup: Markup | null = draft.length > 0 ? { version: 1, shapes: draft } : null;
    services.sync.write("media", media!.id, company.id, {
      markup: markup as unknown as JsonValue,
    });
    setEditing(false);
  }

  function remove() {
    Alert.alert(
      `Delete this ${MEDIA_KIND_LABELS[media!.kind].toLowerCase()}?`,
      "It is removed from the job and its reports.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            services.sync.write("media", media!.id, company.id, {
              deleted_at: new Date().toISOString(),
            });
            router.back();
          },
        },
      ],
    );
  }

  const attachedTo =
    (media.finding_id && insp.findings.find((f) => f.id === media.finding_id)?.title) ||
    (media.job_component_id && insp.componentById.get(media.job_component_id)?.label) ||
    (media.test_result_id ? "A test" : null) ||
    "The job";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: MEDIA_KIND_LABELS[media.kind] }} />
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEnabled={!editing}
        keyboardShouldPersistTaps="handled"
      >
        {media.kind === "photo" ? (
          <PhotoCanvas
            media={media}
            uri={uri}
            shapes={editing ? draft : saved}
            editing={editing}
            tool={tool}
            ink={ink}
            label={label}
            onAdd={(s) => setDraft((d) => [...d, s])}
          />
        ) : media.kind === "video" ? (
          uri ? (
            <VideoBox uri={uri} media={media} />
          ) : (
            <Unavailable />
          )
        ) : uri ? (
          <AudioBox uri={uri} durationMs={media.duration_ms} />
        ) : (
          <Unavailable />
        )}

        {media.kind === "photo" && !editing ? (
          <Button
            title={saved.length > 0 ? "Edit Markup" : "Mark Up"}
            kind="secondary"
            onPress={startEditing}
            disabled={!uri}
          />
        ) : null}

        {editing ? (
          <View style={styles.tools}>
            <Segmented
              options={[
                { value: "arrow", label: "Arrow" },
                { value: "circle", label: "Circle" },
                { value: "text", label: "Text" },
              ]}
              value={tool}
              onChange={setTool}
            />
            <Row style={{ gap: space["3"] }}>
              {MARKUP_COLORS.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityLabel={COLOR_NAMES[c]}
                  accessibilityState={{ selected: ink === c }}
                  onPress={() => setInk(c)}
                  style={[styles.swatchHit]}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: markupColor[c] },
                      ink === c && styles.swatchOn,
                    ]}
                  />
                </Pressable>
              ))}
            </Row>
            {tool === "text" ? (
              <Field
                label="Label"
                value={label}
                onChangeText={setLabel}
                placeholder="Crack"
                maxLength={80}
                hint="Then tap the photo where it goes."
              />
            ) : (
              <T variant="muted">
                Drag on the photo to draw {tool === "arrow" ? "an arrow" : "a circle"}.
              </T>
            )}
            <Row style={{ gap: space["3"] }}>
              <Button
                title="Undo"
                kind="secondary"
                onPress={() => setDraft((d) => d.slice(0, -1))}
                disabled={draft.length === 0}
                style={{ flex: 1 }}
              />
              <Button
                title="Clear All"
                kind="secondary"
                onPress={() => setDraft([])}
                disabled={draft.length === 0}
                style={{ flex: 1 }}
              />
            </Row>
            <Row style={{ gap: space["3"] }}>
              <Button
                title="Cancel"
                kind="secondary"
                onPress={() => setEditing(false)}
                style={{ flex: 1 }}
              />
              <Button title="Save Markup" onPress={saveMarkup} style={{ flex: 1 }} />
            </Row>
            <T variant="muted">The original photo is never changed. Markup is drawn on top.</T>
          </View>
        ) : null}

        {!editing ? (
          <>
            {media.kind === "audio" ? <Transcript media={media} /> : null}
            <Field
              label="Caption"
              value={caption ?? media.caption ?? ""}
              onChangeText={setCaption}
              onBlur={() => flushCaption.current()}
              placeholder="What this shows"
              multiline
            />
            <Card>
              <Detail label="Attached to" value={attachedTo} />
              <Detail
                label="Captured"
                value={media.captured_at ? new Date(media.captured_at).toLocaleString() : "Unknown"}
              />
              <Detail
                label="Location"
                value={
                  media.latitude != null && media.longitude != null
                    ? `${media.latitude.toFixed(5)}, ${media.longitude.toFixed(5)}`
                    : "Not recorded"
                }
              />
              <Detail
                label="Size"
                value={[
                  formatBytes(media.size_bytes),
                  media.width && media.height ? `${media.width} × ${media.height}` : null,
                  media.duration_ms ? formatDuration(media.duration_ms) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Detail
                label="Upload"
                value={
                  media.upload_state === "uploaded"
                    ? "Uploaded"
                    : "Waiting to upload (saved on this phone)"
                }
              />
              <Detail
                label="Fingerprint"
                value={media.sha256 ? `SHA-256 ${media.sha256.slice(0, 16)}…` : "None"}
              />
            </Card>
            <Button title="Delete" kind="danger" onPress={remove} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <T variant="label">{label}</T>
      <T variant="small" style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </T>
    </View>
  );
}

function Unavailable() {
  return (
    <Notice tone="warning">
      This file isn’t on this phone and can’t be downloaded while offline.
    </Notice>
  );
}

// ---------------------------------------------------------------------------
// Photo with markup and drawing
// ---------------------------------------------------------------------------

function PhotoCanvas({
  media,
  uri,
  shapes,
  editing,
  tool,
  ink,
  label,
  onAdd,
}: {
  media: Media;
  uri: string | null;
  shapes: MarkupShape[];
  editing: boolean;
  tool: Tool;
  ink: MarkupColor;
  label: string;
  onAdd: (s: MarkupShape) => void;
}) {
  const [width, setWidth] = useState(0);
  const ratio = media.width && media.height ? media.height / media.width : 0.75;
  const height = width * ratio;
  const [live, setLive] = useState<MarkupShape | null>(null);

  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0 });
  const frac = (x: number, y: number) => ({ x: x / width, y: y / height });
  const startPoint = () => frac(start.current.x, start.current.y);
  const endPoint = (e: GestureResponderEvent) =>
    frac(
      start.current.x + e.nativeEvent.pageX - start.current.pageX,
      start.current.y + e.nativeEvent.pageY - start.current.pageY,
    );

  function release(e: GestureResponderEvent) {
    setLive(null);
    const shape =
      tool === "text"
        ? textShape(ink, startPoint(), label)
        : shapeFromDrag(tool, ink, startPoint(), endPoint(e));
    if (shape) onAdd(shape);
    else if (tool === "text") Alert.alert("Type the label first, then tap the photo.");
  }

  return (
    <View
      style={[styles.photoFrame, editing && styles.photoEditing]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <View
          style={{ width, height }}
          onStartShouldSetResponder={() => editing}
          onMoveShouldSetResponder={() => editing}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            const n = e.nativeEvent;
            start.current = { x: n.locationX, y: n.locationY, pageX: n.pageX, pageY: n.pageY };
          }}
          onResponderMove={(e) => {
            if (tool !== "text") setLive(shapeFromDrag(tool, ink, startPoint(), endPoint(e)));
          }}
          onResponderRelease={release}
          onResponderTerminate={() => setLive(null)}
          accessibilityLabel={editing ? "Photo. Drag to draw." : "Photo with markup"}
        >
          {uri ? (
            <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
          ) : (
            <View style={[styles.missing, { width, height }]}>
              <Unavailable />
            </View>
          )}
          <MarkupLayer
            shapes={live ? [...shapes, live] : shapes}
            width={width}
            height={height}
            scale={width / 400}
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Video and voice playback
// ---------------------------------------------------------------------------

function VideoBox({ uri, media }: { uri: string; media: Media }) {
  const player = useVideoPlayer(uri);
  const ratio = media.width && media.height ? media.width / media.height : 16 / 9;
  return (
    <VideoView
      player={player}
      style={[styles.video, { aspectRatio: ratio }]}
      nativeControls
      contentFit="contain"
    />
  );
}

function AudioBox({ uri, durationMs }: { uri: string; durationMs: number | null }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <Card>
      <Row style={{ gap: space["3"] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
          onPress={() => {
            if (playing) player.pause();
            else {
              if (status.didJustFinish || status.currentTime >= status.duration - 0.05)
                void player.seekTo(0);
              player.play();
            }
          }}
          style={styles.play}
        >
          <Ionicons name={playing ? "pause" : "play"} size={28} color={color.onHeader} />
        </Pressable>
        <T variant="heading" style={{ fontVariant: ["tabular-nums"] }}>
          {formatDuration(status.currentTime * 1000)} /{" "}
          {formatDuration(durationMs ?? status.duration * 1000)}
        </T>
      </Row>
    </Card>
  );
}

function Transcript({ media }: { media: Media }) {
  const text =
    media.transcript_status === "done"
      ? media.transcript || "(No speech heard.)"
      : media.transcript_status === "pending"
        ? "Transcribing…"
        : media.transcript_status === "failed"
          ? "Transcription failed. The office can retry it."
          : media.upload_state === "uploaded"
            ? "Not transcribed yet."
            : "Transcribed after the recording uploads.";
  return (
    <Card>
      <T variant="label">Transcript</T>
      <T variant={media.transcript_status === "done" ? "body" : "muted"}>{text}</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space["4"], gap: space["4"], paddingBottom: space["7"] },
  photoFrame: { width: "100%", backgroundColor: color.navy, borderRadius: 10, overflow: "hidden" },
  photoEditing: { borderWidth: 2, borderColor: color.primary },
  missing: { justifyContent: "center", padding: space["4"] },
  tools: { gap: space["3"] },
  swatchHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.controlBorder,
  },
  swatchOn: { borderWidth: 3, borderColor: color.navy, width: 38, height: 38, borderRadius: 19 },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: space["3"] },
  video: { width: "100%", backgroundColor: "black", borderRadius: 10 },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.navy,
    alignItems: "center",
    justifyContent: "center",
  },
});
