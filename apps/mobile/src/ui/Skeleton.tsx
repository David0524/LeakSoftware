import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReduceMotion } from "./components";
import { cardShadow, color, shape, space } from "./theme";

/**
 * Placeholder cards while the first download fills the phone (owner, 2026-10-20: no blank or
 * empty screen first), shaped like the stops that will take their place, so nothing jumps when
 * they arrive. A slow, soft pulse; still with Reduce Motion. Read as "Loading".
 */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  const reduceMotion = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) return pulse.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);
  const bar = (width: `${number}%`, height = 14) => (
    <View style={[styles.bar, { width, height, backgroundColor: color.fill }]} />
  );
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ gap: space["3"] }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={[styles.card, { backgroundColor: color.surface, opacity: pulse }, cardShadow()]}
        >
          <View style={[styles.badge, { backgroundColor: color.fill }]} />
          <View style={styles.lines}>
            {bar("35%", 18)}
            {bar(i % 2 ? "70%" : "60%")}
            {bar(i % 2 ? "45%" : "80%")}
          </View>
        </Animated.View>
      ))}
    </View>
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
  badge: { width: 32, height: 32, borderRadius: 16 },
  lines: { flex: 1, gap: space["2"] },
  bar: { borderRadius: 7 },
});
