import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { router } from "expo-router";
import { useEffect, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  MEDIA_KIND_LABELS,
  formatDuration,
  formatSchedule,
  parseMarkup,
  type Media,
} from "@leakbook/core";
import { useJobInspection } from "../../data/inspection";
import {
  forgetCapture,
  prepareLocation,
  recoverPendingCapture,
  rememberCapture,
  saveCapture,
  useJobMedia,
  useMediaSource,
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
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Empty, RoundButton, T } from "../../ui/components";
import { Icon } from "../../ui/Icon";
import { MarkupLayer } from "../../ui/MarkupLayer";
import { Select, useMenu } from "../../ui/Select";
import { useInSheet } from "../../ui/sheet";
import { color, face, MAX_TEXT_SCALE, shape, space, tabular } from "../../ui/theme";
import { WebIcon, type WebIconName } from "../../ui/WebIcon";
import { confirmDeleteMedia } from "./remove";
import { VoiceRecorder } from "./VoiceRecorder";

/** What a capture is attached to, in words ("Finding title", "Skimmer 1", "Test", "Job"). */
export function useAttachedTo(media: Media | undefined): string {
  const company = useCompany();
  const insp = useJobInspection(company.id, media?.job_id ?? "");
  if (!media) return "Job";
  return (
    (media.finding_id && insp.findings.find((f) => f.id === media.finding_id)?.title) ||
    (media.job_component_id && insp.componentById.get(media.job_component_id)?.label) ||
    (media.test_result_id ? "Test" : "Job")
  );
}

type Status = { text: string; tone: "muted" | "pass" | "fail" } | null;

/** What the job page's Next Step bar asks of the Photos section (the same captures). */
export interface MediaControls {
  photo: () => void;
  video: () => void;
}

/** "Attach to", per job, while the app is open (owner, 2026-10-20: it remembers). */
const lastAttachTo = new Map<string, string>();

/**
 * Photos, videos, and voice notes (spec 5.4 Photos): the capture card (Attach to, then the
 * Add Photo, Add Video and Voice Note tiles and a status line), then the captures. `layout`
 * "cards" is the job's Photos section (a card per capture, newest first); "grid" is the small
 * version inside the Test and Finding sheets and the checklist item, thumbnails in rows of
 * four. Everything is saved on the phone first and uploads in the background.
 */
