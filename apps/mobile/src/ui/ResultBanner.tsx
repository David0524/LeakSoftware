import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bannerDuration, bannerSpoken, type BannerNote } from "../lib/resultBanner";
import { BAR_HEIGHT } from "./Bar";
import { useReduceMotion } from "./components";
import { Glass } from "./Glass";
import { haptics } from "./haptics";
import { color, face, gutter, MAX_TEXT_SCALE, minTap, shape, space, type } from "./theme";
import { WebIcon } from "./WebIcon";

/**
 * Schedule's result banner (owner, 2026-10-20: the inline note "looks horrible. Display it on a
 * banner on the top of the screen"), as the website's: a frosted capsule that springs down under
 * the bar with a symbol and one short line, what to watch for under it, and Undo when the change
 * can be put back. It goes by itself after 4 s (8 s with Undo); an error stays until it's
 * dismissed. Tap it or swipe it up to dismiss. Read aloud when it appears; Reduce Motion fades
 * it instead of sliding it.
 */
export function useResultBanner() {
  const [note, setNote] = useState<BannerNote | null>(null);
  // A new result replaces the one showing, even with the same words.
  const [version, setVersion] = useState(0);
  const show = useCallback((n: BannerNote | null) => {
    setNote(n);
    setVersion((v) => v + 1);
  }, []);
  const dismiss = useCallback(() => setNote(null), []);
  const element = <ResultBanner note={note} version={version} onDismiss={dismiss} />;
  return { show, dismiss, element };
}

/** How far up the banner hides: past the top of the screen. */
const HIDDEN_Y = -160;

function ResultBanner({
  note,
  version,
  onDismiss,
}: {
  note: BannerNote | null;
  version: number;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  // What's drawn: kept while the banner leaves, so it doesn't empty as it goes.
  const [shown, setShown] = useState<BannerNote | null>(note);
  if (note && note !== shown) setShown(note);
  const y = useSharedValue(HIDDEN_Y);
  const opacity = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!note) {
      opacity.set(withTiming(0, { duration: 200 }));
      if (!reduceMotion) y.set(withTiming(HIDDEN_Y, { duration: 240 }));
      return;
    }
    if (reduceMotion) {
      y.set(0);
      opacity.set(withTiming(1, { duration: 200 }));
    } else {
      // From above when it was hidden; a banner already showing just takes the new words.
      if (opacity.get() < 0.5) y.set(HIDDEN_Y);
      opacity.set(1);
      y.set(withSpring(0, { damping: 18, stiffness: 220, mass: 0.8 }));
    }
    if (note.tone === "success") haptics.success();
    AccessibilityInfo.announceForAccessibility(bannerSpoken(note));
    const ms = bannerDuration(note);
    if (ms != null) timer.current = setTimeout(onDismiss, ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per result
  }, [note, version]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  // Swipe up to dismiss; a short pull springs back.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      y.set(Math.min(0, e.translationY) + Math.max(0, e.translationY) * 0.15);
    })
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -500) onDismiss();
      else y.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });

  const visible = note != null;
  const n = shown;
  const icon =
    n?.tone === "error" ? (
      <WebIcon name="warning" size={20} color={color.fail} strokeWidth={2.2} />
    ) : (
      <WebIcon
        name="check"
        size={20}
        color={n?.tone === "success" ? color.pass : color.link}
        strokeWidth={2.6}
      />
    );

  return (
    <View
      pointerEvents={visible ? "box-none" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[styles.dock, { top: insets.top + BAR_HEIGHT + space["2"] }]}
    >
      {n ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.wrap, style]}>
            <Glass style={styles.capsule}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bannerSpoken({ ...n, undo: undefined })}
                accessibilityHint="Dismisses"
                onPress={onDismiss}
                style={styles.body}
              >
                <View style={styles.icon}>{icon}</View>
                <View style={styles.text}>
                  <Text
                    numberOfLines={2}
                    style={[type.secondary, face.semiBold, { color: color.text }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {n.message}
                  </Text>
                  {n.detail ? (
                    <Text
                      numberOfLines={3}
                      style={[type.footnote, { color: color.textMuted }]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {n.detail}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {n.undo ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Undo, ${n.message.replace(/ · /g, ", ")}`}
                  onPress={() => {
                    const undo = n.undo;
                    onDismiss();
                    undo?.();
                  }}
                  style={({ pressed }) => [
                    styles.undo,
                    { backgroundColor: pressed ? color.tintedPressed : color.tinted },
                  ]}
                >
                  <Text
                    style={[type.secondary, face.semiBold, { color: color.link }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    Undo
                  </Text>
                </Pressable>
              ) : null}
            </Glass>
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: gutter, right: gutter, alignItems: "center" },
  wrap: { maxWidth: 520, alignSelf: "stretch" },
  capsule: {
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["2"],
    paddingRight: space["2"],
    paddingVertical: 6,
    minHeight: minTap + 12,
  },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: space["2"], minHeight: minTap },
  icon: { width: 28, alignItems: "center" },
  text: { flex: 1, minWidth: 0 },
  undo: {
    minHeight: minTap,
    minWidth: 64,
    paddingHorizontal: space["4"],
    borderRadius: shape.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
