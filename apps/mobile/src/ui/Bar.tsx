import type { NativeStackHeaderProps } from "expo-router/native-stack";
import { useSyncExternalStore } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass } from "./Glass";
import { BarLogo } from "./SundeckLogo";
import { color, minTap, type } from "./theme";
import { WebIcon } from "./WebIcon";

// The website's navigation bar, drawn for Android and the browser preview (spec 3.1): Back
// ("‹ Jobs") at the left, the small title in the middle, the screen's action at the right.
// The large title is the first thing in the page (Screen draws it); the small title fades in
// once the large one scrolls under the bar, and the bar turns to glass once anything does.
// iPhone uses the native bar with large titles instead.
//
// The tab roots have the logo where Back would be, below the status bar and level with the
// action, and the large title on its own full-width row under the bar. Scrolled, the logo stays
// in the bar as the pin mark only (owner, 2026-10-21: "It needs to sit below the time. Then
// just the logo (not the text) should slide down with the page on that top banner"), as on
// the website.

export const BAR_HEIGHT = 44;

/** How far the page has scrolled, per screen (route key), and whether it has a large title. */
interface BarState {
  y: Animated.Value;
  large: boolean;
  /** The large title is in the bar's row (no Back), not under it. */
  inline: boolean;
  /** The width of the bar's right-hand content (the "+"), in points. */
  right: number;
  /**
   * The bar keeps its large-title look as the page scrolls: no small title, no glass (the
   * job's Findings and Wrap-Up, which sit on a tile; owner, 2026-10-20 and 2026-10-21).
   */
  still: boolean;
  /** A tab's own page: the logo at the bar's leading edge (BarLogo). */
  logo: boolean;
}
const states = new Map<string, BarState>();
const listeners = new Set<() => void>();
let version = 0;

export function barState(key: string): BarState {
  let s = states.get(key);
  if (!s) {
    s = {
      y: new Animated.Value(0),
      large: false,
      inline: false,
      right: 0,
      still: false,
      logo: false,
    };
    states.set(key, s);
  }
  return s;
}

function changed() {
  version++;
  for (const l of listeners) l();
}

/**
 * A screen says whether it draws a large title (the small one then waits for the scroll), and
 * whether that title sits in the bar's row.
 */
export function setLargeTitle(key: string, large: boolean, inline = false) {
  const s = barState(key);
  if (s.large === large && s.inline === inline) return;
  s.large = large;
  s.inline = inline;
  changed();
}

/** A tab's own page puts the logo at the bar's leading edge. */
export function setBarLogo(key: string, logo: boolean) {
  const s = barState(key);
  if (s.logo === logo) return;
  s.logo = logo;
  changed();
}

/** The bar's right-hand content was laid out (its width keeps an inline title clear of it). */
export function setBarRight(key: string, width: number) {
  const s = barState(key);
  if (Math.abs(s.right - width) < 0.5) return;
  s.right = width;
  changed();
}

/** Keep the bar from collapsing to its small title while `still` (see BarState.still). */
export function setBarStill(key: string, still: boolean) {
  const s = barState(key);
  if (s.still === still) return;
  s.still = still;
  changed();
}

/** The screen's bar state, re-rendering when it changes. */
export function useBar(key: string): BarState {
  useBarVersion();
  return barState(key);
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
export const TITLE_HANDOFF: [number, number] = [30, 46];
/** In the bar's row: once about half of the title has scrolled off the top. */
export const INLINE_TITLE_HANDOFF: [number, number] = [14, 30];

/** The small title's opacity as the page scrolls. */
export function smallTitleOpacity(s: BarState) {
  return s.y.interpolate({
    inputRange: s.inline ? INLINE_TITLE_HANDOFF : TITLE_HANDOFF,
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
}

/** The native-stack `header` for Android and the browser preview. */
export function DrawnHeader({ back, options, route, navigation }: NativeStackHeaderProps) {
  useBarVersion();
  const insets = useSafeAreaInsets();
  const s = barState(route.key);
  const title = typeof options.title === "string" ? options.title : "";
  const solid = options.headerTransparent === false;
  const titleOpacity = s.still ? 0 : s.large ? smallTitleOpacity(s) : 1;
  const barOpacity = solid
    ? 1
    : s.still
      ? 0
      : s.y.interpolate({
          // A title in the bar's row stays clear of the glass until it has scrolled away.
          inputRange: s.inline ? INLINE_TITLE_HANDOFF : [0, 8],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });
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
            ) : s.logo ? (
              <BarLogo y={s.y} />
            ) : null)}
        </View>
        <Animated.View pointerEvents="none" style={[styles.titleBox, { opacity: titleOpacity }]}>
          <Text
            style={[type.barTitle, { color: color.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </Animated.View>
        <View style={[styles.side, styles.right]}>
          <View
            style={styles.rightContent}
            onLayout={(e) => setBarRight(route.key, e.nativeEvent.layout.width)}
          >
            {right}
          </View>
        </View>
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
  rightContent: { flexDirection: "row", alignItems: "center" },
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
