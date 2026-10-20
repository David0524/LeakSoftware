import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "./haptics";
import { useNoSwipe } from "./SwipeNav";
import { color, face } from "./theme";

/** Width of the revealed red button. */
const ACTION_WIDTH = 88;
/** A swipe past this share of the row's width acts on release (a "full swipe", as in Mail). */
const FULL_SWIPE = 0.55;

/**
 * Swipe left to reveal a red Delete (or Remove) button; a full swipe acts on release, as in iOS
 * lists and Gmail on Android. `onDelete` should ask first (confirmDestructive), so the swipe
 * never deletes on its own. The swipe is never the only way: each row keeps a visible button
 * elsewhere and a "Delete" accessibility action for VoiceOver and TalkBack (see ListRow).
 */
export function SwipeToDelete({
  label = "Delete",
  onDelete,
  children,
}: {
  /** The action's name, as on the row's own button ("Delete", "Remove"). */
  label?: string;
  onDelete: () => void;
  children: ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const armed = useRef(false);
  // A row that swipes by itself never changes the page under it (owner, 2026-10-20).
  const noSwipe = useNoSwipe();

  function arm(on: boolean) {
    if (on && !armed.current) haptics.light();
    armed.current = on;
  }

  function act() {
    armed.current = false;
    ref.current?.close();
    onDelete();
  }

  return (
    <View {...noSwipe} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1}
        rightThreshold={ACTION_WIDTH / 2}
        overshootRight
        dragOffsetFromRightEdge={12}
        onSwipeableWillOpen={() => {
          if (armed.current) act();
        }}
        onSwipeableClose={() => {
          armed.current = false;
        }}
        renderRightActions={(_progress, translation) => (
          <DeleteAction
            translation={translation}
            fullAt={rowWidth * FULL_SWIPE}
            label={label}
            onPress={act}
            onArm={arm}
          />
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

function DeleteAction({
  translation,
  fullAt,
  label,
  onPress,
  onArm,
}: {
  translation: SharedValue<number>;
  fullAt: number;
  label: string;
  onPress: () => void;
  onArm: (on: boolean) => void;
}) {
  // Past the full-swipe point the button grows with the finger and a light tap says
  // "release to act"; moving back cancels it.
  useAnimatedReaction(
    () => fullAt > 0 && -translation.value > fullAt,
    (now, before) => {
      if (now !== before) scheduleOnRN(onArm, now);
    },
  );
  const grow = useAnimatedStyle(() => ({
    width: Math.max(ACTION_WIDTH, -translation.value),
  }));
  return (
    <Animated.View style={[styles.action, grow]}>
      <Pressable
        // Hidden from screen readers: the row offers the same action as an accessibility action.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onPress}
        style={styles.actionHit}
      >
        <Text style={styles.actionText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  action: { backgroundColor: color.fail, justifyContent: "center" },
  // The label stays at the row's trailing edge while the red area grows.
  actionHit: { flex: 1, alignItems: "flex-end", justifyContent: "center", paddingRight: 20 },
  actionText: { ...face.semiBold, fontSize: 17, color: color.onStatus },
  leading: { backgroundColor: color.link },
  // The label stays at the row's leading edge while the blue area grows.
  leadingHit: { flex: 1, alignItems: "flex-start", justifyContent: "center", paddingLeft: 20 },
  actionRow: { flexDirection: "row" },
  multi: { width: ACTION_WIDTH, justifyContent: "center", paddingHorizontal: 14 },
});

/**
 * Swipe right to reveal a blue action at the row's leading edge (Unread or Read in Messages);
 * a full swipe acts on release, as in iOS Messages and Mail. Not destructive, so it acts
 * without asking. As with SwipeToDelete, the swipe is never the only way: the row offers the
 * same accessibility action (see ListRow's leadingAction).
 */
export function SwipeLeading({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const armed = useRef(false);
  // A row that swipes by itself never changes the page under it (owner, 2026-10-20).
  const noSwipe = useNoSwipe();

  function arm(on: boolean) {
    if (on && !armed.current) haptics.light();
    armed.current = on;
  }

  function act() {
    armed.current = false;
    ref.current?.close();
    onPress();
  }

  return (
    <View {...noSwipe} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1}
        leftThreshold={ACTION_WIDTH / 2}
        overshootLeft
        dragOffsetFromLeftEdge={12}
        onSwipeableWillOpen={() => {
          if (armed.current) act();
        }}
        onSwipeableClose={() => {
          armed.current = false;
        }}
        renderLeftActions={(_progress, translation) => (
          <LeadingAction
            translation={translation}
            fullAt={rowWidth * FULL_SWIPE}
            label={label}
            onPress={act}
            onArm={arm}
          />
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

function LeadingAction({
  translation,
  fullAt,
  label,
  onPress,
  onArm,
}: {
  translation: SharedValue<number>;
  fullAt: number;
  label: string;
  onPress: () => void;
  onArm: (on: boolean) => void;
}) {
  useAnimatedReaction(
    () => fullAt > 0 && translation.value > fullAt,
    (now, before) => {
      if (now !== before) scheduleOnRN(onArm, now);
    },
  );
  const grow = useAnimatedStyle(() => ({
    width: Math.max(ACTION_WIDTH, translation.value),
  }));
  return (
    <Animated.View style={[styles.action, styles.leading, grow]}>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onPress}
        style={styles.leadingHit}
      >
        <Text style={styles.actionText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** One button a row reveals when swiped. */
export interface SwipeAction {
  label: string;
  /** Its fill: the action's color (green Complete, blue Directions). */
  tint: string;
  onPress: () => void;
}

/**
 * Swipe a row either way to reveal its buttons (owner, 2026-10-20: Today's stops, leading
 * Complete, trailing Call and Directions; docs/design/2026-10-20-gestures.md section 5). A tap
 * on a button acts and closes the row; nothing acts on a full swipe, so a long drag never does
 * anything by itself. The swipe is never the only way: the row keeps its own visible buttons
 * and offers the same actions to TalkBack and VoiceOver (accessibilityActions on the row).
 */
export function SwipeActions({
  leading,
  trailing = [],
  children,
}: {
  leading?: SwipeAction | null;
  trailing?: SwipeAction[];
  children: ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  // A row that swipes by itself never changes the page under it (owner, 2026-10-20).
  const noSwipe = useNoSwipe();
  const button = (a: SwipeAction, align: "flex-start" | "flex-end") => (
    <Pressable
      key={a.label}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={() => {
        ref.current?.close();
        haptics.light();
        a.onPress();
      }}
      style={({ pressed }) => [
        styles.multi,
        { backgroundColor: a.tint, alignItems: align },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={styles.actionText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
        {a.label}
      </Text>
    </Pressable>
  );
  return (
    <View {...noSwipe}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.4}
        leftThreshold={ACTION_WIDTH / 2}
        rightThreshold={ACTION_WIDTH / 2}
        dragOffsetFromLeftEdge={12}
        dragOffsetFromRightEdge={12}
        renderLeftActions={
          leading
            ? () => <View style={styles.actionRow}>{button(leading, "flex-start")}</View>
            : undefined
        }
        renderRightActions={
          trailing.length
            ? () => (
                <View style={styles.actionRow}>{trailing.map((a) => button(a, "flex-end"))}</View>
              )
            : undefined
        }
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}
