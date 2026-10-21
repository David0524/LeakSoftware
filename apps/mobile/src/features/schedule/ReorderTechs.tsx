import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { REORDER_TECHS, moveInList } from "@leakbook/core";
import { T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { TechDot } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import { useRowPlaces } from "../today/Reorder";
import { color, MAX_TEXT_SCALE, minTap, shape, space, type } from "../../ui/theme";

// Reorder Techs (owner, 2026-10-21: "Make a way to reorder techs in the schedule";
// docs/design/2026-10-21-tech-order.md), the website's reorder-techs.tsx on Android: owners and
// admins get a "Reorder Techs" button under Whose schedule; its sheet lists the active techs as
// an inset grouped list, each with their color dot, Move Up and Move Down, and the grip Today's
// Reorder uses (drag it). Done saves (lib/techOrder: row and outbox), Cancel leaves it.

export interface ReorderTech {
  /** The membership's id (what's saved). */
  id: string;
  name: string;
  color: string | null;
}

export function ReorderTechs({
  techs,
  onSave,
}: {
  /** The active techs in the Schedule's order now. */
  techs: ReorderTech[];
  /** Saves the order (membership ids, top to bottom); an error, or null. */
  onSave: (ordered: string[]) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(techs);
  const [error, setError] = useState<string | null>(null);
  const places = useRowPlaces();
  if (techs.length < 2) return null;

  const move = (from: number, to: number) => {
    setList((l) => moveInList(l, from, to));
    haptics.selection();
  };
  const drop = (id: string, dy: number) => {
    const order = list.map((t) => t.id);
    const before = places.landsBefore(id, dy, order);
    const from = order.indexOf(id);
    const rest = order.filter((x) => x !== id);
    const to = before === null ? rest.length : rest.indexOf(before);
    if (to !== from) move(from, to);
  };
  const save = () => {
    const failed = onSave(list.map((t) => t.id));
    if (failed) {
      setError(failed);
      return;
    }
    haptics.success();
    setOpen(false);
  };

  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setList(techs);
          setError(null);
          setOpen(true);
        }}
        hitSlop={4}
        style={({ pressed }) => [styles.action, pressed && { opacity: 0.5 }]}
      >
        <Text
          style={[type.bodyEmphasis, { color: color.link }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {REORDER_TECHS.action}
        </Text>
      </Pressable>
      <ModalSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={REORDER_TECHS.title}
        cancel={REORDER_TECHS.cancel}
        done={{ label: REORDER_TECHS.done, onPress: save }}
      >
        {/* Android's Modal needs its own gesture root for the grip's drag. */}
        <GestureHandlerRootView style={{ gap: space["3"] }}>
          <T variant="secondary" muted style={{ paddingHorizontal: space["4"] }}>
            {REORDER_TECHS.help}
          </T>
          <View style={[styles.group, { backgroundColor: color.surface }]}>
            {list.map((t, i) => (
              <TechRow
                key={t.id}
                tech={t}
                first={i === 0}
                last={i === list.length - 1}
                onLayout={places.onLayout(t.id)}
                onUp={() => move(i, i - 1)}
                onDown={() => move(i, i + 1)}
                onDrop={(dy) => drop(t.id, dy)}
              />
            ))}
          </View>
          {error ? (
            <T variant="secondary" style={{ color: color.fail, paddingHorizontal: space["4"] }}>
              {error}
            </T>
          ) : null}
        </GestureHandlerRootView>
      </ModalSheet>
    </View>
  );
}

function TechRow({
  tech,
  first,
  last,
  onLayout,
  onUp,
  onDown,
  onDrop,
}: {
  tech: ReorderTech;
  first: boolean;
  last: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onUp: () => void;
  onDown: () => void;
  onDrop: (dy: number) => void;
}) {
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.value }, { scale: lifted.value ? 1.02 : 1 }],
    zIndex: lifted.value ? 10 : 0,
    elevation: lifted.value ? 8 : 0,
  }));
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onStart(() => {
          lifted.set(1);
          haptics.light();
        })
        .onUpdate((e) => {
          dy.set(e.translationY);
        })
        .onEnd((e) => onDrop(e.translationY))
        .onFinalize(() => {
          dy.set(0);
          lifted.set(0);
        }),
    [dy, lifted, onDrop],
  );
  const actions = [
    ...(!first ? [{ name: "moveUp", label: REORDER_TECHS.moveUp }] : []),
    ...(!last ? [{ name: "moveDown", label: REORDER_TECHS.moveDown }] : []),
  ];
  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.row,
        { backgroundColor: color.surface },
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },
        lift,
      ]}
    >
      {/* One item for TalkBack and VoiceOver, with Move Up and Move Down as its actions; the
          arrow buttons stay for everyone else. */}
      <View
        accessible
        accessibilityLabel={tech.name}
        accessibilityActions={actions}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === "moveUp" ? onUp() : onDown())}
        style={styles.name}
      >
        <TechDot tech={tech.color} />
        <Text
          numberOfLines={1}
          style={[type.body, { color: color.text, flexShrink: 1 }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {tech.name}
        </Text>
      </View>
      <Arrow
        icon="arrowUp"
        label={`${REORDER_TECHS.moveUp}, ${tech.name}`}
        off={first}
        onPress={onUp}
      />
      <Arrow
        icon="arrowDown"
        label={`${REORDER_TECHS.moveDown}, ${tech.name}`}
        off={last}
        onPress={onDown}
      />
      {/* Dragging is the quick way; the arrows do the same. */}
      <GestureDetector gesture={gesture}>
        <View
          style={styles.grip}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <WebIcon name="grip" size={22} color={color.textMuted} strokeWidth={2} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

function Arrow({
  icon,
  label,
  off,
  onPress,
}: {
  icon: "arrowUp" | "arrowDown";
  label: string;
  off: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.grip, { opacity: off ? 0.35 : pressed ? 0.5 : 1 }]}
    >
      <WebIcon name={icon} size={20} color={off ? color.textMuted : color.link} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: -space["2"] },
  action: { minHeight: minTap, justifyContent: "center", paddingHorizontal: space["1"] },
  group: { borderRadius: shape.card, overflow: "hidden" },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space["4"],
    paddingRight: space["1"],
  },
  name: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space["3"] },
  grip: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
});
