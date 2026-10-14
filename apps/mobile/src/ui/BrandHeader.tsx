import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, space } from "./theme";

const logo = require("../../../../brand/logo/png/logo-reverse-1200.png");

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

const styles = StyleSheet.create({
  header: { backgroundColor: color.header },
  inner: { paddingHorizontal: space["5"], paddingVertical: space["6"] },
  logo: { width: 214, height: 62 },
});
