import type { NativeStackHeaderProps } from "expo-router/native-stack";
import { useSyncExternalStore } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass } from "./Glass";
import { color, minTap, type } from "./theme";
import { WebIcon } from "./WebIcon";

// The website's navigation bar, drawn for Android and the browser preview (spec 3.1): Back
// ("‹ Jobs") at the left, the small title in the middle, the screen's action at the right.
// The large title is the first thing in the page (Screen draws it); the small title fades in
// once the large one scrolls under the bar, and the bar turns to glass once anything does.
// iPhone uses the native bar with large titles instead.

export const BAR_HEIGHT = 44;

/** How far the page has scrolled, per screen (route key), and whether it has a large title. */
interface BarState {
  y: Animated.Value;
  large: boolean;
}
const states = new Map<string, BarState>();
const listeners = new Set<() => void>();
let version = 0;

export function barState(key: string): BarState {
  let s = states.get(key);
  if (!s) {
    s = { y: new Animated.Value(0), large: false };
    states.set(key, s);
  }
  return s;
}

/** A screen says whether it draws a large title (the small one then waits for the scroll). */
export function setLargeTitle(key: string, large: boolean) {
  const s = barState(key);
  if (s.large === large) return;
  s.large = large;
  version++;
  for (const l of listeners) l();
}

function useBarVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => version,
  );
}

/** Large title block height before the small title shows (title 42 + top margin). */
const TITLE_HANDOFF: [number, number] = [30, 46];

/** The native-stack `header` for Android and the browser preview. */
export function DrawnHeader({ back, options, route, navigation }: NativeStackHeaderProps) {
  useBarVersion();
  const insets = useSafeAreaInsets();
  const s = barState(route.key);
  const title = typeof options.title === "string" ? options.title : "";
  const solid = options.headerTransparent === false;
  const titleOpacity = s.large
    ? s.y.interpolate({ inputRange: TITLE_HANDOFF, outputRange: [0, 1], extrapolate: "clamp" })
    : 1;
  const barOpacity = solid
    ? 1
    : s.y.interpolate({ inputRange: [0, 8], outputRange: [0, 1], extrapolate: "clamp" });
  const right = options.headerRight?.({ tintColor: color.link, canGoBack: Boolean(back) });
  const left = options.headerLeft?.({ tintColor: color.link, canGoBack: Boolean(back) });
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: barOpacity }]}
      >
        <Glass variant="bar" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.row}>
        <View style={styles.side}>
          {left ??
            (back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Back to ${back.title ?? "the previous screen"}`}
                onPress={() => navigation.goBack()}
                android_ripple={{ color: color.ripple, borderless: true }}
                style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}
                hitSlop={4}
              >
                <WebIcon name="back" size={20} color={color.link} strokeWidth={2.6} />
                {/* Large text: the label shrinks and truncates before it can reach the title. */}
                <Text
                  style={[type.body, styles.backLabel, { color: color.link }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.6}
                >
                  {back.title ?? "Back"}
                </Text>
              </Pressable>
            ) : null)}
        </View>
        <Animated.View pointerEvents="none" style={[styles.titleBox, { opacity: titleOpacity }]}>
          <Text
            style={[type.navTitle, { color: color.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </Animated.View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

/**
 * A round bar button with no fill (spec 3.1): "+" for New Job, the compose icon for New
 * Message. Pressed: the link color at 10% behind it.
 */
export function BarIconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: "plus" | "compose";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: color.iconTint }]}
    >
      <WebIcon name={icon} size={24} color={color.link} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { position: "relative" },
  row: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  side: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  right: { justifyContent: "flex-end" },
  titleBox: { maxWidth: "55%", alignItems: "center" },
  back: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 8,
    maxWidth: "100%",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  backLabel: { flexShrink: 1 },
  iconButton: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
