import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { addDays, dateFormat, formatDay, scheduleDays } from "@leakbook/core";
import { PAGER_LOCK, PAGER_SETTLE, pagerStep } from "../../lib/pager";
import { useReduceMotion } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { swipeEnded, swipeStarted, swipeTapBlocked } from "../../ui/swipeQuiet";
import { color, face, font, gutter, MAX_TEXT_SCALE } from "../../ui/theme";
import { dropTint, useDragHover, useDropZones } from "./ScheduleDrag";

const weekdayName = dateFormat("en-US", { weekday: "short", timeZone: "UTC" });

/**
 * Schedule › Day: the week's days in a strip (spec 5.6; the website's week-strip.tsx). A stop
 * dragged onto a day moves there (owner, 2026-10-20).
 *
 * Swiping it moves a week (owner, 2026-10-21: "Should be able to drag it as fast or slow as you
 * want, hold halfway, etc."; lib/pager.ts): the weeks before and after sit beside this one, so
 * the strip follows the finger 1:1 and shows the week coming in, and it can be held halfway and
 * taken back. Let go past a quarter of its width or with a flick and it springs on to that week,
 * on the same weekday, at the finger's speed; otherwise it springs back. A new week from the
 * arrows or Today slides in from its side. Up and down still scroll. With Reduce Motion it
 * doesn't follow the finger and the week just changes.
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
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  // A swipe's landing: drawn already beside the old week, so it comes in without a jump.
  const landing = useRef<string | null>(null);
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  const weeks = useMemo(
    () => [-7, 0, 7].map((n) => scheduleDays("week", addDays(date, n))),
    [date],
  );
  const page = width;

  // The screen's date changed. From this strip's swipe, the landed week is now the middle one:
  // back to the middle before paint. From the arrows, Today or the date picker, into another
  // week: that week slides in from its side.
  const last = useRef(date);
  useLayoutEffect(() => {
    const before = last.current;
    last.current = date;
    if (before === date) return;
    const fromSwipe = landing.current === date;
    landing.current = null;
    if (fromSwipe) {
      x.set(0);
      return;
    }
    const was = scheduleDays("week", before)[0]!;
    const now = scheduleDays("week", date)[0]!;
    if (was === now || reduceMotion || !page) return;
    x.set(now > was ? page : -page);
    x.set(withSpring(0, PAGER_SETTLE));
    // Runs when the screen's date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const latest = useRef({ date, onChange });
  useEffect(() => {
    latest.current = { date, onChange };
  });
  // The spring reached the next week: stand on it (same weekday) and tell the screen.
  const [landed] = useState(() => (dir: 1 | -1) => {
    const target = addDays(latest.current.date, 7 * dir);
    landing.current = target;
    haptics.light();
    latest.current.onChange(target);
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Sideways only: a drag that goes up or down first is left to the page's scroll.
        .activeOffsetX([-PAGER_LOCK, PAGER_LOCK])
        .failOffsetY([-PAGER_LOCK, PAGER_LOCK])
        .onStart(() => {
          scheduleOnRN(swipeStarted);
        })
        .onUpdate((e) => {
          if (!reduceMotion) x.set(e.translationX);
        })
        .onEnd((e) => {
          const w = page || 320;
          const dir = pagerStep(e.translationX, e.velocityX, w, true, true);
          if (dir === 0) {
            x.set(withSpring(0, PAGER_SETTLE));
            return;
          }
          if (reduceMotion) {
            scheduleOnRN(landed, dir);
            return;
          }
          x.set(
            withSpring(-dir * w, { ...PAGER_SETTLE, velocity: e.velocityX }, (done) => {
              if (done) scheduleOnRN(landed, dir);
            }),
          );
        })
        .onFinalize(() => {
          scheduleOnRN(swipeEnded);
        }),
    [x, page, reduceMotion, landed],
  );
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - page }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.clip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Reanimated.View style={[styles.track, { width: width * 3 }, trackStyle]}>
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
                      if (chosen || swipeTapBlocked()) return;
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
        </Reanimated.View>
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
