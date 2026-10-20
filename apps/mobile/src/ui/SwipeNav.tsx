import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { haptics } from "./haptics";
import { swipeDirection } from "./swipeRule";

/**
 * Called when a touch starts on something that drags or types by itself (a text field, a
 * slider, a signature pad, a segmented control, a row that swipes to remove): that touch never
 * changes the page. Does nothing outside a SwipeNav.
 */
const SwipeGuard = createContext<() => void>(() => {});

/**
 * `onTouchStart` for a view whose touches belong to it, not to the page swipe (item 7). Spread
 * it on the view: `<TextInput {...useNoSwipe()} />`.
 */
export function useNoSwipe(): { onTouchStart: () => void } {
  const guard = useContext(SwipeGuard);
  return useMemo(() => ({ onTouchStart: guard }), [guard]);
}

/** How long before a drag begins a guarded touch still counts as its start. */
const GUARD_WINDOW_MS = 300;

/** When a guarded touch and the drag began (touch times, not render state). */
class TouchClock {
  private guarded = 0;
  private began = 0;
  guard = () => {
    this.guarded = Date.now();
  };
  begin() {
    this.began = Date.now();
  }
  /** The drag started on something guarded. */
  guardedStart(): boolean {
    return Math.abs(this.guarded - this.began) < GUARD_WINDOW_MS;
  }
}

/**
 * Swipe sideways to go to the previous or next page (owner, 2026-10-19: "Add gestures
 * throughout. I want to navigate the different job pages with gestures"): the job's sections,
 * Schedule's day, week, or month. The website's rule decides (owner, 2026-10-20: at least 70 pt
 * sideways, sideways at least 1.8 times the vertical), and a swipe that starts in a text field,
 * a slider, a signature pad, or a row that swipes by itself never pages. A light tap is felt
 * when the page changes. The page's own buttons (the section switcher, Previous and Next) stay
 * the visible way to do the same.
 */
export function SwipeNav({
  onPrevious,
  onNext,
  enabled = true,
  style,
  children,
}: {
  /** Swipe right. Returns false when there's nothing before (no haptic). */
  onPrevious: () => boolean | void;
  /** Swipe left. Returns false when there's nothing after. */
  onNext: () => boolean | void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [clock] = useState(() => new TouchClock());
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(enabled)
        // Sideways only: 20 pt across before it starts; a drag that goes up or down first is
        // left to the scroll view.
        .activeOffsetX([-20, 20])
        .failOffsetY([-20, 20])
        .onBegin(() => clock.begin())
        .onEnd((e) => {
          // The touch started on a field, slider, pad, or swipe row.
          if (clock.guardedStart()) return;
          const way = swipeDirection(e.translationX, e.translationY);
          if (!way) return;
          const moved = way === "next" ? onNext() : onPrevious();
          if (moved !== false) haptics.light();
        }),
    [enabled, onNext, onPrevious, clock],
  );
  return (
    <SwipeGuard.Provider value={clock.guard}>
      <GestureDetector gesture={pan}>
        <View style={style} collapsable={false}>
          {children}
        </View>
      </GestureDetector>
    </SwipeGuard.Provider>
  );
}
