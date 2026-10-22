import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useReduceMotion } from "./components";
import { appearance, cardShadow, color, shape, space } from "./theme";

// Skeleton screens (owner, 2026-10-22: "Skeleton screens, not spinners"): gray shapes where
// the content will be, laid out as it will be, so nothing jumps when it arrives. A soft
// highlight sweeps across them every 1.6 s; Reduce Motion keeps the shapes and drops the
// sweep. The same look as the website (globals.css › .shimmer) and the iPhone app
// (Skeleton.swift). Spinners stay only inside buttons doing something and on the first
// download. docs/design/2026-10-22-instant-and-skeletons.md.

/** One sweep for every shape on screen, so they shimmer together. */
const sweep = new Animated.Value(0);
let watching = 0;
let loop: Animated.CompositeAnimation | null = null;

function useSweep(on: boolean): Animated.Value | null {
  useEffect(() => {
    if (!on) return;
    watching += 1;
    if (watching === 1) {
      sweep.setValue(0);
      loop = Animated.loop(
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loop.start();
    }
    return () => {
      watching -= 1;
      if (watching === 0) {
        loop?.stop();
        loop = null;
      }
    };
  }, [on]);
  return on ? sweep : null;
}

/**
 * A placeholder shape: a pill unless given a radius. In a skeleton, never on its own (the
 * skeleton is read once as "Loading").
 */
export function Bone({
  width = "100%",
  height = 14,
  radius,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const moving = useSweep(!reduceMotion);
  const [w, setW] = useState(0);
  const id = `shimmer${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const glow = appearance.scheme === "dark" ? 0.08 : 0.6;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius ?? (typeof height === "number" ? height / 2 : 999),
          backgroundColor: color.fill,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {moving && w > 0 ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                { translateX: moving.interpolate({ inputRange: [0, 1], outputRange: [-w, w] }) },
              ],
            },
          ]}
        >
          <Svg width={w} height="100%">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={glow} />
                <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A skeleton read once as "Loading …" by screen readers. */
function Loading({
  label = "Loading",
  style,
  children,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={style}>
      {children}
    </View>
  );
}

// Widths that vary row to row, as real names do (the same on the website).
const FIRST: DimensionValue[] = ["40%", "50%", "33%", "60%", "40%", "50%"];

/**
 * Placeholder cards while a day's stops are read (Today, Schedule): the stop's round number,
 * its time and name, its address, and a pill, as the cards are.
 */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <Loading style={{ gap: space["3"] }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: color.surface }, cardShadow()]}>
          <Bone width={32} height={32} />
          <View style={styles.lines}>
            <Bone width="35%" height={16} />
            <Bone width={i % 2 ? "50%" : "75%"} />
            <Bone width={112} height={20} />
          </View>
        </View>
      ))}
    </Loading>
  );
}

/** A grouped list's rows (Activity, Messages, settings): one or two lines each. */
export function SkeletonRows({
  count = 5,
  dot = false,
  label,
}: {
  count?: number;
  /** Rows start with an unread dot (Activity). */
  dot?: boolean;
  label?: string;
}) {
  return (
    <Loading label={label} style={[styles.group, { backgroundColor: color.surface }]}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.row,
            i > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: color.separator,
            },
          ]}
        >
          {dot ? <Bone width={10} height={10} /> : null}
          <View style={styles.lines}>
            <Bone width={FIRST[i % FIRST.length]} height={16} />
            <Bone width={i % 2 ? "75%" : "66%"} />
          </View>
        </View>
      ))}
    </Loading>
  );
}

/** Lines of text still on their way (a job's Timeline). */
export function SkeletonLines({ count = 3, label }: { count?: number; label?: string }) {
  return (
    <Loading label={label} style={{ gap: space["3"], paddingVertical: space["1"] }}>
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} width={i % 2 ? "70%" : "90%"} />
      ))}
    </Loading>
  );
}

/** The Dashboard: four stat cards two by two, then the chart's card. */
export function SkeletonDashboard() {
  const tile = (i: number) => (
    <View key={i} style={[styles.tile, { backgroundColor: color.surface }, cardShadow()]}>
      <Bone width="60%" />
      <Bone width="75%" height={28} radius={8} />
      <Bone width="45%" height={12} />
    </View>
  );
  return (
    <Loading label="Loading the dashboard" style={{ gap: space["3"] }}>
      <View style={styles.tiles}>{[0, 1].map(tile)}</View>
      <View style={styles.tiles}>{[2, 3].map(tile)}</View>
      <View style={[styles.chartCard, { backgroundColor: color.surface }, cardShadow()]}>
        <Bone width="50%" height={18} />
        <Bone width="80%" />
        <View style={styles.bars}>
          {[0.45, 0.6, 0.4, 0.75, 0.55, 0.9].map((h, i) => (
            <Bone key={i} width={24} height={`${h * 100}%`} radius={6} />
          ))}
        </View>
      </View>
    </Loading>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: shape.card,
    flexDirection: "row",
    gap: space["3"],
    padding: space["4"],
    minHeight: 96,
  },
  lines: { flex: 1, gap: space["2"] },
  group: { borderRadius: shape.grouped, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
    minHeight: 60,
  },
  tiles: { flexDirection: "row", gap: space["3"] },
  tile: { flex: 1, borderRadius: shape.card, padding: space["4"], gap: space["2"] },
  chartCard: { borderRadius: shape.card, padding: space["4"], gap: space["2"] },
  bars: {
    height: 120,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: space["2"],
  },
});
