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
    <View onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
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
    <View onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
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
