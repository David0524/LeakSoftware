import { StyleSheet, Text, View } from "react-native";
import { WebIcon } from "./WebIcon";
import { color, font, tabular } from "./theme";

/**
 * A stop's place in the route on Today and the Schedule (owner, 2026-11-06: out of the bubble,
 * option B of five: "Big and black, like a Calendar day"): the number alone in Barlow
 * ExtraBold, blue while the stop is being worked, a green check once it's done. The 32 pt the
 * old circle took. Same as the website's StopNumber and the iPhone's StopNumberMark.
 */
export function StopNumber({
  n,
  done,
  current,
  small = false,
}: {
  n: number;
  done: boolean;
  /** In progress (Schedule) or the next stop (Today). */
  current: boolean;
  /** The narrower route and week cards' tiles. */
  small?: boolean;
}) {
  return (
    <View
      style={[styles.box, { width: small ? 24 : 32 }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {done ? (
        <WebIcon name="check" size={small ? 18 : 24} color={color.pass} strokeWidth={3} />
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
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  text: { fontFamily: font.displayExtraBold, fontSize: 26, lineHeight: 30 },
  textSmall: { fontFamily: font.displayExtraBold, fontSize: 20, lineHeight: 24 },
});
