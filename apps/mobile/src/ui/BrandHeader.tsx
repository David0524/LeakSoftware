import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { T } from "./components";
import { color, ios, space } from "./theme";

const logo = require("../../../../brand/logo/png/logo-reverse-1200.png");
const mark = require("../../../../brand/logo/png/mark-512.png");

/** Android sign-in screens: the reverse logo on a navy band. */
export function BrandHeader() {
  return (
    <SafeAreaView edges={["top"]} style={styles.header}>
      {/* White status bar text on the navy band, while this screen is showing. */}
      <StatusBar style="light" />
      <View style={styles.inner}>
        <Image
          source={logo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Tidemark"
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * The top of the sign-in, sign-up, and setup screens. iPhone: the Tidemark mark centered over
 * a large title, on the page's gray, as Apple's own sign-in screens are. Android: the title
 * alone (the screen shows BrandHeader above it).
 */
export function AuthTitle({ title }: { title?: string }) {
  if (!ios) return title ? <T variant="title">{title}</T> : null;
  return (
    <View style={styles.hero}>
      <Image source={mark} style={styles.mark} resizeMode="contain" accessibilityLabel="Tidemark" />
      {title ? (
        <View accessibilityRole="header">
          <T variant="largeTitle" style={styles.heroTitle}>
            {title}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: color.header },
  inner: { paddingHorizontal: space["5"], paddingVertical: space["6"] },
  logo: { width: 214, height: 62 },
  hero: {
    alignItems: "center",
    gap: space["4"],
    paddingTop: space["6"],
    paddingBottom: space["2"],
  },
  // The mark is 512 × 749.
  mark: { height: 72, width: 72 * (512 / 749) },
  heroTitle: { textAlign: "center" },
});
