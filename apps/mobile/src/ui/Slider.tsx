import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { haptics } from "./haptics";
import { color, minTap } from "./theme";

/**
 * A slider, as iOS draws one: a thin track filled in the tint up to a round white thumb. Drag
 * or tap along it; screen readers adjust it with swipe up and down (`step` at a time).
 * `onEnd` runs when a drag or tap lets go (one Undo step per change).
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onEnd,
  label,
  valueText,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onEnd?: () => void;
  label: string;
  /** How screen readers say the value ("150%"). */
  valueText: string;
}) {
  const [width, setWidth] = useState(0);
  const snap = (v: number) => Math.round(Math.min(max, Math.max(min, v)) / step) * step;
  const at = (x: number) => (width ? snap(min + (x / width) * (max - min)) : value);
  const set = (x: number) => {
    const v = Number(at(x).toFixed(4));
    if (v !== value) onChange(v);
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onUpdate((e) => set(e.x))
    .onEnd(() => {
      haptics.selection();
      onEnd?.();
    });
  const frac = (value - min) / (max - min);
  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const next = snap(value + (e.nativeEvent.actionName === "increment" ? step : -step));
          if (next !== value) {
            onChange(Number(next.toFixed(4)));
            onEnd?.();
          }
        }}
      >
        <View style={[styles.track, { backgroundColor: color.fill }]}>
          <View style={[styles.filled, { width: `${frac * 100}%`, backgroundColor: color.link }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: Math.max(0, frac * width - 14) }]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: minTap, justifyContent: "center", flex: 1, minWidth: 120 },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  filled: { height: 4 },
  thumb: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    boxShadow: "0px 2px 6px rgba(0,0,0,0.2), 0px 0px 0px 0.5px rgba(0,0,0,0.06)",
  },
});
