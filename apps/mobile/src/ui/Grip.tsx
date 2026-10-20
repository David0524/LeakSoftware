import { StyleSheet, View } from "react-native";
import { color, minTap, tint } from "./theme";

/**
 * Six dots at a card's trailing edge: it can be dragged (owner, 2026-10-20: "Schedule
 * dragging should be on the right side of the card"). Decoration only; the whole card takes
 * the touch and hold, and Move… stays the visible alternative.
 */
export function Grip({ width = minTap }: { width?: number }) {
  return (
    <View
      style={[styles.grip, { width }]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.row}>
          {[0, 1].map((c) => (
            <View key={c} style={[styles.dot, { backgroundColor: tint(color.textMuted, 0.7) }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grip: { height: minTap, alignItems: "center", justifyContent: "center", gap: 4 },
  row: { flexDirection: "row", gap: 4 },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
});
