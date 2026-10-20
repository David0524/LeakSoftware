import { useMemo, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { addDays, dateFormat, formatDay, scheduleDays } from "@leakbook/core";
import { haptics } from "../../ui/haptics";
import { color, face, font, gutter, MAX_TEXT_SCALE } from "../../ui/theme";
import { dropTint, useDragHover, useDropZones } from "./ScheduleDrag";

const weekdayName = dateFormat("en-US", { weekday: "short", timeZone: "UTC" });

/**
 * Schedule › Day: the week's days in a strip (spec 5.6; the website's week-strip.tsx). Swipe it
 * sideways for the week before or after: it follows the finger, and letting go past a quarter
 * of its width (or with a flick) settles on that week, on the same weekday. A stop dragged onto
 * a day moves there (owner, 2026-10-20).
 */
export function WeekStrip({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const [dx] = useState(() => new Animated.Value(0));
  // A tap that ends a swipe isn't a tap on the day under the finger.
  const [swiping, setSwiping] = useState(false);
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  const weeks = useMemo(
    () => [-7, 0, 7].map((n) => scheduleDays("week", addDays(date, n))),
    [date],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onStart(() => setSwiping(true))
        .onUpdate((e) => dx.setValue(e.translationX))
        .onEnd((e) => {
          const w = width || 320;
          const to =
            e.translationX < -w / 4 || (e.translationX < -20 && e.velocityX < -400)
              ? 1
              : e.translationX > w / 4 || (e.translationX > 20 && e.velocityX > 400)
                ? -1
                : 0;
          const settle = () => {
            dx.setValue(0);
            if (to !== 0) {
              haptics.selection();
              onChange(addDays(date, 7 * to));
            }
          };
          void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
            if (still) return settle();
            Animated.timing(dx, {
              toValue: -to * w,
              duration: 250,
              useNativeDriver: false,
            }).start(settle);
          });
        })
        .onFinalize(() => setTimeout(() => setSwiping(false), 400)),
    [dx, width, date, onChange],
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.clip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Animated.View
          style={[
            styles.track,
            { width: width * 3, transform: [{ translateX: Animated.add(dx, -width) }] },
          ]}
        >
          {weeks.map((week, i) => (
            <View
              key={week[0]}
              style={[styles.week, { width }]}
              accessibilityElementsHidden={i !== 1}
              importantForAccessibility={i === 1 ? "auto" : "no-hide-descendants"}
            >
              {week.map((d) => {
                const at = new Date(`${d}T12:00:00Z`);
                const chosen = d === date;
                const fg = chosen ? color.bg : d === today ? color.link : color.text;
                const drop = i === 1 ? dropTint(hover, `day:${d}`) : undefined;
                return (
                  <Pressable
                    key={d}
                    ref={i === 1 ? zoneRef({ kind: "day", id: `day:${d}`, date: d }) : undefined}
                    collapsable={false}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={formatDay(d, "long")}
                    onPress={() => {
                      if (chosen || swiping) return;
                      haptics.selection();
                      onChange(d);
                    }}
                    style={[
                      styles.day,
                      chosen && { backgroundColor: color.text },
                      drop && !chosen && { backgroundColor: drop },
                    ]}
                  >
                    <Text
                      style={[styles.weekday, { color: fg }]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {weekdayName.format(at)}
                    </Text>
                    <Text
                      style={[styles.num, { color: fg }]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {at.getUTCDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { marginHorizontal: -gutter, overflow: "hidden" },
  track: { flexDirection: "row" },
  week: { flexDirection: "row", gap: 4, paddingHorizontal: gutter, paddingBottom: 4 },
  day: {
    flex: 1,
    minWidth: 44,
    minHeight: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  weekday: { ...face.medium, fontSize: 13, lineHeight: 18 },
  num: {
    fontFamily: font.displayBold,
    fontSize: 20,
    lineHeight: 26,
    fontVariant: ["tabular-nums"],
  },
});
