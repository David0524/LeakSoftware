import { StyleSheet, Text, View } from "react-native";
import { color, face, MAX_TEXT_SCALE, type } from "./theme";
import { WebIcon } from "./WebIcon";

/**
 * What keeps a job in place (the website's lock-tag.tsx): a small padlock and "Day locked",
 * "Time locked" or "Locked", or "Two techs" without one. 13 pt, muted.
 */
export function LockTag({ lock }: { lock: { label: string; icon: boolean } }) {
  return (
    <View style={styles.tag} accessible accessibilityLabel={lock.label}>
      {lock.icon ? <WebIcon name="lock" size={14} color={color.textMuted} strokeWidth={2} /> : null}
      <Text
        style={[type.footnote, face.semiBold, { color: color.textMuted }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {lock.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
});
