import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSyncStatus } from "../data/hooks";
import { color, face, space } from "./theme";

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
 * space (Settings still shows the full sync state). Tapping it opens Settings for details.
 */
export function SyncBar({
  onPress,
  inset = false,
}: {
  onPress: () => void;
  /** iPhone: a rounded row at the top of the inset grouped list instead of a full-width bar. */
  inset?: boolean;
}) {
  const s = useSyncStatus();
  const waiting = s.pending > 0 || s.uploads.waiting > 0;
  const healthy =
    s.problems.length === 0 &&
    !s.storageLow &&
    s.lastSyncedAt != null &&
    !waiting &&
    (s.phase === "idle" || s.phase === "syncing");
  if (healthy) return null;
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
    label = "Syncing…";
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}`}
      onPress={onPress}
      style={[styles.bar, inset && styles.inset]}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.text} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    minHeight: 44,
  },
  inset: { borderBottomWidth: 0, borderRadius: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { ...face.medium, fontSize: 15, lineHeight: 20, color: color.text, flex: 1 },
});
