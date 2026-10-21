import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LOGO_DARK, LOGO_LIGHT, LOGO_SIZE } from "./sundeckLogoArt";
import { appearance } from "./theme";

// The horizontal Sundeck Pro logo (drop pin and wordmark) on each tab's own page: Today,
// Jobs, Schedule, Messages, More (owner, 2026-10-21). It parks right above the large title, in
// the page, 28 tall and 6 above the title, and scrolls away with it (owner, 2026-10-21: "The
// logo needs to park over the title"); never in the bar. Vector paths generated from
// brand/logo (brand/scripts/export_logo_code.mjs), the reverse lockup in dark mode. Same as
// the website's phone pages and the Swift app.

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

const styles = StyleSheet.create({
  // Flush with the large title's leading edge.
  box: { justifyContent: "center" },
});
