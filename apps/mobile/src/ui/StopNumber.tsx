import { StyleSheet, Text, View } from "react-native";
import { WebIcon } from "./WebIcon";
import { color, font, tabular } from "./theme";

/**
 * A stop's place in the route on Today and the Schedule, out of its circle (owner, 2026-11-06:
 * "Take the stop numbers out of the bubble … Just the number and a thin line"): the number in
 * Barlow ExtraBold, then a hairline like a date column. A green check once the stop is done, the
 * number in blue while it's being worked. The same 32 pt as the old circle. Same as the
 * website's StopNumber and the iPhone's StopNumberMark.
 */
export function StopNumber({
  n,
  done,
  current,
  small = false,
  stretch = true,
}: {
  n: number;
  done: boolean;
  /** In progress (Schedule) or the next stop (Today). */
  current: boolean;
  /** A day's list tile in the narrower week and route cards. */
  small?: boolean;
  /** On: the line runs the tile's height (Schedule). Off: as tall as the number (Today). */
  stretch?: boolean;
}) {
  return (
    <View
      style={[styles.row, stretch && styles.stretch, { gap: small ? 6 : 8 }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={[styles.number, { width: small ? 20 : 23 }]}>
        {done ? (
          <WebIcon name="check" size={small ? 16 : 20} color={color.pass} strokeWidth={3} />
        ) : (
          <Text
            style={[
              small ? styles.textSmall : styles.text,
              tabular,
              { color: current ? color.link : color.text },
            ]}
            maxFontSizeMultiplier={1.6}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {n}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.line,
          { backgroundColor: color.separator },
          stretch ? styles.stretch : { height: 28 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  stretch: { alignSelf: "stretch" },
  number: { alignItems: "center", justifyContent: "center" },
  text: { fontFamily: font.displayExtraBold, fontSize: 22, lineHeight: 26 },
  textSmall: { fontFamily: font.displayExtraBold, fontSize: 17, lineHeight: 22 },
  line: { width: 1 },
});