export function MediaSection({
  target,
  title,
  disabledReason,
  targets,
  layout = "grid",
  controls,
  beforeCapture,
  unsaved = false,
}: {
  target: MediaTarget;
  /** A section label over the grid ("Photos"). */
  title?: string;
  /** Shown instead of the tiles when captures cannot be attached yet. */
  disabledReason?: string;
  /** "finding:<id>" or "component:<id>" with a label, for "Attach to" (job Photos only). */
  targets?: { value: string; label: string }[];
  layout?: "cards" | "grid";
  /** Filled in for the Next Step bar's Add Photo and Add Video. */
  controls?: RefObject<MediaControls | null>;
  /**
   * Runs before a capture (a test or finding not saved yet saves first, owner 2026-10-20).
   * Returns where the capture goes, or null to stop (the form shows its errors).
   */
  beforeCapture?: () => MediaTarget | null;
  /** The test or finding isn't saved yet, so nothing is attached to it. */
  unsaved?: boolean;
}) {
  const company = useCompany();
  const attached = useJobMedia(company.id, target.jobId, target);
  const media = unsaved ? [] : attached;
  const [attachTo, setAttachToState] = useState(
    () => (targets ? lastAttachTo.get(target.jobId) : undefined) ?? "",
  );
  const setAttachTo = (v: string) => {
    lastAttachTo.set(target.jobId, v);
    setAttachToState(v);
  };
  const [busy, setBusy] = useState<"photo" | "video" | null>(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const menu = useMenu();

  /** Where a new capture goes: the section's target, or the "Attach to" choice. */
  function captureTarget(): MediaTarget {
    const [kind, id] = attachTo.split(":");
    if (kind === "finding") return { jobId: target.jobId, findingId: id };
    if (kind === "component") return { jobId: target.jobId, componentId: id };
    return target;
  }

  async function save(
    file: CapturedFile,
    position: Promise<{ latitude: number; longitude: number } | null>,
    added: string,
    to: MediaTarget = captureTarget(),
  ): Promise<boolean> {
    try {
      await saveCapture(company.id, to, file, position);
      setStatus({ text: added, tone: "pass" });
      return true;
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), tone: "fail" });
      return false;
    }
  }

  /** Video asks: record a new one, or choose one already on the phone. */
  function chooseVideo() {
    menu.open({
      title: "Add Video",
      items: [
        { label: "Take Video", onPress: () => void capture("video", "camera") },
        { label: "Choose from Library", onPress: () => void capture("video", "library") },
      ],
    });
  }

  /**
   * Add Photo opens the camera straight away, and again after each photo until Cancel (owner,
   * 2026-10-20: one-handed use, item 10); Library is its own button.
   */
  async function capture(kind: "photo" | "video", source: "camera" | "library") {
    const to = beforeCapture ? beforeCapture() : captureTarget();
    if (!to) return;
    setBusy(kind);
    setStatus(null);
    // If Android closes the app while the camera or library is open, the next start saves the
    // capture here (data/media's recoverPendingCapture).
    rememberCapture({ companyId: company.id, target: to, kind, source });
    try {
      if (source === "library") {
        // Taken earlier, maybe elsewhere: where the phone is now isn't where it was taken.
        const file = await chooseFromLibrary(kind);
        if (file)
          await save(
            file,
            Promise.resolve(null),
            kind === "photo" ? "Photo added." : "Video added.",
            to,
          );
        return;
      }
      await askLocationOnce();
      let taken = 0;
      for (;;) {
        const position = currentPosition();
        const file = await captureWithCamera(kind);
        if (!file) break;
        taken++;
        const saved = await save(
          file,
          position,
          kind === "video"
            ? "Video added."
            : taken === 1
              ? "Photo added."
              : `${taken} photos added.`,
          to,
        );
        // Photos keep the camera open for the next one; a video is one at a time. A photo that
        // couldn't be saved (phone full) stops here, so its message isn't hidden by the camera.
        if (kind === "video" || !saved) break;
      }
    } catch (e) {
      const title = kind === "photo" ? "Couldn’t take the photo" : "Couldn’t record the video";
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof MediaError && e.needsSettings) {
        Alert.alert(title, message, [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else setStatus({ text: message, tone: "fail" });
    } finally {
      forgetCapture();
      setBusy(null);
    }
  }

  // The Next Step bar's Add Photo and Add Video do the same as the tiles.
  useEffect(() => {
    if (!controls) return;
    controls.current = { photo: () => void capture("photo", "camera"), video: chooseVideo };
  });

  const captureCard = (
    <Card padding={space["4"]} style={{ gap: space["3"] }}>
      {disabledReason ? (
        <T muted>{disabledReason}</T>
      ) : (
        <>
          {targets?.length ? (
            <Select
              label="Attach to"
              options={[{ value: "", label: "Whole job" }, ...targets]}
              value={attachTo}
              onChange={setAttachTo}
            />
          ) : null}
          {recording ? (
            <VoiceRecorder
              onSaved={async (file) => {
                await save(file, prepareLocation(), "Voice note added.");
              }}
              onClose={() => setRecording(false)}
            />
          ) : (
            <View style={styles.tiles}>
              <Tile
                icon="cameraTile"
                label="Add Photo"
                busy={busy === "photo"}
                disabled={busy !== null}
                onPress={() => void capture("photo", "camera")}
              />
              <Tile
                icon="photos"
                label="Library"
                accessibilityLabel="Choose Photo from Library"
                disabled={busy !== null}
                onPress={() => void capture("photo", "library")}
              />
              <Tile
                icon="video"
                label="Add Video"
                busy={busy === "video"}
                disabled={busy !== null}
                onPress={chooseVideo}
              />
              <Tile
                icon="mic"
                label="Voice Note"
                accessibilityLabel="Record Voice Note"
                disabled={busy !== null}
                onPress={() => {
                  setStatus(null);
                  setRecording(true);
                }}
              />
            </View>
          )}
          {status ? (
            <View accessibilityLiveRegion="polite">
              <T
                variant="secondary"
                muted={status.tone === "muted"}
                style={
                  status.tone === "pass"
                    ? { color: color.pass }
                    : status.tone === "fail"
                      ? { color: color.fail }
                      : undefined
                }
              >
                {status.text}
              </T>
            </View>
          ) : null}
        </>
      )}
      {menu.element}
    </Card>
  );

  if (layout === "cards")
    return (
      <View style={{ gap: space["4"] }}>
        {captureCard}
        {media.length === 0 ? (
          <Empty>No photos or recordings yet.</Empty>
        ) : (
          media.map((m) => <MediaCard key={m.id} media={m} />)
        )}
      </View>
    );

  return (
    <View style={{ gap: space["2"] }}>
      {title ? <T variant="sectionLabel">{title}</T> : null}
      {captureCard}
      {media.length > 0 ? <Thumbs media={media} /> : null}
    </View>
  );
}

/** A capture tile: 56 tall, radius 16, link-tinted, the icon over the label. */
function Tile({
  icon,
  label,
  onPress,
  busy = false,
  disabled = false,
  accessibilityLabel,
}: {
  icon: WebIconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? color.tintedPressed : color.iconTint },
        disabled && !busy && { opacity: 0.5 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color.link} />
      ) : (
        <WebIcon name={icon} size={24} color={color.link} />
      )}
      <Text
        style={[styles.tileText, { color: color.link }]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One capture as a card (spec 5.4): the photo, video or voice note, its details, actions. */
function MediaCard({ media }: { media: Media }) {
  const company = useCompany();
  const { services } = useSession();
  const more = useMenu();
  const source = useMediaSource(media);
  const attached = useAttachedTo(media);
  const kind = MEDIA_KIND_LABELS[media.kind];
  const shapes = parseMarkup(media.markup).shapes;
  const open = (markup = false) =>
    router.push(`/jobs/${media.job_id}/media/${media.id}${markup ? "?markup=1" : ""}`);
  const when = media.captured_at
    ? formatSchedule(media.captured_at, new Date(), company.timezone)
    : "";
  const meta = [
    when,
    media.latitude != null ? "location recorded" : null,
    media.upload_state === "pending" ? "waiting to upload" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card padding={0} style={styles.mediaCard}>
      {source.state !== "ready" ? (
        <Pressable
          onPress={() => open()}
          accessibilityRole="button"
          accessibilityLabel={`Open ${kind.toLowerCase()}`}
          style={[styles.missing, { backgroundColor: color.bg }]}
        >
          {source.state === "loading" ? (
            <ActivityIndicator color={color.textMuted} />
          ) : (
            <T muted style={{ textAlign: "center" }}>
              {media.upload_state === "pending"
                ? `${kind} still uploading from the phone`
                : `${kind} downloads when you have a connection`}
            </T>
          )}
        </Pressable>
      ) : media.kind === "photo" ? (
        <CardPhoto media={media} uri={source.uri!} shapes={shapes} onPress={() => open()} />
      ) : media.kind === "video" ? (
        <Pressable
          onPress={() => open()}
          accessibilityRole="button"
          accessibilityLabel={`Play video${media.duration_ms ? `, ${formatDuration(media.duration_ms)}` : ""}`}
          style={[styles.video, { backgroundColor: color.navy }]}
        >
          <View style={[styles.playBig, { backgroundColor: color.scrim }]}>
            <Icon name="play" size={28} color={color.paper} />
          </View>
        </Pressable>
      ) : (
        <AudioRow uri={source.uri!} durationMs={media.duration_ms} />
      )}
      <View style={styles.cardBody}>
        <T variant="secondary" style={face.medium}>
          {`${kind} · ${attached}${media.duration_ms ? ` · ${formatDuration(media.duration_ms)}` : ""}`}
        </T>
        {media.caption ? <T variant="secondary">{media.caption}</T> : null}
        {media.kind === "audio" && media.transcript ? (
          <T variant="secondary" style={{ fontStyle: "italic", marginTop: 4 }}>
            {`“${media.transcript}”`}
          </T>
        ) : null}
        {meta ? (
          <T variant="secondary" muted>
            {meta}
          </T>
        ) : null}
        <View style={styles.cardActions}>
          {media.kind === "photo" ? (
            <Button
              title={shapes.length ? "Edit Markup" : "Mark Up"}
              kind="secondary"
              disabled={source.state !== "ready"}
              onPress={() => open(true)}
            />
          ) : null}
          {/* Delete sits behind More, away from Mark Up (owner, 2026-10-20), still confirmed. */}
          <View style={{ marginLeft: "auto" }}>
            <RoundButton
              icon="more"
              label={`More for this ${kind.toLowerCase()}`}
              onPress={() =>
                more.open({
                  items: [
                    {
                      label: `Delete ${kind}`,
                      destructive: true,
                      onPress: () => confirmDeleteMedia(services.sync, media.company_id, media),
                    },
                  ],
                })
              }
            />
          </View>
        </View>
        {more.element}
      </View>
    </Card>
  );
}

/** The photo at 4:3 (or its own shape), its markup drawn over it; tap for the viewer. */
function CardPhoto({
  media,
  uri,
  shapes,
  onPress,
}: {
  media: Media;
  uri: string;
  shapes: ReturnType<typeof parseMarkup>["shapes"];
  onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  const ratio = media.width && media.height ? media.height / media.width : 0.75;
  const height = width * ratio;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={media.caption ?? (shapes.length ? "Photo with markup" : "Photo")}
      accessibilityHint="Opens the photo"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: "100%", aspectRatio: 1 / ratio, backgroundColor: color.navy }}
    >
      {width > 0 ? (
        <>
          <Image source={{ uri }} style={{ width, height }} resizeMode="cover" />
          <MarkupLayer shapes={shapes} width={width} height={height} scale={width / 400} />
        </>
      ) : null}
    </Pressable>
  );
}

