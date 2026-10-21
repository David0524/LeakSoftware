import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { downloadProgress } from "@leakbook/core";
import { useSyncStatus } from "../data/hooks";
import type { SyncStatus } from "../lib/sync-service";
import { SYNC_NOTE_DELAY_MS, quietWaiting, syncNoteDueAt } from "../lib/syncNote";
import { BAR_HEIGHT } from "./Bar";
import { Chevron } from "./components";
import {
  color,
  drawnChrome,
  gutter,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tint,
  type,
} from "./theme";

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function files(n: number, allPhotos: boolean): string {
  if (allPhotos) return `${n} photo${n === 1 ? "" : "s"}`;
  return `${n} photo${n === 1 ? "" : "s"} and recording${n === 1 ? "" : "s"}`;
}

/**
 * One-line sync state under the header, shown only when something needs attention: offline,
 * changes or files waiting, problems, or signed out. When everything is saved it takes no
 * space (More › Sync still shows the full sync state). Tapping it opens More › Sync.
 */
export function SyncBar({
  onPress,
}: {
  onPress: () => void;
  /** @deprecated The bar is a capsule on every platform now. */
  inset?: boolean;
}) {
  const { label, dot, healthy } = useSyncBarSummary();
  if (healthy) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}`}
      accessibilityHint="Opens Sync"
      onPress={onPress}
      style={({ pressed }) => [styles.bar, { backgroundColor: tint(dot, pressed ? 0.18 : 0.1) }]}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text
        style={[type.secondary, { color: color.text, flex: 1 }]}
        numberOfLines={2}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {label}
      </Text>
      <Chevron />
    </Pressable>
  );
}

/**
 * The sync bar pinned under the navigation bar (owner, 2026-10-20: one-handed use, item 12), so
 * "Offline · 3 changes on this phone" stays in view on Today and the job page instead of
 * scrolling away. It still hides when everything is saved. On the drawn bar (Android) it
 * floats under the bar and the page starts below it (`height`); on iPhone, where the native
 * large title sits there, it stays the first thing in the page (`inline`).
 */
export function usePinnedSyncBar(onPress: () => void): {
  overlay: ReactNode;
  inline: ReactNode;
  height: number;
} {
  const insets = useSafeAreaInsets();
  const { healthy } = useSyncBarSummary();
  const [measured, setMeasured] = useState(0);
  if (!drawnChrome) return { overlay: null, inline: <SyncBar onPress={onPress} />, height: 0 };
  if (healthy) return { overlay: null, inline: null, height: 0 };
  return {
    overlay: (
      <View
        pointerEvents="box-none"
        onLayout={(e) => setMeasured(e.nativeEvent.layout.height)}
        style={[styles.pinned, { top: insets.top + BAR_HEIGHT, backgroundColor: color.bg }]}
      >
        <SyncBar onPress={onPress} />
      </View>
    ),
    inline: null,
    height: measured,
  };
}

/**
 * The bar's summary: changes and files waiting under 8 seconds don't show (owner, 2026-10-20;
 * lib/syncNote.ts), so a quick sync doesn't flash the bar. Anything else it would say (offline,
 * problems) shows at once, with the real counts.
 */
function useSyncBarSummary(): ReturnType<typeof syncSummary> {
  const status = useSyncStatus();
  const since = status.waitingSince;
  // The waiting spell whose 8 seconds have passed (a bar mounted late shows it at once).
  const [shownFor, setShownFor] = useState<number | null>(() =>
    since != null && syncNoteDueAt(status, Date.now()) == null ? since : null,
  );
  useEffect(() => {
    if (since == null) return;
    const timer = setTimeout(
      () => setShownFor(since),
      Math.max(0, since + SYNC_NOTE_DELAY_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [since]);
  const held = since != null && shownFor !== since;
  const quiet = held ? syncSummary(quietWaiting(status)) : null;
  return quiet?.healthy ? quiet : syncSummary(status);
}

/**
 * The sync state in words with its tone color (the bar's dot). `healthy` when everything is
 * saved, so the bar hides; More › Sync still shows the words.
 */
export function syncSummary(s: SyncStatus): { label: string; dot: string; healthy: boolean } {
  const waiting = s.pending > 0 || s.uploads.waiting > 0;
  const healthy =
    s.problems.length === 0 &&
    !s.storageLow &&
    s.lastSyncedAt != null &&
    !waiting &&
    (s.phase === "idle" || s.phase === "syncing");
  let dot: string = color.pass;
  let label = s.lastSyncedAt
    ? `All changes saved to the office · ${ago(s.lastSyncedAt)}`
    : "Not synced yet";

  if (s.problems.length > 0) {
    dot = color.fail;
    label = `${s.problems.length} change${s.problems.length === 1 ? "" : "s"} could not be saved · tap for details`;
  } else if (s.storageLow) {
    dot = color.fail;
    label = "Phone storage almost full · free up space so new work saves";
  } else if (s.phase === "syncing") {
    dot = color.info;
    // A new phone's first download runs behind the app (owner, 2026-10-21): how far along.
    const percent =
      !s.initialSyncDone && s.download
        ? downloadProgress(s.download.pulled, s.download.totals).percent
        : "";
    label = s.initialSyncDone
      ? "Syncing…"
      : percent
        ? `Downloading your company · ${percent}`
        : "Downloading your company…";
  } else if (s.phase === "offline") {
    dot = color.warning;
    const saved = [
      s.pending > 0 ? `${s.pending} change${s.pending === 1 ? "" : "s"}` : null,
      s.uploads.waiting > 0 ? files(s.uploads.waiting, s.uploads.allPhotos) : null,
    ].filter(Boolean);
    label =
      saved.length > 0
        ? `Offline · ${saved.join(", ")} on this phone`
        : "Offline · working from this phone";
  } else if (s.phase === "signed_out") {
    dot = color.warning;
    label = "Sign in again to sync";
  } else if (s.phase === "read_only") {
    dot = color.warning;
    label = `Read-only: the shop’s Sundeck Pro subscription isn’t paid. ${s.pending} change${s.pending === 1 ? "" : "s"} kept on this phone`;
  } else if (s.phase === "error") {
    dot = color.fail;
    label = "Sync failed · will retry";
  } else if (s.pending > 0) {
    dot = color.warning;
    label = `${s.pending} change${s.pending === 1 ? "" : "s"} waiting to sync`;
  } else if (s.uploads.waiting > 0) {
    dot = color.warning;
    label = `${files(s.uploads.waiting, s.uploads.allPhotos)} waiting to upload`;
  }

  return { label, dot, healthy };
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["4"],
    paddingRight: space["3"],
    paddingVertical: space["1"],
    borderRadius: shape.pill,
    minHeight: minTap,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pinned: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: gutter,
    paddingVertical: space["2"],
  },
});
