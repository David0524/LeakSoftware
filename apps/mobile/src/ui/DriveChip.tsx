import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color, face, MAX_TEXT_SCALE, tabular } from "./theme";

// The drive to a stop as a chip (docs/design/2026-10-21-schedule-tile.md; owner, 2026-10-21: "I
// like the chip"): a small gray pill with a car and the minutes, "🚗 23", at the start of a
// stop tile's second line. TalkBack reads "23 minute drive". The website's drive-chip.tsx draws
// the same car.

const CAR_FILL =
  "M7.3 4.5h9.4c.8 0 1.5.5 1.8 1.2L20.4 10c.4.3.6.8.6 1.3V17a1 1 0 0 1-1 1h-1v1.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18H8.5v1.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V18H4a1 1 0 0 1-1-1v-5.7c0-.5.2-1 .6-1.3l1.9-4.3c.3-.7 1-1.2 1.8-1.2zM7.6 6.6 6.2 9.8h11.6l-1.4-3.2zM5.5 12.5v2.2h3v-2.2zM15.5 12.5v2.2h3v-2.2z";

export function DriveChip({ minutes }: { minutes: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`${minutes} minute drive`}
      style={[styles.chip, { backgroundColor: color.fill }]}
    >
      <Svg width={14} height={14} viewBox="0 0 24 24" fill={color.textMuted}>
        <Path d={CAR_FILL} fillRule="evenodd" />
      </Svg>
      <Text
        style={[styles.text, tabular, { color: color.textMuted }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {minutes}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  text: { ...face.semiBold, fontSize: 12, lineHeight: 16 },
});
