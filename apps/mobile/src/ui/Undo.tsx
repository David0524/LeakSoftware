import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { createUndoWindow } from "../lib/undo";
import { Button } from "./components";
import { haptics } from "./haptics";
import { color, MAX_TEXT_SCALE, minTap, space, type } from "./theme";

interface Shown {
  text: string;
  revert: () => void;
}

/**
 * Undo after Mark Remaining (owner, 2026-10-20: one-handed use, item 5). The change is already
 * saved; `start` shows the text and Undo for five seconds, `undo` closes them and runs the
 * revert.
 */
export function useUndoWindow() {
  const [shown, setShown] = useState<Shown | null>(null);
  const win = useMemo(
    () =>
      createUndoWindow((open) => {
        if (!open) setShown(null);
      }),
    [],
  );
  useEffect(() => () => win.close(), [win]);
  return {
    shown,
    start(text: string, revert: () => void) {
      win.start();
      setShown({ text, revert });
      AccessibilityInfo.announceForAccessibility(`${text}. Undo is available for 5 seconds.`);
    },
    undo() {
      const now = shown;
      win.close();
      setShown(null);
      now?.revert();
      haptics.light();
    },
  };
}

/** "Marked 3" in secondary text and an Undo pill, in the place of the button. */
export function UndoRow({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Text
        style={[type.secondary, { color: color.textMuted }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {text}
      </Text>
      <Button title="Undo" kind="secondary" accessibilityLabel={`Undo, ${text}`} onPress={onUndo} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space["3"], minHeight: minTap },
});