/** A voice note's player row: play or pause, and the time. */
export function AudioRow({ uri, durationMs }: { uri: string; durationMs: number | null }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  // Voice notes play even with the ringer switch on silent.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  }, []);
  const playing = status.playing;
  return (
    <View style={styles.audio}>
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
        style={({ pressed }) => [
          styles.play,
          { backgroundColor: pressed ? color.tintedPressed : color.iconTint },
        ]}
      >
        <Icon name={playing ? "pause" : "play"} size={22} color={color.link} />
      </Pressable>
      <T style={tabular}>
        {`${formatDuration(status.currentTime * 1000)} / ${formatDuration(durationMs ?? status.duration * 1000)}`}
      </T>
    </View>
  );
}

const PER_ROW = 4;

/** Small thumbnails for the sheets and the checklist item: four to a row. */
function Thumbs({ media }: { media: Media[] }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const perRow = fontScale >= 1.6 ? 3 : PER_ROW;
  const size = width > 0 ? Math.floor((width - space["2"] * (perRow - 1)) / perRow) : 0;
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {size > 0 ? media.map((m) => <Thumb key={m.id} media={m} size={size} />) : null}
    </View>
  );
}

function Thumb({ media, size }: { media: Media; size: number }) {
  const { services } = useSession();
  // Inside the Test or Finding sheet, the capture opens in the sheet's own stack.
  const inSheet = useInSheet();
  const source = useMediaSource(media);
  const uri = source.uri;
  const markup = parseMarkup(media.markup);
  const label = `${MEDIA_KIND_LABELS[media.kind]}${media.duration_ms ? `, ${formatDuration(media.duration_ms)}` : ""}${media.upload_state === "pending" ? ", waiting to upload" : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: "delete", label: "Delete" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "delete")
          confirmDeleteMedia(services.sync, media.company_id, media);
      }}
      onPress={() =>
        router.push(`/jobs/${media.job_id}/${inSheet ? "capture" : "media"}/${media.id}`)
      }
      style={({ pressed }) => [
        styles.thumb,
        { width: size, height: size, backgroundColor: color.navy },
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
          <WebIcon
            name={media.kind === "audio" ? "mic" : media.kind === "video" ? "video" : "cameraTile"}
            size={26}
            color={color.paper}
          />
          {media.duration_ms ? (
            <Text
              style={[styles.duration, { color: color.paper }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {formatDuration(media.duration_ms)}
            </Text>
          ) : null}
        </View>
      )}
      {media.upload_state === "pending" ? (
        <View style={[styles.badge, { backgroundColor: color.surface }]}>
          <Icon name="upload" size={14} color={color.navy} />
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
  tiles: { flexDirection: "row", gap: space["2"] },
  tile: {
    flex: 1,
    minHeight: 56,
    borderRadius: shape.block,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: space["1"],
    paddingVertical: 6,
    overflow: "hidden",
  },
  tileText: { ...face.semiBold, fontSize: 15, lineHeight: 18, textAlign: "center" },
  mediaCard: { overflow: "hidden", gap: 0 },
  missing: {
    width: "100%",
    aspectRatio: 4 / 3,
    alignItems: "center",
    justifyContent: "center",
    padding: space["4"],
  },
  video: { width: "100%", aspectRatio: 16 / 9, alignItems: "center", justifyContent: "center" },
  playBig: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { padding: space["3"], gap: 2 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: space["3"], marginTop: space["2"] },
  audio: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["3"],
    paddingTop: space["3"],
  },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  thumb: { borderRadius: 10, overflow: "hidden" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  duration: { ...face.semiBold, fontSize: 13, fontVariant: ["tabular-nums"] },
  badge: { position: "absolute", right: 4, bottom: 4, borderRadius: 12, padding: 3 },
});

/**
 * Mounted once while signed in: a photo or video taken while Android closed the app is saved
 * to the job, finding, item or test it was taken for, as if the camera had returned.
 */
export function RecoverCapture() {
  useEffect(() => {
    void recoverPendingCapture();
  }, []);
  return null;
}
