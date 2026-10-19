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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MEDIA_KIND_LABELS,
  formatSchedule,
  parseMarkup,
  type Markup,
  type MarkupShape,
  type Media,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRow } from "../../../../../data/hooks";
import { useMediaSource, type MediaSourceState } from "../../../../../data/media";
import { useCompany, useSession } from "../../../../../state/session";
import { Button, Field, T } from "../../../../../ui/components";
import { AudioRow, useAttachedTo } from "../../../../../features/media/MediaSection";
import { confirmDeleteMedia } from "../../../../../features/media/remove";
import { Glass } from "../../../../../ui/Glass";
import { haptics } from "../../../../../ui/haptics";
import { MarkupEditor } from "../../../../../features/media/MarkupEditor";
import { MarkupLayer } from "../../../../../ui/MarkupLayer";
import { color, face, ios, minTap, shape, space, type } from "../../../../../ui/theme";
import { WebIcon } from "../../../../../ui/WebIcon";

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
            ratio={media.width && media.height ? media.height / media.width : 0.75}
            background={(w, h) => (
              <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="contain" />
            )}
            saved={saved}
            caption={media.caption ?? ""}
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
});
