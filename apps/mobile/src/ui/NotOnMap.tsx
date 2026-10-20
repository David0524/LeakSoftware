import type { ReactNode } from "react";
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

/**
 * The short form, right after a stop's or a pool's address on the same line: just the warning
 * symbol (owner, 2026-10-20: "just put a little error symbol next to the address. Don't waste
 * space with text"), about the size of the text beside it. Screen readers hear "Not found on the
 * map". `lineHeight` is the address's, so the symbol sits centered on its first line.
 */
export function NotOnMapTag({
  size = 15,
  lineHeight,
  onWater = false,
}: {
  size?: number;
  lineHeight?: number;
  /** On Today's water-blue card: white instead of the warning color. */
  onWater?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={NOT_ON_MAP.title}
      testID="not-on-map-tag"
      style={[styles.tag, { height: lineHeight ?? size }]}
    >
      <WebIcon name="warning" size={size} color={onWater ? color.paper : color.warning} />
    </View>
  );
}

/**
 * An address with the not-on-map symbol right after it: the text takes what it needs and the
 * symbol follows on the same line.
 */
export function AddressLine({
  notOnMap,
  lineHeight,
  size,
  children,
}: {
  notOnMap: boolean;
  lineHeight: number;
  size?: number;
  children: ReactNode;
}) {
  if (!notOnMap) return <>{children}</>;
  return (
    <View style={styles.line}>
      <View style={styles.lineText}>{children}</View>
      <NotOnMapTag size={size} lineHeight={lineHeight} />
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
  tag: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  lineText: { flexShrink: 1, minWidth: 0 },
});
