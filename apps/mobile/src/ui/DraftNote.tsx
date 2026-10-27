import { Pressable, StyleSheet, Text, View } from "react-native";
import { DISCARD_DRAFT_LABEL, DRAFT_NOTE } from "@leakbook/core";
import type { DraftHandle } from "./useDraft";
import { color, face, minTap, shape, space, type } from "./theme";

/**
 * "Draft restored" with Discard Draft (owner, 2026-10-27): shown at the top of a form whose
 * typed text came back from a draft. Quiet: a gray grouped row, not a banner.
 */
export function DraftNote({ draft }: { draft: Pick<DraftHandle, "restored" | "discard"> }) {
  if (!draft.restored) return null;
  return (
    <View style={styles.row} accessibilityRole="summary">
      <Text style={[type.secondary, { color: color.textMuted }]} maxFontSizeMultiplier={1.6}>
        {DRAFT_NOTE}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={draft.discard}
        hitSlop={4}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.5 }]}
      >
        <Text
          style={[type.secondary, face.semiBold, { color: color.link }]}
          maxFontSizeMultiplier={1.6}
        >
          {DISCARD_DRAFT_LABEL}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: minTap,
    paddingLeft: space["4"],
    paddingRight: space["1"],
    borderRadius: shape.card,
    backgroundColor: color.surface,
  },
  button: { minHeight: minTap, paddingHorizontal: space["3"], justifyContent: "center" },
});
