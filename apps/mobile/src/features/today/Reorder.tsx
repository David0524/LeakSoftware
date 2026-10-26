import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  formatTime,
  type Company,
  type DriveFn,
  type TodayMove,
  friendlyError,
} from "@leakbook/core";
import type { JobView } from "../../data/jobs";
import { planContext } from "../../data/schedule";
import { getServices } from "../../lib/services";
import {
  canReorderDay,
  dropPlace,
  reorderChange,
  reorderRows,
  writeJobs,
  type ReorderAction,
  type ReorderRow as RowInfo,
  type ReorderStop,
} from "../../lib/todayReorder";
import { Pill, useReduceMotion } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { useUndoWindow } from "../../ui/Undo";
import { WebIcon } from "../../ui/WebIcon";
import { DriveChip } from "../../ui/DriveChip";
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
// seconds. Reorder in the bar switches the list to edit mode, as iOS Reminders: a drag handle on
// each stop that can move (Move Up / Move Down are screen-reader actions), a lock and the reason
// on those that can't, and Done to end it. Each move is the shared rule's (core
// todayMoveIndex, then the Schedule's moveJobChange), as the website's, worked out from this
// phone's jobs and saved through the sync layer at once.

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
    () => new Map(reorderRows(plan, ctx.today, ctx.timeZone).map((r) => [r.id, r])),
    [plan, ctx.today, ctx.timeZone],
  );
  const allowed = canReorderDay({ manager, me, techId });
  const anyMoves = [...rows.values()].some((r) => r.canUp || r.canDown);
  // Editing and messages belong to the day they were on: another tech's day starts fresh.
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<{ tech: string; text: string } | null>(null);
  const undo = useUndoWindow();
  const [undoFor, setUndoFor] = useState<{ jobId: string; from: DoLaterFrom } | null>(null);
  const editing = allowed && editingFor === techId;

  /** Saves the move; what Undo writes back, or null when refused or failed. */
  function move(jobId: string, to: TodayMove) {
    const change = reorderChange(
      ctx,
      { stops: plan, jobId, to, techId, seesAll: manager, userId: me },
      drive,
    );
    if (change.error) {
      haptics.warning();
      setErrorFor({ tech: techId, text: change.error });
      return null;
    }
    try {
      writeJobs(getServices().sync, company.id, change.updates);
      setErrorFor(null);
      return { before: change.undo, message: change.message ?? "Moved." };
    } catch (e) {
      setErrorFor({ tech: techId, text: friendlyError(e) });
      return null;
    }
  }

  function act(jobId: string, action: ReorderAction) {
    if (move(jobId, action)) haptics.selection();
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
      const done = move(jobId, "later");
      if (!done) return;
      haptics.success();
      setUndoFor({ jobId, from });
      // Undo writes back the rows as they were before (not a second move).
      undo.start(done.message, () => {
        try {
          writeJobs(getServices().sync, company.id, done.before);
        } catch (e) {
          setErrorFor({ tech: techId, text: friendlyError(e) });
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
      const place = dropPlace(plan, jobId, beforeId, ctx.today);
      if (place === null) return;
      if (move(jobId, place)) haptics.selection();
    },
  };
}

export type TodayReorder = ReturnType<typeof useTodayReorder>;

/** A row's middle and height in the list (layout coordinates). */
export interface RowSlot {
  mid: number;
  h: number;
}
/** The row being dragged (its index), where it would land, and the room it takes. */
export interface RowDrag {
  from: number;
  place: number;
  room: number;
}
const NO_DRAG: RowDrag = { from: -1, place: -1, room: 0 };
/** Move Up, Move Down and Do Later: the rows glide to their new places. */
const ROW_GLIDE = LinearTransition.duration(300);
/** The gap under each row (styles.wrap). */
const ROW_GAP = space["1"];

/**
 * Shared by the rows while one is dragged (owner, 2026-10-21: reordering jobs as smooth as
 * Reorder Techs): the rows in the way slide aside on the UI thread, the dropped row settles
 * into its place, and when the list comes back in its new order every row glides there.
 */
export function useRowDrag() {
  const drag = useSharedValue<RowDrag>(NO_DRAG);
  const slots = useSharedValue<RowSlot[]>([]);
  return { drag, slots, reset: () => drag.set(NO_DRAG) };
}
export type RowDragState = ReturnType<typeof useRowDrag>;

/** Where row `index` sits while `d` is dragged: its height up, down, or in place. */
function roomShift(d: RowDrag, index: number) {
  "worklet";
  if (d.from < 0 || d.from === index) return 0;
  if (d.from < d.place && index > d.from && index <= d.place) return -d.room;
  if (d.from > d.place && index >= d.place && index < d.from) return d.room;
  return 0;
}

/** Positions of the rows in the list while reordering, for where a dragged stop lands. */
export function useRowPlaces() {
  const places = useRef(new Map<string, { y: number; height: number }>());
  return {
    /** Each row's middle and height, in `order`, for the rows that make room during a drag. */
    slots(order: string[]): RowSlot[] {
      return order.map((id) => {
        const p = places.current.get(id);
        return p ? { mid: p.y + p.height / 2, h: p.height } : { mid: 0, h: 0 };
      });
    },
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
 * ("Started", "Locked", "Time locked"). `drive` is the drive into it, a chip before the handle
 * (docs/design/2026-10-21-schedule-tile.md: no drive lines between stops).
 */
export function ReorderStopRow({
  job,
  n,
  timeZone,
  info,
  now,
  drive,
  onLayout,
  onAct,
  onDragging,
  onDrop,
  index,
  rowDrag,
  onSlots,
  glide,
}: {
  /** Glide to a new place when the order changes (not right after a drop, which settles). */
  glide: boolean;
  /** Its place among the rows in Reorder (top first). */
  index: number;
  rowDrag: RowDragState;
  /** A drag started: the rows' slots, measured now. */
  onSlots: () => void;
  job: JobView;
  n: number;
  timeZone: string;
  info: RowInfo;
  /** The stop on Today's card. */
  now: boolean;
  /** The drive into it, minutes; null when it isn't known (no chip). */
  drive: number | null;
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
  const reduceMotion = useReduceMotion();
  const layout = glide && !reduceMotion ? ROW_GLIDE : undefined;
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const { drag, slots } = rowDrag;
  // A new place in the list (the move was saved): the drag's offsets give way to the layout.
  useLayoutEffect(() => {
    dy.set(0);
    rowDrag.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  const lift = useAnimatedStyle(() => {
    const room = roomShift(drag.value, index);
    return {
      transform: [
        {
          translateY:
            drag.value.from === index
              ? dy.value
              : reduceMotion
                ? room
                : withTiming(room, { duration: 200 }),
        },
        { scale: lifted.value ? 1.02 : 1 },
      ],
      zIndex: lifted.value ? 10 : 0,
      elevation: lifted.value ? 8 : 0,
    };
  });
  const begin = () => {
    haptics.light();
    onDragging(true);
    onSlots();
  };
  // Not let go in a new place (or the move was refused): everything slides back.
  const dropped = (moved: number) => {
    onDrop(moved);
    setTimeout(() => {
      dy.set(reduceMotion ? 0 : withTiming(0, { duration: 200 }));
      rowDrag.reset();
    }, 400);
  };
  // The drag runs on the UI thread (owner, 2026-10-21: Today "freezes"); only its start and
  // its drop call into JavaScript.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(movable)
        .minDistance(0)
        .onStart(() => {
          lifted.set(1);
          scheduleOnRN(begin);
        })
        .onUpdate((e) => {
          dy.set(e.translationY);
          const s = slots.value;
          const me = s[index];
          if (!me) return;
          const mid = me.mid + e.translationY;
          let place = 0;
          for (let k = 0; k < s.length; k++) if (k !== index && s[k]!.mid < mid) place++;
          const d = drag.value;
          if (d.from !== index || d.place !== place)
            drag.set({ from: index, place, room: me.h + ROW_GAP });
        })
        .onEnd((e) => {
          // The dropped row settles where the others made room for it.
          const s = slots.value;
          const d = drag.value;
          let to = 0;
          if (d.from === index && d.place !== index) {
            if (d.place > index) for (let k = index + 1; k <= d.place; k++) to += s[k]!.h + ROW_GAP;
            else for (let k = d.place; k < index; k++) to -= s[k]!.h + ROW_GAP;
          }
          dy.set(reduceMotion ? to : withTiming(to, { duration: 150 }));
          scheduleOnRN(dropped, e.translationY);
        })
        .onFinalize(() => {
          lifted.set(0);
          scheduleOnRN(onDragging, false);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movable, index, reduceMotion, onDragging, onDrop],
  );
  const actions = [
    ...(info.canUp ? [{ name: "moveUp", label: "Move Up" }] : []),
    ...(info.canDown ? [{ name: "moveDown", label: "Move Down" }] : []),
  ];
  return (
    <Animated.View onLayout={onLayout} style={[styles.wrap, lift]} layout={layout}>
      <View
        style={[
          styles.card,
          { backgroundColor: color.surface },
          cardShadow(),
          now && { borderWidth: 2, borderColor: color.link },
        ]}
      >
        {/* One item for TalkBack and VoiceOver, with Move Up and Move Down as its actions; no
            buttons on screen (owner, 2026-10-22: they "take up so much space and are redundant
            to the drag"). */}
        <View
          accessible
          accessibilityLabel={`Stop ${n}: ${time} ${name}${info.lock ? `, ${info.lock}` : ""}`}
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
          {drive != null ? <DriveChip minutes={drive} /> : null}
          {info.lock ? (
            <View style={styles.lock}>
              <WebIcon name="lock" size={16} color={color.textMuted} strokeWidth={2} />
              <Text
                style={[type.footnote, { color: color.textMuted }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {info.lock}
              </Text>
            </View>
          ) : (
            // Dragging; screen readers use the row's Move Up and Move Down actions.
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
});
