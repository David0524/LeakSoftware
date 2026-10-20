import { useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { formatTime, type Company, type DriveFn } from "@leakbook/core";
import type { JobView } from "../../data/jobs";
import { planContext } from "../../data/schedule";
import { getServices } from "../../lib/services";
import {
  actionPlace,
  canReorderDay,
  dropPlace,
  reorderChange,
  reorderRows,
  saveMove,
  writeJobs,
  type ReorderAction,
  type ReorderRow as RowInfo,
  type ReorderStop,
} from "../../lib/todayReorder";
import { Button, Pill } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { useUndoWindow } from "../../ui/Undo";
import { WebIcon } from "../../ui/WebIcon";
import {
  cardShadow,
  color,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  type,
} from "../../ui/theme";

// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md), as the
// website. Do Later on a stop (its row's button, a trailing swipe, and the card's button) puts
// it after every stop still to do, with "Moved to 2:15 PM" and Undo where the button was for 5
// seconds. Reorder at the end of the day's line switches the list to edit mode, as iOS
// Reminders: a drag handle and Move Up / Move Down on each stop that can move, a lock and the
// reason on those that can't, and Done to end it. Each move is the Schedule's (core
// moveJobChange), worked out from this phone's jobs and saved through the sync layer at once.

const asStop = (j: JobView): ReorderStop => ({ ...j, property: j.property ?? null });

/** Where Do Later was pressed, so its Undo shows in the same place. */
export type DoLaterFrom = "card" | "row";

export function useTodayReorder(input: {
  company: Company;
  /** The day on screen, in route order. */
  stops: JobView[];
  techId: string;
  me: string;
  manager: boolean;
  drive: DriveFn;
}) {
  const { company, stops, techId, me, manager, drive } = input;
  const ctx = planContext(company);
  const plan = useMemo(() => stops.map(asStop), [stops]);
  const rows = useMemo(
    () => new Map(reorderRows(plan, techId, ctx.today, ctx.timeZone).map((r) => [r.id, r])),
    [plan, techId, ctx.today, ctx.timeZone],
  );
  const allowed = canReorderDay({ manager, me, techId });
  const anyMoves = [...rows.values()].some((r) => r.canUp || r.canDown);
  // Editing and messages belong to the day they were on: another tech's day starts fresh.
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<{ tech: string; text: string } | null>(null);
  const undo = useUndoWindow();
  const [undoFor, setUndoFor] = useState<{ jobId: string; from: DoLaterFrom } | null>(null);
  const editing = allowed && editingFor === techId;

  /** Saves the stop at `place`; what Undo writes back, or null when refused or failed. */
  function move(jobId: string, place: number) {
    const change = reorderChange(
      ctx,
      { stops: plan, jobId, place, techId, seesAll: manager, userId: me },
      drive,
    );
    if (change.error) {
      haptics.warning();
      setErrorFor({ tech: techId, text: change.error });
      return null;
    }
    try {
      const before = saveMove(getServices().sync, company.id, change.updates);
      setErrorFor(null);
      return { before, message: change.message ?? "Moved." };
    } catch (e) {
      setErrorFor({ tech: techId, text: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  function act(jobId: string, action: ReorderAction) {
    const i = plan.findIndex((s) => s.id === jobId);
    if (i < 0) return;
    if (move(jobId, actionPlace(plan.length, i, action))) haptics.selection();
  }

  return {
    /** Reorder shows: your day, or any day for owners and admins, with a stop that can move. */
    canReorder: allowed && anyMoves,
    editing,
    setEditing: (on: boolean) => setEditingFor(on ? techId : null),
    error: errorFor?.tech === techId ? errorFor.text : null,
    row: (id: string): RowInfo | undefined => (allowed ? rows.get(id) : undefined),
    act,
    /** Do Later from the card or a row: saved at once, with Undo in its place for 5 seconds. */
    doLater(jobId: string, from: DoLaterFrom) {
      const done = move(jobId, plan.length - 1);
      if (!done) return;
      haptics.success();
      setUndoFor({ jobId, from });
      // Undo writes back the rows as they were before (not a second move).
      undo.start(done.message, () => {
        try {
          writeJobs(getServices().sync, company.id, done.before);
        } catch (e) {
          setErrorFor({ tech: techId, text: e instanceof Error ? e.message : String(e) });
        }
      });
    },
    /** The Undo text to show for this stop here, if any. */
    undoText(jobId: string, from: DoLaterFrom): string | null {
      return undo.shown && undoFor?.jobId === jobId && undoFor.from === from
        ? undo.shown.text
        : null;
    },
    /** The card's Undo after its Do Later (the card has moved on to the next stop by then). */
    cardUndo: undo.shown && undoFor?.from === "card" ? undo.shown.text : null,
    undo: undo.undo,
    /** A drag let go just before `beforeId` (null: at the end). */
    drop(jobId: string, beforeId: string | null) {
      const i = plan.findIndex((s) => s.id === jobId);
      const place = dropPlace(plan, jobId, beforeId, techId, ctx.today, ctx.timeZone);
      if (i < 0 || place === i) return;
      if (move(jobId, place)) haptics.selection();
    },
  };
}

export type TodayReorder = ReturnType<typeof useTodayReorder>;

/** Positions of the rows in the list while reordering, for where a dragged stop lands. */
export function useRowPlaces() {
  const places = useRef(new Map<string, { y: number; height: number }>());
  return {
    onLayout: (id: string) => (e: LayoutChangeEvent) =>
      places.current.set(id, { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }),
    /** The row a stop dragged `dy` points lands before, among `order` (null: the end). */
    landsBefore(id: string, dy: number, order: string[]): string | null {
      const me = places.current.get(id);
      if (!me) return null;
      const middle = me.y + me.height / 2 + dy;
      for (const other of order) {
        if (other === id) continue;
        const p = places.current.get(other);
        if (p && p.y + p.height / 2 > middle) return other;
      }
      return null;
    },
  };
}

/**
 * A stop in Reorder's edit mode: its number, time and customer, then the drag handle (≡) at the
 * trailing edge with Move Up and Move Down under the name, or a lock and why it can't move
 * ("Started", "Promised for 9:00 AM"). `leg` is the drive into it, which moves with it.
 */
export function ReorderStopRow({
  job,
  n,
  timeZone,
  info,
  now,
  leg,
  onLayout,
  onAct,
  onDragging,
  onDrop,
}: {
  job: JobView;
  n: number;
  timeZone: string;
  info: RowInfo;
  /** The stop on Today's card. */
  now: boolean;
  leg: ReactNode;
  onLayout: (e: LayoutChangeEvent) => void;
  onAct: (action: ReorderAction) => void;
  /** A drag started (true) or ended (false): the page stops scrolling meanwhile. */
  onDragging: (on: boolean) => void;
  /** Let go after dragging `dy` points. */
  onDrop: (dy: number) => void;
}) {
  const name = job.customer?.name ?? "Customer";
  const time = job.scheduled_start ? formatTime(job.scheduled_start, timeZone) : "";
  const movable = !info.lock;
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
        .enabled(movable)
        .minDistance(0)
        .onStart(() => {
          lifted.set(1);
          haptics.light();
          onDragging(true);
        })
        .onUpdate((e) => {
          dy.set(e.translationY);
        })
        .onEnd((e) => onDrop(e.translationY))
        .onFinalize(() => {
          dy.set(0);
          lifted.set(0);
          onDragging(false);
        }),
    [movable, dy, lifted, onDragging, onDrop],
  );
  const actions = [
    ...(info.canUp ? [{ name: "moveUp", label: "Move Up" }] : []),
    ...(info.canDown ? [{ name: "moveDown", label: "Move Down" }] : []),
  ];
  return (
    <Animated.View onLayout={onLayout} style={[styles.wrap, lift]}>
      {leg}
      <View
        style={[
          styles.card,
          { backgroundColor: color.surface },
          cardShadow(),
          now && { borderWidth: 2, borderColor: color.link },
        ]}
      >
        {/* One item for TalkBack and VoiceOver, with Move Up and Move Down as its actions; the
            buttons below stay for everyone else. */}
        <View
          accessible
          accessibilityLabel={`Stop ${n}: ${time} ${name}${info.lock ? `, ${info.lock.label}` : ""}`}
          accessibilityActions={actions}
          onAccessibilityAction={(e) =>
            onAct(e.nativeEvent.actionName === "moveUp" ? "up" : "down")
          }
          style={styles.top}
        >
          <View
            style={[styles.number, { backgroundColor: now ? color.link : color.bg }]}
            importantForAccessibility="no"
          >
            <Text style={[styles.numberText, { color: now ? color.bg : color.text }]}>{n}</Text>
          </View>
          <View style={styles.summary}>
            <Text style={[styles.time, tabular, { color: color.text }]}>{time}</Text>
            <Text
              numberOfLines={1}
              style={[type.bodyEmphasis, { color: color.text, flexShrink: 1 }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {name}
            </Text>
            {now ? <Pill label="Now" color={color.water} /> : null}
          </View>
          {info.lock ? (
            <View style={styles.lock}>
              <WebIcon name="lock" size={16} color={color.textMuted} strokeWidth={2} />
              <Text
                style={[type.footnote, { color: color.textMuted }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {info.lock.label}
              </Text>
            </View>
          ) : (
            // Dragging is the quick way; Move Up and Move Down below do the same.
            <GestureDetector gesture={gesture}>
              <View
                style={styles.grip}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <WebIcon name="grip" size={22} color={color.textMuted} strokeWidth={2} />
              </View>
            </GestureDetector>
          )}
        </View>
        {movable && (info.canUp || info.canDown) ? (
          <View style={styles.buttons}>
            <Button
              kind="secondary"
              small
              title="Move Up"
              disabled={!info.canUp}
              accessibilityLabel={`Move Up, ${name}`}
              onPress={() => onAct("up")}
            />
            <Button
              kind="secondary"
              small
              title="Move Down"
              disabled={!info.canDown}
              accessibilityLabel={`Move Down, ${name}`}
              onPress={() => onAct("down")}
            />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space["1"], marginBottom: space["1"] },
  card: { borderRadius: shape.card, overflow: "hidden" },
  top: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["3"],
    paddingRight: space["1"],
    paddingVertical: space["2"],
  },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontFamily: font.displayBold, fontSize: 17, fontVariant: ["tabular-nums"] },
  time: { fontFamily: font.displayBold, fontSize: 17 },
  summary: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space["2"],
  },
  lock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: space["2"],
    flexShrink: 1,
  },
  grip: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space["2"],
    paddingLeft: space["3"] + 32 + space["2"],
    paddingRight: space["3"],
    paddingBottom: space["3"],
  },
});
