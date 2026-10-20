import { StyleSheet, Text, View } from "react-native";
import { NOT_ON_MAP } from "@leakbook/core";
import { color, face, MAX_TEXT_SCALE, space, type } from "./theme";
import { WebIcon } from "./WebIcon";

// A pool whose address wasn't found on the map (owner, 2026-10-20: "we need an indicator for
// when address doesn't register"), as the website's not-on-map.tsx: a warning row in the job's
// Pool group, and a short tag under an address.

/** The warning row: icon, "Not found on the map", and what it means. */
export function NotOnMapRow() {
  return (
    <View
      accessible
      accessibilityLabel={`${NOT_ON_MAP.title}. ${NOT_ON_MAP.detail}`}
      style={styles.row}
    >
      <WebIcon name="warning" size={20} color={color.warning} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[type.body, face.semiBold, { color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {NOT_ON_MAP.title}
        </Text>
        <Text
          style={[type.secondary, { color: color.textMuted }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {NOT_ON_MAP.detail}
        </Text>
      </View>
    </View>
  );
}

/** The short form under an address: an icon and "Not on map". */
export function NotOnMapTag() {
  return (
    <View accessible accessibilityLabel={NOT_ON_MAP.title} style={styles.tag}>
      <WebIcon name="warning" size={16} color={color.warning} />
      <Text
        style={[type.footnote, face.semiBold, { color: color.warning }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {NOT_ON_MAP.short}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
  },
  tag: { flexDirection: "row", alignItems: "center", gap: space["1"], alignSelf: "flex-start" },
});
