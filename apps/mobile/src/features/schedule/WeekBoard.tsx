import { router } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle } from "react-native-svg";
import { durationLabel, formatDay, startLegLabel } from "@leakbook/core";
import type { DragItem } from "../../lib/scheduleDrag";
import { StatusChip, T } from "../../ui/components";
import { Grip } from "../../ui/Grip";
import { LockTag } from "../../ui/LockTag";
import { NotOnMapTag } from "../../ui/NotOnMap";
import type { RowGestures } from "../../ui/RowMenu";
import { useMenu } from "../../ui/Select";
import { SwipeActions } from "../../ui/SwipeRow";
import { TechDot, TechStripe } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import {
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  type,
} from "../../ui/theme";
import type { Route, Stop } from "./RouteCard";
import { dropTint, useDragHover, useDragSource, useDropZones } from "./ScheduleDrag";
import { unlessSwiping } from "../../ui/swipeQuiet";

// Schedule › Week with the routes in it (owner, 2026-10-20: "On routes, you can't optimize or
// rearrange placement … Let's just build that all into Week"; docs/design/2026-10-20-team-week.md
// section 6). Each day lists every tech's row: their color dot and name, the stops in route
// order (each with the tech's 4 pt stripe), and the day's "⋯" menu with Optimize. Touch and
// hold a stop to drag it within the day, to another tech's row or another day; a plan visit
// asks first (section 5). Phones keep these cards; the wide sidebar and one-line cards are the
// website's (this app has no wide layout).

export const WeekDay = memo(function WeekDay({
  date,
  today,
  routes,
  unassigned,
  busy,
  canOptimize,
  onOpenDay,
  onOptimize,
  gesturesFor,
}: {
  date: string;
  today: string;
  /** Every tech in view's route for the day. */
  routes: Route[];
  /** Booked this day with nobody yet (everyone in view). */
  unassigned: Stop[];
  /** The day is being optimized: its menu says so. */
  busy: boolean;
  canOptimize: boolean;
  onOpenDay: () => void;
  /** Optimize these routes (one tech's, or all of the day's). */
  onOptimize: (routes: Route[]) => void;
  gesturesFor: (s: Stop) => RowGestures;
}) {
  const menu = useMenu();
  const isToday = date === today;
  const open = date >= today;
  const withStops = routes.filter((r) => r.stops.length);
  const stops = withStops.reduce((n, r) => n + r.stops.length, 0) + unassigned.length;
  const title = `${formatDay(date, "long")}${isToday ? " · Today" : ""}`;
  // The day's "⋯": Optimize Day (every tech's route), each tech's on its own, and Open Day.
  const actions = () =>
    menu.open({
      title,
      items: [
        ...(open && canOptimize && withStops.length
          ? [
              ...(withStops.length > 1
                ? [{ label: "Optimize Day", onPress: () => onOptimize(withStops) }]
                : []),
              ...withStops.map((r) => ({
                label: withStops.length > 1 ? `Optimize ${r.title}` : "Optimize",
                dot: r.color ?? null,
                onPress: () => onOptimize([r]),
              })),
            ]
          : []),
        { label: "Open Day", onPress: onOpenDay },
      ],
    });
  return (
    <View style={{ gap: space["2"] }}>
      <View style={styles.dayHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${stops === 1 ? "1 stop" : `${stops} stops`}`}
          accessibilityHint="Opens the day"
          onPress={onOpenDay}
          style={({ pressed }) => [styles.dayTitle, pressed && { opacity: 0.6 }]}
        >
          <Text
            style={[type.subHeading, { color: isToday ? color.link : color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {title}
          </Text>
          <T variant="secondary" muted style={tabular}>
            {busy
              ? "Optimizing…"
              : stops
                ? stops === 1
                  ? "1 stop"
                  : `${stops} stops`
                : "Nothing scheduled"}
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${formatDay(date, "long")}`}
          onPress={actions}
          style={({ pressed }) => [styles.more, pressed && { backgroundColor: color.iconTint }]}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.link}>
            <Circle cx={6} cy={12} r={1.8} />
            <Circle cx={12} cy={12} r={1.8} />
            <Circle cx={18} cy={12} r={1.8} />
          </Svg>
        </Pressable>
      </View>
      {routes.map((r) => (
        <WeekRoute key={r.key} route={r} gesturesFor={gesturesFor} />
      ))}
      {unassigned.length ? (
        <View style={{ gap: space["1"] }}>
          <View style={styles.techHead}>
            <T variant="bodyEmphasis">No tech yet</T>
          </View>
          <View style={[styles.rows, { backgroundColor: color.surface }]}>
            {unassigned.map((s, i) => (
              <WeekStop
                key={s.id}
                stop={s}
                n={i + 1}
                first={i === 0}
                tech={null}
                item={s.movable ? { id: s.id, status: s.status, from: { kind: "tray" } } : null}
                route={null}
                gestures={gesturesFor(s)}
              />
            ))}
          </View>
        </View>
      ) : null}
      {menu.element}
    </View>
  );
});

