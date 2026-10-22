import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../ui/components";
import { Glass } from "../../ui/Glass";
import { useKeyboardOpen } from "../../ui/keyboard";
import { ReadyPop } from "../../ui/ReadyPop";
import { MAX_TEXT_SCALE, color, face, shape, space, type } from "../../ui/theme";

/** The bar's own height (a 44 pill and its padding), for the page's bottom room. */
export const NEXT_STEP_BAR_HEIGHT = 44 + space["2"] * 2;
/** The line over the buttons ("Everything's checked. Mark it complete."), for the bottom room. */
export const NEXT_STEP_NOTE_HEIGHT = 32;
/** The floating tab bar under it: its 56 items, border, and 8 above. */
const TAB_BAR = 56 + 2 + 8;

export interface NextStepButton {
  title: string;
  kind: "primary" | "secondary";
  onPress: () => void;
}

/**
 * The Next Step bar (owner, 2026-10-20: one-handed use, item 1): pinned at the bottom of the
 * job page directly above the tab bar, on the tab bar's glass (an iOS bottom toolbar, not a
 * floating button). One pill full width, or two side by side. Hidden when there's nothing to
 * offer and while the keyboard is open.
 */
export function NextStepBar({
  buttons,
  note = null,
}: {
  buttons: NextStepButton[];
  /**
   * A short line over the buttons when the first one is the last thing left (owner,
   * 2026-10-22: Complete Job once the checklist is all done); the button then scales in once.
   */
  note?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  if (buttons.length === 0 || keyboard) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { bottom: Math.max(12, insets.bottom) + TAB_BAR + space["2"] }]}
    >
      <Glass style={styles.bar}>
        {note ? (
          <Text
            testID="complete-ready"
            style={[type.secondary, face.semiBold, styles.note, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {note}
          </Text>
        ) : null}
        <View style={styles.row}>
          {buttons.map((b, i) => (
            <ReadyPop key={b.title} on={!!note && i === 0} style={styles.slot}>
              <Button title={b.title} kind={b.kind} wide onPress={b.onPress} />
            </ReadyPop>
          ))}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 12, right: 12 },
  bar: { borderRadius: shape.tabBar, padding: space["2"] },
  row: { flexDirection: "row", gap: space["2"] },
  slot: { flex: 1 },
  note: { textAlign: "center", paddingTop: space["1"], paddingBottom: space["2"] },
});
