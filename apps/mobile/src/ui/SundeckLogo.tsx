import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LOGO_DARK, LOGO_LIGHT, LOGO_SIZE } from "./sundeckLogoArt";
import { appearance } from "./theme";

// The horizontal Sundeck Pro logo (drop pin and wordmark) at the left of the navigation bar on
// each tab's own page: Today, Jobs, Schedule, Messages, More (owner, 2026-10-21: "Incorporate
// this logo with the text in the top left of each main page on the app"), level with the "+",
// 28 tall so the bar stays 44; the large title has its own full-width row under it (owner,
// 2026-10-21: it was squeezed beside the logo). Pushed pages keep Back there. Vector paths generated from brand/logo (brand/scripts/export_logo_code.mjs), the
// reverse lockup in dark mode. Same as the website's phone bar and the Swift app.

/** The lockup, `height` points tall. Screen readers read it once as "Sundeck Pro". */
export function SundeckLogo({ height = 28 }: { height?: number }) {
  const scheme = useSyncExternalStore(appearance.subscribe, () => appearance.scheme);
  const layers = scheme === "dark" ? LOGO_DARK : LOGO_LIGHT;
  const width = (height * LOGO_SIZE.width) / LOGO_SIZE.height;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Sundeck Pro" style={styles.box}>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${LOGO_SIZE.width} ${LOGO_SIZE.height}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {layers.map((l, i) => (
          <Path key={i} d={l.d} fill={l.fill} fillRule={l.evenOdd ? "evenodd" : "nonzero"} />
        ))}
      </Svg>
    </View>
  );
}

/** The navigation bar's left item on a tab's root screen (TabStack). */
export function BrandHeaderLeft() {
  return <SundeckLogo />;
}

const styles = StyleSheet.create({
  // A little in from the bar's edge, like Back's chevron.
  box: { paddingLeft: 8, justifyContent: "center" },
});
