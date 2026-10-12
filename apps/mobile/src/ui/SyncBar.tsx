import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSyncStatus } from "../data/hooks";
import { color, font, space } from "./theme";

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function files(n: number, allPhotos: boolean): string {
  const noun = allPhotos ? "photo" : "file";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** One-line sync state under the header. Tapping it opens Settings for details. */
export function SyncBar({ onPress }: { onPress: () => void }) {
  const s = useSyncStatus();
  let dot: string = color.pass;
  let label = s.lastSyncedAt
    ? `All changes saved to the office · ${ago(s.lastSyncedAt)}`
    : "Not synced yet";

  if (s.problems.length > 0) {
    dot = color.fail;
    label = `${s.problems.length} change${s.problems.length === 1 ? "" : "s"} could not be saved · tap for details`;
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
        ? `Offline · ${saved.join(" and ")} saved on this phone`
        : "Offline · working from this phone";
  } else if (s.phase === "signed_out") {
    dot = color.warning;
    label = "Sign in again to sync";
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
      style={styles.bar}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.text} numberOfLines={1}>
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
    minHeight: 36,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { fontFamily: font.bodyMedium, fontSize: 14, color: color.text, flex: 1 },
});
