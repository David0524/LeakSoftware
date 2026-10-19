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
  Share,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MARKUP_COLORS,
  MEDIA_KIND_LABELS,
  formatSchedule,
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
import { useRow } from "../../../../../data/hooks";
import { useMediaSource, type MediaSourceState } from "../../../../../data/media";
import { useCompany, useSession } from "../../../../../state/session";
import { Button, Field, Segmented, T } from "../../../../../ui/components";
import { confirmDestructive } from "../../../../../ui/confirm";
import { AudioRow, useAttachedTo } from "../../../../../features/media/MediaSection";
import { confirmDeleteMedia } from "../../../../../features/media/remove";
import { Glass } from "../../../../../ui/Glass";
import { haptics } from "../../../../../ui/haptics";
import { MarkupLayer } from "../../../../../ui/MarkupLayer";
import { useSheetLock } from "../../../../../ui/sheet";
import { color, face, ios, markupColor, minTap, shape, space, type } from "../../../../../ui/theme";
import { WebIcon } from "../../../../../ui/WebIcon";

type Tool = "arrow" | "circle" | "text";

const COLOR_NAMES: Record<MarkupColor, string> = { red: "Red", yellow: "Yellow", white: "White" };

/**
 * The photo viewer (spec 6.5): full screen over the tab bar on black, the photo fitted with
 * pinch to zoom and its markup over it; Done, the title and Share in a bar over it; caption,
 * when and where, the transcript, Mark Up and Delete in a panel under it. `?markup=1` opens
 * the markup editor straight away (Mark Up on the Photos section's card).
 */
