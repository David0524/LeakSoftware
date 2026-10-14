import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MARKUP_COLORS,
  MEDIA_KIND_LABELS,
  formatBytes,
  formatDuration,
  parseMarkup,
  shapeAtTap,
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
import { useMediaSource, type MediaSourceState } from "../../../../../data/media";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  Card,
  Field,
  Group,
  HeaderButton,
  ListRow,
  Notice,
  Row,
  Segmented,
  T,
} from "../../../../../ui/components";
import { confirmDestructive } from "../../../../../ui/confirm";
import { confirmDeleteMedia } from "../../../../../features/media/remove";
import { Icon } from "../../../../../ui/Icon";
import { MarkupLayer } from "../../../../../ui/MarkupLayer";
import { solidBar, translucentBar } from "../../../../../ui/navigation";
import { useSheetLock } from "../../../../../ui/sheet";
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
  const source = useMediaSource(media);
  const uri = source.uri;

  const [editing, setEditing] = useState(false);

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
      <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.content}>
          <Notice tone="warning">This capture isn’t on this phone.</Notice>
        </View>
      </ScrollView>
    );
  }
  const saved = parseMarkup(media.markup).shapes;
  const kindName = MEDIA_KIND_LABELS[media.kind].toLowerCase();
  const capture = media;

  function saveMarkup(shapes: MarkupShape[]) {
    const markup: Markup | null = shapes.length > 0 ? { version: 1, shapes } : null;
    services.sync.write("media", media!.id, company.id, {
      markup: markup as unknown as JsonValue,
    });
    setEditing(false);
  }

  if (editing && media.kind === "photo" && uri) {
    return (
      <MarkupEditor
        media={media}
        uri={uri}
        saved={saved}
        onCancel={() => setEditing(false)}
        onSave={saveMarkup}
      />
    );
  }

  function remove() {
    confirmDeleteMedia(services.sync, company.id, capture, () => router.back());
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
      <Stack.Screen
        options={{
          ...translucentBar,
          title: MEDIA_KIND_LABELS[media.kind],
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
          gestureEnabled: true,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // iPhone: starts below the translucent bar and scrolls under it.
        contentInsetAdjustmentBehavior="automatic"
      >
        {source.state !== "ready" ? (
          <SourceState state={source.state} kind={kindName} onRetry={source.retry} />
        ) : media.kind === "photo" ? (
          <PhotoView media={media} uri={uri!} shapes={saved} />
        ) : media.kind === "video" ? (
          <VideoBox uri={uri!} media={media} />
        ) : (
          <AudioBox uri={uri!} durationMs={media.duration_ms} />
        )}

        {media.kind === "photo" ? (
          <Button
            title={saved.length > 0 ? "Edit Markup" : "Mark Up"}
            kind="secondary"
            onPress={() => setEditing(true)}
            disabled={!uri}
          />
        ) : null}

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
          <Group>
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
          </Group>
          <Button title="Delete" kind="danger" onPress={remove} />
        </>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** One line of the capture's record, as a label and value row. */
function Detail({ label, value }: { label: string; value: string }) {
  return <ListRow title={label} detail={value} />;
}

function SourceState({
  state,
  kind,
  onRetry,
}: {
  state: MediaSourceState;
  kind: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <Card style={styles.sourceState}>
        <ActivityIndicator color={color.navy} />
        <T variant="muted">Loading the {kind}…</T>
      </Card>
    );
  }
  return (
    <Card>
      <T variant="body">
        This {kind} isn’t on this phone. It downloads when you have a connection.
      </T>
      <Button title="Try Again" kind="secondary" onPress={onRetry} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Photo with markup and drawing
// ---------------------------------------------------------------------------

/** The photo with its markup. Pinch to zoom. */
function PhotoView({ media, uri, shapes }: { media: Media; uri: string; shapes: MarkupShape[] }) {
  const [width, setWidth] = useState(0);
  const ratio = media.width && media.height ? media.height / media.width : 0.75;
  const height = width * ratio;
  return (
    <View style={styles.photoFrame} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          style={{ width, height }}
          contentContainerStyle={{ width, height }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          accessibilityLabel={shapes.length > 0 ? "Photo with markup" : "Photo"}
        >
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
          <MarkupLayer shapes={shapes} width={width} height={height} scale={width / 400} />
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Full-screen markup editor. Cancel and Save sit in the header, the tools in a bar at the
 * bottom, and the photo is fitted between them so everything is reachable at any shape.
 */
function MarkupEditor({
  media,
  uri,
  saved,
  onCancel,
  onSave,
}: {
  media: Media;
  uri: string;
  saved: MarkupShape[];
  onCancel: () => void;
  onSave: (shapes: MarkupShape[]) => void;
}) {
  const insets = useSafeAreaInsets();
  // Drawing drags on the photo; inside a sheet they must not pull the sheet down.
  useSheetLock(true);
  // Every change is a new entry, so Undo also brings back a Clear All.
  const [history, setHistory] = useState<MarkupShape[][]>([saved]);
  const draft = history[history.length - 1]!;
  const dirty = history.length > 1;
  const push = (next: MarkupShape[]) => setHistory((h) => [...h, next]);

  const [tool, setTool] = useState<Tool>("arrow");
  const [ink, setInk] = useState<MarkupColor>("red");
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string | undefined>();

  const [area, setArea] = useState({ width: 0, height: 0 });
  const ratio = media.width && media.height ? media.height / media.width : 0.75;
  const width = Math.min(area.width, area.height / ratio);
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
    if (tool === "text") {
      const shape = textShape(ink, startPoint(), label);
      if (shape) {
        push([...draft, shape]);
        setLabelError(undefined);
      } else setLabelError("Type the label first.");
      return;
    }
    // A drag draws to size; a tap places a default-sized shape.
    const shape =
      shapeFromDrag(tool, ink, startPoint(), endPoint(e)) ??
      shapeAtTap(tool, ink, startPoint(), 1 / ratio);
    push([...draft, shape]);
  }

  function cancel() {
    if (!dirty) return onCancel();
    confirmDestructive({
      title: "Discard markup changes?",
      confirm: "Discard",
      cancel: "Keep Editing",
      onConfirm: onCancel,
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.editor}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          // The editor doesn't scroll: a solid bar, so the photo never sits under it.
          ...solidBar,
          title: "Mark Up",
          headerBackVisible: false,
          gestureEnabled: false,
          headerLeft: () => <HeaderButton title="Cancel" onPress={cancel} />,
          headerRight: () => <HeaderButton title="Save" strong onPress={() => onSave(draft)} />,
        }}
      />
      <View
        style={styles.canvasArea}
        onLayout={(e) =>
          setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
      >
        {width > 0 ? (
          <View
            style={{ width, height }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
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
            accessibilityLabel="Photo. Tap to place, or drag to draw."
          >
            <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
            <MarkupLayer
              shapes={live ? [...draft, live] : draft}
              width={width}
              height={height}
              scale={width / 400}
            />
          </View>
        ) : null}
      </View>

      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, space["3"]) }]}>
        <Segmented
          options={[
            { value: "arrow", label: "Arrow" },
            { value: "circle", label: "Circle" },
            { value: "text", label: "Text" },
          ]}
          value={tool}
          onChange={setTool}
        />
        {tool === "text" ? (
          <Field
            label="Label"
            value={label}
            onChangeText={(v) => {
              setLabel(v);
              if (v.trim()) setLabelError(undefined);
            }}
            placeholder="Crack"
            maxLength={80}
            error={labelError}
            hint="Then tap the photo where it goes."
          />
        ) : (
          <T variant="muted">
            Tap to place {tool === "arrow" ? "an arrow" : "a circle"}, or drag to draw one.
          </T>
        )}
        <Row style={{ gap: space["2"] }}>
          {MARKUP_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={COLOR_NAMES[c]}
              accessibilityState={{ selected: ink === c }}
              onPress={() => setInk(c)}
              style={styles.swatchHit}
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
          <View style={{ flex: 1 }} />
          <Button
            title="Undo"
            kind="quiet"
            onPress={() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))}
            disabled={!dirty}
          />
          <Button
            title="Clear All"
            kind="quiet"
            onPress={() => push([])}
            disabled={draft.length === 0}
          />
        </Row>
      </View>
    </KeyboardAvoidingView>
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
  // Voice notes play even with the ringer switch on silent.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  }, []);
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
          <Icon name={playing ? "pause" : "play"} size={28} color={color.onHeader} />
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
  sourceState: { alignItems: "center", paddingVertical: space["6"] },
  editor: { flex: 1, backgroundColor: color.navy },
  canvasArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  toolbar: {
    backgroundColor: color.surface,
    paddingHorizontal: space["4"],
    paddingTop: space["3"],
    gap: space["2"],
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  swatchHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.controlBorder,
  },
  swatchOn: { borderWidth: 3, borderColor: color.navy, width: 38, height: 38, borderRadius: 19 },
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
