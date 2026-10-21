import { useSyncExternalStore } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LOGO_DARK, LOGO_LIGHT, LOGO_SIZE } from "./sundeckLogoArt";
import { appearance } from "./theme";

// The horizontal Sundeck Pro logo (drop pin and wordmark) at the leading edge of the
// navigation bar on each tab's own page: Today, Jobs, Schedule, Messages, More. It sits below
// the status bar, level with the "+", 28 tall so the bar stays 44, with the large title on its
// own full-width row under the bar. As the page scrolls it stays in the bar and collapses to
// the pin mark: the wordmark fades out over the first 30 points (owner, 2026-10-21: "It needs
// to sit below the time. Then just the logo (not the text) should slide down with the page on
// that top banner"). Vector paths generated from brand/logo
// (brand/scripts/export_logo_code.mjs), the reverse lockup in dark mode. Same as the website's
// phone bar and the Swift app.

/** How far the wordmark takes to fade out as the page scrolls, in points. */
export const WORDMARK_FADE = 30;
/** The pin mark is the lockup's first 100 units (the same art as brand/logo/sundeck-mark.svg). */
const MARK_WIDTH = 100;

function Art({ height, from, to }: { height: number; from: number; to: number }) {
  const scheme = useSyncExternalStore(appearance.subscribe, () => appearance.scheme);
  const layers = scheme === "dark" ? LOGO_DARK : LOGO_LIGHT;
  return (
    <Svg
      width={(height * (to - from)) / LOGO_SIZE.height}
      height={height}
      viewBox={`${from} 0 ${to - from} ${LOGO_SIZE.height}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {layers.map((l, i) => (
        <Path key={i} d={l.d} fill={l.fill} fillRule={l.evenOdd ? "evenodd" : "nonzero"} />
      ))}
    </Svg>
  );
}

/**
 * The bar's logo on a tab's own page, `height` points tall. `y` is the page's scroll: past
 * WORDMARK_FADE only the pin mark shows. The mark sets the layout's width, so the faded
 * wordmark never pushes the small title. Screen readers read it once as "Sundeck Pro".
 */
export function BarLogo({ y, height = 28 }: { y?: Animated.Value; height?: number }) {
  const opacity = y
    ? y.interpolate({ inputRange: [0, WORDMARK_FADE], outputRange: [1, 0], extrapolate: "clamp" })
    : 1;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Sundeck Pro"
      style={styles.box}
      testID="bar-logo"
    >
      <Art height={height} from={0} to={MARK_WIDTH} />
      <Animated.View pointerEvents="none" style={[styles.wordmark, { opacity }]}>
        <Art height={height} from={MARK_WIDTH} to={LOGO_SIZE.width} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A little in from the bar's edge, like Back's chevron.
  box: { paddingLeft: 8, flexDirection: "row", alignItems: "center", overflow: "visible" },
  // Right after the mark, outside the layout's width.
  wordmark: { position: "absolute", left: "100%", top: 0, bottom: 0, justifyContent: "center" },
});
