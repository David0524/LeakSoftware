import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { PAGER_FAIL_Y, PAGER_LOCK, PAGER_SETTLE, pagerFollow, pagerStep } from "../lib/pager";
import { useReduceMotion } from "./components";
import { haptics } from "./haptics";
import { swipeEnded, swipeStarted } from "./swipeQuiet";
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
        .onStart(() => {
          if (!clock.guardedStart()) swipeStarted();
        })
        .onFinalize(() => swipeEnded())
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

/** The time on the gesture's thread (a worklet, so the pan can read it). */
function clockNow(): number {
  "worklet";
  return Date.now();
}

/**
 * Swipe sideways between pages, the page following the finger (owner, 2026-10-21: "Should be
 * able to drag it as fast or slow as you want, hold halfway, etc."; lib/pager.ts): 1:1 while
 * held, so it can be held halfway and taken back; let go past a third of the width or with a
 * flick and it carries on out at the finger's speed, and the next page slides in from the other
 * side once it's there (`page` changes); otherwise it springs back. It gives like a rubber band
 * where there's no page that way. The direction is decided after 10 pt, so up and down still
 * scroll. With Reduce Motion the page doesn't move with the finger and the next one fades in. A
 * touch that starts on something guarded (useNoSwipe) never pages. Schedule's days, weeks and
 * months.
 */
export function SwipePager({
  page,
  onPrevious,
  onNext,
  canPrevious = true,
  canNext = true,
  enabled = true,
  strict = false,
  style,
  children,
}: {
  /** Names the page shown: when it changes after a swipe, the new page slides in. */
  page: string;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
  enabled?: boolean;
  /** Only a clearly sideways drag turns the page (PAGER_FAIL_Y): a page of cards (Schedule). */
  strict?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const opacity = useSharedValue(1);
  // When a guarded touch began (UI thread time), and whether this drag started on one.
  const guardedAt = useSharedValue(0);
  const blocked = useSharedValue(false);
  const began = useSharedValue(0);
  const [guard] = useState(() => () => guardedAt.set(Date.now()));
  // A turn under way: which way, and whether the old page is out and the new one here.
  const turn = useRef<{ dir: 1 | -1; out: boolean; arrived: boolean } | null>(null);
  const latest = useRef({ onPrevious, onNext });
  useEffect(() => {
    latest.current = { onPrevious, onNext };
  });

  const pageStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));

  /** Both the old page out and the new one here: it comes in from the other side. */
  function bringIn() {
    const t = turn.current;
    if (!t || !t.out || !t.arrived) return;
    turn.current = null;
    if (reduceMotion || !width) {
      x.set(0);
      opacity.set(withTiming(1, { duration: 200 }));
      return;
    }
    x.set(t.dir * (width + 16));
    x.set(withSpring(0, PAGER_SETTLE));
  }

  // The new page is here (before paint, so the old one never shows in the new place).
  useLayoutEffect(() => {
    if (!turn.current) return;
    turn.current.arrived = true;
    bringIn();
    // Runs when the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const [onTurned] = useState(() => (dir: 1 | -1) => {
    const t = { dir, out: false, arrived: false };
    turn.current = t;
    haptics.light();
    if (dir === 1) latest.current.onNext();
    else latest.current.onPrevious();
    // The page didn't change (or is slow to): this one comes back.
    setTimeout(() => {
      if (turn.current !== t) return;
      turn.current = null;
      x.set(withSpring(0, PAGER_SETTLE));
      opacity.set(withTiming(1, { duration: 200 }));
    }, 1200);
  });
  const bringInRef = useRef(bringIn);
  useEffect(() => {
    bringInRef.current = bringIn;
  });
  const [onOut] = useState(() => () => {
    if (!turn.current) return;
    turn.current.out = true;
    bringInRef.current();
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        // Sideways only: 10 pt across before it starts; up or down first is the scroll's.
        .activeOffsetX([-PAGER_LOCK, PAGER_LOCK])
        .failOffsetY(strict ? [-PAGER_FAIL_Y, PAGER_FAIL_Y] : [-PAGER_LOCK, PAGER_LOCK])
        .onBegin(() => {
          began.set(clockNow());
        })
        .onStart(() => {
          blocked.set(Math.abs(guardedAt.get() - began.get()) < GUARD_WINDOW_MS);
          if (!blocked.get()) scheduleOnRN(swipeStarted);
        })
        .onUpdate((e) => {
          if (blocked.get() || reduceMotion) return;
          x.set(pagerFollow(e.translationX, width || 300, canPrevious, canNext));
        })
        .onEnd((e) => {
          if (blocked.get()) return;
          const dir = pagerStep(e.translationX, e.velocityX, width || 300, canPrevious, canNext);
          if (dir === 0) {
            x.set(withSpring(0, PAGER_SETTLE));
            return;
          }
          if (reduceMotion) {
            opacity.set(
              withTiming(0, { duration: 120 }, (done) => {
                if (done) scheduleOnRN(onOut);
              }),
            );
          } else {
            // The old page carries on out the way the finger was going, at its speed.
            x.set(
              withSpring(
                -dir * ((width || 300) + 16),
                { ...PAGER_SETTLE, duration: 220, velocity: e.velocityX },
                (done) => {
                  if (done) scheduleOnRN(onOut);
                },
              ),
            );
          }
          scheduleOnRN(onTurned, dir);
        })
        .onFinalize(() => {
          scheduleOnRN(swipeEnded);
        }),
    [
      enabled,
      strict,
      reduceMotion,
      width,
      canPrevious,
      canNext,
      x,
      opacity,
      guardedAt,
      blocked,
      began,
      onTurned,
      onOut,
    ],
  );

  return (
    <SwipeGuard.Provider value={guard}>
      <GestureDetector gesture={pan}>
        <View collapsable={false} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <Reanimated.View style={[style, pageStyle]}>{children}</Reanimated.View>
        </View>
      </GestureDetector>
    </SwipeGuard.Provider>
  );
}
