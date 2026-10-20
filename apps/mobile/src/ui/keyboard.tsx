import type { ReactNode } from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardToolbar,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { color, face, ios, type } from "./theme";

// The keyboard (owner, 2026-10-20: one-handed use, item 13): fields and sheet buttons stay
// above it on Android, which draws edge to edge (the window no longer shrinks for the
// keyboard), as on iPhone. react-native-keyboard-controller follows the keyboard on both, in
// screens and in drawn sheets (KeyboardProvider is in the root layout).

/** Height of the iPhone keyboard bar (Previous, Next, Done) over the keyboard. */
export const KEYBOARD_BAR_HEIGHT = 42;

/**
 * Pads its content up by the keyboard's height while it is open, so the last field and a bar
 * pinned at the bottom (Save) sit just above it. The same on iPhone and Android.
 */
export function KeyboardAvoider({
  style,
  pointerEvents,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  /** "box-none" lets taps beside the content reach what's under it (a sheet's scrim). */
  pointerEvents?: "box-none" | "auto";
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={style ?? styles.flex}
      pointerEvents={pointerEvents}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/** Whether the keyboard is open (the Next Step bar hides meanwhile). */
export function useKeyboardOpen(): boolean {
  return useKeyboardState((s) => s.isVisible);
}

/**
 * The keyboard bar on iPhone (item 3): Previous and Next move through the screen's fields in
 * order, Done closes the keyboard. Android uses the keyboard's own Return key (each field's
 * `next`), so this draws nothing there.
 */
export function FormKeyboardBar() {
  if (!ios) return null;
  const label = (text: string, strong = false) => (
    <Text
      style={[type.body, strong && face.semiBold, { color: color.link }]}
      maxFontSizeMultiplier={1.4}
    >
      {text}
    </Text>
  );
  return (
    <KeyboardToolbar>
      <KeyboardToolbar.Prev style={styles.key}>{label("Previous")}</KeyboardToolbar.Prev>
      <KeyboardToolbar.Next style={styles.key}>{label("Next")}</KeyboardToolbar.Next>
      <KeyboardToolbar.Done text={label("Done", true)} />
    </KeyboardToolbar>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, key: { paddingHorizontal: 8 } });
