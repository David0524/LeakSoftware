import type { ReactNode } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../../ui/components";
import { KeyboardAvoider } from "../../ui/keyboard";
import { color, space } from "../../ui/theme";

const mark = require("../../../../../brand/logo/png/mark-512.png");

/**
 * The sign-in screens' frame (spec 5.13), the same on iPhone and Android: the page's gray, no
 * card and no navy band, the Sundeck Pro mark centered 32 from the top, the large title under
 * it, then a short intro, centered and muted.
 */
export function AuthFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    // Fields stay above the keyboard, edge to edge on Android too (owner, 2026-10-20).
    <KeyboardAvoider style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space["6"], paddingBottom: insets.bottom + space["7"] },
        ]}
      >
        <View style={styles.hero}>
          <Image
            source={mark}
            style={styles.mark}
            resizeMode="contain"
            accessibilityLabel="Sundeck Pro"
          />
          <T variant="largeTitle" style={styles.center}>
            {title}
          </T>
          {intro ? (
            typeof intro === "string" ? (
              <T muted style={styles.center}>
                {intro}
              </T>
            ) : (
              intro
            )
          ) : null}
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space["4"], width: "100%", maxWidth: 480, alignSelf: "center" },
  hero: { alignItems: "center", gap: space["1"] },
  // The mark is 512 × 749; shown 48 wide (70 tall), 16 above the title.
  mark: { width: 48, height: 70, marginBottom: space["4"] - space["1"] },
  center: { textAlign: "center" },
  body: { marginTop: space["5"], gap: space["4"] },
});