/** One tech's day: dot, name and totals, then the stops; the whole row takes a drop. */
function WeekRoute({
  route: r,
  gesturesFor,
}: {
  route: Route;
  gesturesFor: (s: Stop) => RowGestures;
}) {
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  const summary = r.stops.length
    ? [
        r.stops.length === 1 ? "1 stop" : `${r.stops.length} stops`,
        r.driveMin ? `${durationLabel(r.driveMin)} driving` : null,
        // Someone who starts from home: the day's driving is counted from there.
        r.driveMin && r.startLabel === "home" ? startLegLabel("home") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    <View
      ref={zoneRef({ kind: "route", id: r.key, tech: r.techId, date: r.date, open: r.open })}
      collapsable={false}
      style={[styles.route, { backgroundColor: dropTint(hover, r.key) }]}
    >
      <View
        style={styles.techHead}
        accessible
        accessibilityLabel={`${r.title}${summary ? `, ${summary}` : ", nothing scheduled"}`}
      >
        <TechDot tech={r.color} />
        <Text
          numberOfLines={1}
          style={[type.bodyEmphasis, { color: color.text, flexShrink: 1 }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {r.title}
        </Text>
        {summary ? (
          <T variant="secondary" muted style={[tabular, { flexShrink: 1 }]} numberOfLines={1}>
            {summary}
          </T>
        ) : null}
      </View>
      {r.stops.length ? (
        <View style={[styles.rows, { backgroundColor: color.surface }]}>
          {r.stops.map((s, i) => (
            <WeekStop
              key={s.id}
              stop={s}
              n={i + 1}
              first={i === 0}
              tech={r.color ?? null}
              route={r.key}
              item={
                s.movable
                  ? {
                      id: s.id,
                      status: s.status,
                      from: {
                        kind: "route",
                        route: r.key,
                        tech: s.mainTech ?? r.techId,
                        date: r.date,
                        index: i,
                      },
                    }
                  : null
              }
              gestures={gesturesFor(s)}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: color.well }]}>
          <T variant="secondary" muted>
            Nothing scheduled
          </T>
        </View>
      )}
    </View>
  );
}

/** A stop as the week shows it: stripe, number, time, customer, kind, and the grip. */
function StopFace({ stop: s, n, tech }: { stop: Stop; n: number; tech: string | null }) {
  return (
    <View style={styles.face}>
      {tech !== null ? <TechStripe tech={tech} /> : null}
      <View
        style={[styles.badge, { backgroundColor: s.done ? color.pass : color.fill }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {s.done ? (
          <WebIcon name="check" size={14} color={color.onStatus} strokeWidth={3} />
        ) : (
          <Text
            style={[styles.badgeText, tabular, { color: color.text }]}
            maxFontSizeMultiplier={1.6}
          >
            {n}
          </Text>
        )}
      </View>
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[type.body, face.semiBold, { color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {s.customer}
        </Text>
        <View style={styles.line}>
          <Text
            numberOfLines={1}
            style={[type.secondary, tabular, { color: color.textMuted, flexShrink: 1 }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {[s.time, s.number ? `#${s.number}` : null, s.tag].filter(Boolean).join(" · ")}
          </Text>
          {s.lock ? <LockTag lock={s.lock} /> : null}
          {s.notOnMap ? <NotOnMapTag lineHeight={type.secondary.lineHeight!} /> : null}
        </View>
      </View>
      {s.status !== "scheduled" ? <StatusChip status={s.status} /> : null}
      {s.movable ? <Grip width={28} /> : null}
    </View>
  );
}

function WeekStop({
  stop: s,
  n,
  first,
  tech,
  item,
  route,
  gestures,
}: {
  stop: Stop;
  n: number;
  first: boolean;
  /** The row's tech color (null: nobody yet, no stripe). */
  tech: string | null;
  item: DragItem | null;
  /** The route it's on, so a drop lands between stops. */
  route: string | null;
  gestures: RowGestures;
}) {
  const hover = useDragHover();
  const { slotRef } = useDropZones();
  // Held and let go without moving: the stop's menu; held and moved: dragged.
  const { gesture, ref } = useDragSource(
    item,
    () => (
      <View style={[styles.ghost, { backgroundColor: color.surface }]}>
        <StopFace stop={s} n={n} tech={tech} />
      </View>
    ),
    gestures.onLongPress,
  );
  const slot = route ? slotRef(s.id, route) : null;
  const row = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Stop ${n}, ${s.time ?? "no time"}, ${s.customer}, ${s.tag}${s.done ? ", done" : ""}`}
      accessibilityHint="Opens the job"
      accessibilityActions={gestures.accessibilityActions}
      onAccessibilityAction={gestures.onAccessibilityAction}
      onPress={unlessSwiping(() => router.push(`/jobs/${s.id}`))}
      onLongPress={item ? undefined : gestures.onLongPress}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [{ backgroundColor: pressed ? color.rowPressed : color.surface }]}
    >
      <StopFace stop={s} n={n} tech={tech} />
    </Pressable>
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={(node) => {
          ref(node);
          slot?.(node);
        }}
        collapsable={false}
        style={[
          !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },
          hover.id === s.id && { opacity: 0.35 },
        ]}
      >
        {gestures.leading || gestures.trailing.length ? (
          <SwipeActions leading={gestures.leading} trailing={gestures.trailing}>
            {row}
          </SwipeActions>
        ) : (
          row
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  dayTitle: { flex: 1, minHeight: minTap, justifyContent: "center", paddingTop: 8 },
  more: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // A little room around the row so a drop over it shows its tint.
  route: {
    gap: space["1"],
    marginHorizontal: -space["2"],
    padding: space["2"],
    borderRadius: shape.card + space["2"],
  },
  techHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    minHeight: 28,
    paddingHorizontal: space["1"],
  },
  rows: { borderRadius: shape.grouped, overflow: "hidden" },
  empty: {
    borderRadius: shape.grouped,
    paddingHorizontal: space["4"],
    minHeight: minTap,
    justifyContent: "center",
  },
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    minHeight: minTap + 12,
    paddingLeft: space["3"] + 4,
    paddingRight: 4,
    paddingVertical: space["2"],
  },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.displayBold, fontSize: 15, lineHeight: 20 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: 4 },
  ghost: { borderRadius: shape.grouped, overflow: "hidden" },
});
