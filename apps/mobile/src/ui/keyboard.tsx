import { useEffect, useRef, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardEvents,
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

const focusListeners = new Set<() => void>();

/**
 * A field took focus. With the keyboard already open, moving to another field shows no keyboard
 * event, so the fields say so here and the open pages scroll it into view (`useOnFieldFocus`).
 */
export function noteFieldFocus() {
  for (const run of focusListeners) run();
}

/**
 * Calls `run` once the keyboard has opened and whenever a field takes focus (a moment later, once
 * the page has settled above the keyboard).
 */
function useOnFieldFocus(run: () => void) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    const later = () => setTimeout(() => latest.current(), 80);
    focusListeners.add(later);
    const shown = KeyboardEvents.addListener("keyboardDidShow", later);
    return () => {
      focusListeners.delete(later);
      shown.remove();
    };
  }, []);
}

/**
 * Scrolls a page just enough to bring the field being typed in above the keyboard (owner,
 * 2026-10-26: "keyboard covers input fields"). KeyboardAvoider shrinks the page, but a field that
 * was already near the bottom stays where it was, under the keyboard. Give the hook the page's
 * scroll view and call `onScroll` and `onLayout` from its handlers; `topCover` is the height of a
 * bar drawn over the top of the page. Nothing happens when the field is on another page.
 */
export function useKeepFieldVisible(scrollRef: { current: unknown }, topCover = 0) {
  const scrolledTo = useRef(0);
  const height = useRef(0);
  useOnFieldFocus(() => {
    const page = scrollRef.current as {
      getInnerViewRef?: () => unknown;
      scrollTo?: (o: { y: number; animated: boolean }) => void;
    } | null;
    const field = TextInput.State.currentlyFocusedInput?.();
    if (!page?.getInnerViewRef || !page.scrollTo || !field || height.current <= 0) return;
    try {
      // Relative to the page's content: a field on another page calls back as failed.
      field.measureLayout(
        page.getInnerViewRef() as never,
        (_x, y, _w, h) => {
          const margin = 24;
          const view = height.current;
          if (y + h > scrolledTo.current + view - margin)
            page.scrollTo!({ y: Math.max(0, y + h + margin - view), animated: true });
          else if (y < scrolledTo.current + topCover + margin)
            page.scrollTo!({ y: Math.max(0, y - topCover - margin), animated: true });
        },
        () => undefined,
      );
    } catch {
      // A field that can't be measured stays where it is.
    }
  });
  return {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrolledTo.current = e.nativeEvent.contentOffset.y;
    },
    onLayout: (e: { nativeEvent: { layout: { height: number } } }) => {
      height.current = e.nativeEvent.layout.height;
    },
  };
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
