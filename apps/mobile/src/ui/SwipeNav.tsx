import { useMemo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { haptics } from "./haptics";

/**
 * Swipe sideways to go to the previous or next page (owner, 2026-10-19: "Add gestures
 * throughout. I want to navigate the different job pages with gestures"): the job's sections,
 * Schedule's day, week, or month. Only a clearly sideways drag counts, so scrolling up and
 * down, rows' own swipe actions, and drawing aren't taken over. The page's own buttons (the
 * section switcher, Previous and Next) stay the visible way to do the same.
 */
export function SwipeNav({
  onPrevious,
  onNext,
  enabled = true,
  style,
  children,
}: {
  /** Swipe right; returns nothing when there's nothing before. */
  onPrevious: () => void;
  /** Swipe left. */
  onNext: () => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(enabled)
        // Sideways only: 30 pt across before it starts, and a little up or down cancels it.
        .activeOffsetX([-30, 30])
        .failOffsetY([-12, 12])
        .onEnd((e) => {
          const far = Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 600;
          if (!far) return;
          haptics.selection();
          if (e.translationX < 0) onNext();
          else onPrevious();
        }),
    [enabled, onNext, onPrevious],
  );
  return (
    <GestureDetector gesture={pan}>
      <View style={style} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