export default function MediaScreen() {
  const { mediaId, markup: startInMarkup } = useLocalSearchParams<{
    id: string;
    mediaId: string;
    markup?: string;
  }>();
  const company = useCompany();
  const { services } = useSession();
  const media = useRow<Media>("media", mediaId);
  const attached = useAttachedTo(media);
  const source = useMediaSource(media);
  const uri = source.uri;
  const insets = useSafeAreaInsets();
  const direct = startInMarkup === "1";
  const [editing, setEditing] = useState(direct);

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

  const hidden = <Stack.Screen options={{ headerShown: false, gestureEnabled: !editing }} />;

  if (!media) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {hidden}
        <TopBar title="Photo" onDone={() => router.back()} />
        <View style={styles.center}>
          <Text style={[type.body, { color: color.paper }]}>This capture isn’t on this phone.</Text>
        </View>
      </View>
    );
  }
  const capture = media;
  const kind = MEDIA_KIND_LABELS[media.kind];
  const saved = parseMarkup(media.markup).shapes;

  function closeEditor() {
    if (direct) router.back();
    else setEditing(false);
  }

  function saveMarkup(shapes: MarkupShape[], newCaption: string) {
    const markup: Markup | null = shapes.length > 0 ? { version: 1, shapes } : null;
    const values: Record<string, JsonValue> = { markup: markup as unknown as JsonValue };
    if (newCaption.trim() !== (capture.caption ?? "")) values.caption = newCaption.trim() || null;
    services.sync.write("media", capture.id, company.id, values);
    setCaption(null);
    haptics.success();
    closeEditor();
  }

  if (editing && media.kind === "photo") {
    return (
      <>
        {hidden}
        {uri ? (
          <MarkupEditor
            media={media}
            uri={uri}
            saved={saved}
            onCancel={closeEditor}
            onSave={saveMarkup}
          />
        ) : (
          <View style={[styles.screen, { paddingTop: insets.top }]}>
            <TopBar title="Mark Up" onDone={closeEditor} doneLabel="Cancel" />
            <SourceState state={source.state} kind={kind} onRetry={source.retry} />
          </View>
        )}
      </>
    );
  }

  const meta = [
    media.captured_at ? formatSchedule(media.captured_at, new Date(), company.timezone) : null,
    media.latitude != null ? "location recorded" : null,
    media.upload_state === "pending" ? "waiting to upload" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <KeyboardAvoidingView
      style={[styles.screen, media.kind === "video" && { backgroundColor: color.navy }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {hidden}
      <View style={styles.stage}>
        {source.state !== "ready" ? (
          <SourceState state={source.state} kind={kind} onRetry={source.retry} />
        ) : media.kind === "photo" ? (
          <PhotoView media={media} uri={uri!} shapes={saved} />
        ) : media.kind === "video" ? (
          <VideoBox uri={uri!} />
        ) : (
          <View style={[styles.center, { paddingHorizontal: space["4"] }]}>
            <WebIcon name="mic" size={64} color={color.paper} strokeWidth={1.4} />
          </View>
        )}
        <View style={[styles.topBar, { paddingTop: insets.top }]} pointerEvents="box-none">
          <TopBar
            title={`${kind} · ${attached}`}
            onDone={() => router.back()}
            onShare={
              uri && ios
                ? () =>
                    void Share.share({
                      url: uri,
                      message: capture.caption ?? undefined,
                    })
                : undefined
            }
          />
        </View>
      </View>
      <View
        style={[
          styles.panel,
          { backgroundColor: color.bg, paddingBottom: Math.max(insets.bottom, space["4"]) },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {media.kind === "audio" && uri ? (
            <AudioRow uri={uri} durationMs={media.duration_ms} />
          ) : null}
          <Field
            label="Caption"
            value={caption ?? media.caption ?? ""}
            onChangeText={setCaption}
            onBlur={() => flushCaption.current()}
            placeholder="What this shows"
          />
          {meta ? (
            <T variant="secondary" muted>
              {meta}
            </T>
          ) : null}
          {media.kind === "audio" ? <Transcript media={media} /> : null}
          <View style={styles.actions}>
            {media.kind === "photo" ? (
              <Button
                title={saved.length ? "Edit Markup" : "Mark Up"}
                kind="secondary"
                disabled={!uri}
                onPress={() => setEditing(true)}
              />
            ) : null}
            <Button
              title="Delete"
              kind="danger"
              onPress={() =>
                confirmDeleteMedia(services.sync, company.id, capture, () => router.back())
              }
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** The bar over the photo: Done at the left, the title, Share at the right. */
function TopBar({
  title,
  onDone,
  onShare,
  doneLabel = "Done",
}: {
  title: string;
  onDone: () => void;
  onShare?: () => void;
  doneLabel?: string;
}) {
  return (
    <Glass variant="bar">
      <View style={styles.bar}>
        <View style={styles.barSide}>
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            hitSlop={4}
            style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.5 }]}
          >
            <Text
              style={[type.body, face.semiBold, { color: color.link }]}
              maxFontSizeMultiplier={1.6}
            >
              {doneLabel}
            </Text>
          </Pressable>
        </View>
        <Text
          style={[type.navTitle, styles.barTitle, { color: color.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <View style={[styles.barSide, { alignItems: "flex-end" }]}>
          {onShare ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share"
              onPress={onShare}
              style={({ pressed }) => [
                styles.barIcon,
                pressed && { backgroundColor: color.iconTint },
              ]}
            >
              <WebIcon name="share" size={22} color={color.link} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Glass>
  );
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
  return (
    <View style={[styles.center, { gap: space["3"], paddingHorizontal: space["5"] }]}>
      {state === "loading" ? (
        <>
          <ActivityIndicator color={color.paper} />
          <Text
            style={[type.body, { color: color.paper }]}
          >{`Loading the ${kind.toLowerCase()}…`}</Text>
        </>
      ) : (
        <>
          <Text style={[type.body, { color: color.paper, textAlign: "center" }]}>
            {`This ${kind.toLowerCase()} isn’t on this phone. It downloads when you have a connection.`}
          </Text>
          <Button title="Try Again" kind="secondary" onPress={onRetry} />
        </>
      )}
    </View>
  );
}

/** The photo fitted to the screen with its markup. Pinch to zoom (iPhone). */
function PhotoView({ media, uri, shapes }: { media: Media; uri: string; shapes: MarkupShape[] }) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const ratio = media.width && media.height ? media.height / media.width : 0.75;
  const width = Math.min(area.width, area.height / ratio);
  const height = width * ratio;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) =>
        setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
    >
      {area.width > 0 ? (
        <ScrollView
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{
            width: area.width,
            height: area.height,
            alignItems: "center",
            justifyContent: "center",
          }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          accessibilityLabel={media.caption ?? (shapes.length > 0 ? "Photo with markup" : "Photo")}
        >
          <View style={{ width, height }}>
            <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
            <MarkupLayer shapes={shapes} width={width} height={height} scale={width / 400} />
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Mark Up (spec 6.5), full screen: Cancel, the title and Save in the bar; the photo on navy;
 * under it the tool, the label for text, the color, Undo and Clear All, and the caption.
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
  onSave: (shapes: MarkupShape[], caption: string) => void;
}) {
  const insets = useSafeAreaInsets();
  // Drawing drags on the photo; inside a sheet they must not pull the sheet down.
  useSheetLock(true);
  // Every change is a new entry, so Undo also brings back a Clear All.
  const [history, setHistory] = useState<MarkupShape[][]>([saved]);
  const draft = history[history.length - 1]!;
  const push = (next: MarkupShape[]) => setHistory((h) => [...h, next]);
  const [caption, setCaption] = useState(media.caption ?? "");
  const dirty = history.length > 1 || caption !== (media.caption ?? "");
  const [saving, setSaving] = useState(false);

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
      const s = textShape(ink, startPoint(), label);
      if (s) {
        push([...draft, s]);
        setLabelError(undefined);
      } else setLabelError("Type the label first.");
      return;
    }
    // A drag draws to size; a tap places a default-sized shape.
    const s =
      shapeFromDrag(tool, ink, startPoint(), endPoint(e)) ??
      shapeAtTap(tool, ink, startPoint(), 1 / ratio);
    push([...draft, s]);
  }

  function cancel() {
    if (!dirty) return onCancel();
    confirmDestructive({
      title: "Discard changes?",
      confirm: "Discard Changes",
      cancel: "Keep Editing",
      onConfirm: onCancel,
    });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.editor, { backgroundColor: color.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top, backgroundColor: color.bg }}>
        <View
          style={[
            styles.bar,
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
          ]}
        >
          <View style={styles.barSide}>
            <Pressable
              accessibilityRole="button"
              onPress={cancel}
              style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.5 }]}
            >
              <Text style={[type.body, { color: color.link }]} maxFontSizeMultiplier={1.6}>
                Cancel
              </Text>
            </Pressable>
          </View>
          <Text
            style={[type.navTitle, styles.barTitle, { color: color.text }]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.6}
          >
            Mark Up
          </Text>
          <View style={[styles.barSide, { alignItems: "flex-end" }]}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                setSaving(true);
                onSave(draft, caption);
              }}
              style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.5 }]}
            >
              <Text
                style={[type.body, face.semiBold, { color: color.link }]}
                maxFontSizeMultiplier={1.6}
              >
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View
        style={[styles.canvasArea, { backgroundColor: color.navy }]}
        onLayout={(e) =>
          setArea({
            width: e.nativeEvent.layout.width - space["4"],
            height: e.nativeEvent.layout.height - space["4"],
          })
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

      <ScrollView
        style={styles.tools}
        contentContainerStyle={[
          styles.toolsContent,
          { paddingBottom: Math.max(insets.bottom, space["4"]) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Segmented
          label="Tool"
          fill={false}
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
          <T
            muted
          >{`Tap to place ${tool === "arrow" ? "an arrow" : "a circle"}, or drag to draw one.`}</T>
        )}
        <View style={styles.colorRow}>
          <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="Color">
            {MARKUP_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityLabel={COLOR_NAMES[c]}
                accessibilityState={{ checked: ink === c }}
                onPress={() => setInk(c)}
                style={styles.swatchHit}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: markupColor[c], borderColor: color.controlBorder },
                    ink === c && {
                      borderColor: color.text,
                      boxShadow: `0px 0px 0px 2px ${color.bg}, 0px 0px 0px 4px ${color.text}`,
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Button
            title="Undo"
            kind="quiet"
            onPress={() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))}
            disabled={history.length < 2}
          />
          <Button
            title="Clear All"
            kind="quiet"
            onPress={() => push([])}
            disabled={draft.length === 0}
          />
        </View>
        <Field label="Caption (optional)" value={caption} onChangeText={setCaption} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VideoBox({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls
      contentFit="contain"
    />
  );
}

function Transcript({ media }: { media: Media }) {
  const text =
    media.transcript_status === "done"
      ? media.transcript
        ? `“${media.transcript}”`
        : "(No speech heard.)"
      : media.transcript_status === "pending"
        ? "Transcribing…"
        : media.transcript_status === "failed"
          ? "Transcription failed. The office can retry it."
          : media.upload_state === "uploaded"
            ? "Not transcribed yet."
            : "Transcribed after the recording uploads.";
  return (
    <T
      variant="secondary"
      muted={media.transcript_status !== "done"}
      style={media.transcript_status === "done" ? { fontStyle: "italic" } : undefined}
    >
      {text}
    </T>
  );
}

const styles = StyleSheet.create({
  // The viewer's black: the navy token's darkest use, or black for photos (spec 6.5).
  screen: { flex: 1, backgroundColor: "black" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { flex: 1 },
  topBar: { position: "absolute", left: 0, right: 0, top: 0 },
  bar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space["2"],
  },
  barSide: { flex: 1, flexDirection: "row" },
  barTitle: { maxWidth: "55%", textAlign: "center" },
  barButton: { minHeight: minTap, justifyContent: "center", paddingHorizontal: space["2"] },
  barIcon: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    borderTopLeftRadius: shape.sheet,
    borderTopRightRadius: shape.sheet,
    maxHeight: "45%",
  },
  panelContent: { padding: space["4"], gap: space["3"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space["3"] },
  editor: { flex: 1 },
  canvasArea: { flex: 1, alignItems: "center", justifyContent: "center", padding: space["2"] },
  tools: { flexGrow: 0, maxHeight: "48%" },
  toolsContent: { padding: space["4"], gap: space["4"] },
  colorRow: { flexDirection: "row", alignItems: "center", gap: space["2"], flexWrap: "wrap" },
  colors: { flexDirection: "row", gap: space["2"] },
  swatchHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
