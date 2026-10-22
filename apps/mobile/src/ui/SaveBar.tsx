import { useContext, useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, TabBarSpace } from "./components";
import { Glass } from "./Glass";
import { Icon } from "./Icon";
import { useKeyboardOpen } from "./keyboard";
import { MAX_TEXT_SCALE, color, face, shape, space, type } from "./theme";

// One Save for a whole settings page (owner, 2026-10-22: "Let's remove all the save buttons on
// that page and just have one floating one on the bottom"): the Next Step bar's floating glass
// (features/job/NextStepBar.tsx) with one Save pill. Save is dimmed until something changes,
// reads "Saving…" while it saves, and then "Saved." shows above it until the next change; a
// problem shows there instead. Hidden while the keyboard is open, as the Next Step bar is.
// Same on the iPhone (SaveBar.swift) and the website (settings-forms.tsx SaveBar).

/** What the last Save said: "Saved." or what went wrong. */
export interface SaveResult {
  text: string;
  error: boolean;
}

/** The bar's height with its status line, for the page's bottom room (SaveBarSpace). */
const BAR_HEIGHT = 44 + space["2"] * 2 + 32;
/** The floating tab bar under it: its 56 items, border, and 8 above. */
const TAB_BAR = 56 + 2 + 8;

/** Room at the end of the page, so its last row scrolls above the bar. */
export function SaveBarSpace() {
  return <View style={{ height: BAR_HEIGHT + space["2"] }} />;
}

export function SaveBar({
  changed,
  busy,
  result,
  onSave,
}: {
  changed: boolean;
  busy: boolean;
  result: SaveResult | null;
  onSave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  const inTabs = useContext(TabBarSpace) > 0;
  // "Saved." only while nothing has changed since; a problem until the next Save.
  const line = result && (result.error || !changed) ? result : null;
  useEffect(() => {
    if (result) AccessibilityInfo.announceForAccessibility(result.text);
  }, [result]);
  if (keyboard) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.layer,
        { bottom: Math.max(12, insets.bottom) + (inTabs ? TAB_BAR + space["2"] : 0) },
      ]}
    >
      <Glass style={styles.bar}>
        {line ? (
          <View style={styles.line} accessible accessibilityLiveRegion="polite">
            {line.error ? null : (
              <Icon name="saved" size={17} color={color.pass} weight="semibold" />
            )}
            <Text
              testID="save-bar-line"
              style={[
                type.secondary,
                face.semiBold,
                styles.lineText,
                { color: line.error ? color.fail : color.pass },
              ]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {line.text}
            </Text>
          </View>
        ) : null}
        <Button
          title={busy ? "Saving…" : "Save"}
          wide
          loading={busy}
          disabled={!changed}
          onPress={onSave}
        />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 12, right: 12 },
  bar: { borderRadius: shape.tabBar, padding: space["2"] },
  line: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space["1"],
    paddingHorizontal: space["2"],
    paddingBottom: space["1"],
  },
  lineText: { textAlign: "center", flexShrink: 1 },
});
