import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { durationLabel, type CleaningKind, type JobStatus, type LatLng } from "@leakbook/core";
import type { LockTagKind } from "../../lib/dayMap";
import type { DragItem } from "../../lib/scheduleDrag";
import { CleaningNames } from "../maintenance/Cleanings";
import { Button, Card, StatusChip, T } from "../../ui/components";
import { LockTag } from "../../ui/LockTag";
import type { RowGestures } from "../../ui/RowMenu";
import { SwipeActions } from "../../ui/SwipeRow";
import { AddressLine } from "../../ui/NotOnMap";
import { Grip } from "../../ui/Grip";
import { TechDot, TechStripe } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import {
  cardShadow,
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  shape,
  space,
  tabular,
  type,
} from "../../ui/theme";
import { dropTint, useDragHover, useDragSource, useDropZones } from "./ScheduleDrag";
import { unlessSwiping } from "../../ui/swipeQuiet";

// Schedule › Day: one card per person's route (spec 5.6; the website's route-board.tsx
// DayColumn and StopCard): the summary, Optimize and the maps button, then the stops with
// the driving between them, drawn as Today's stops (owner, 2026-10-20: "make the schedule cards
// a little more appealing. Refer to what the today page looks like"): a soft card with the
// stop's number in a round badge, the time, the customer, the kind of stop as a pill, the
// address, and the access notes. Move… (or a swipe left, or touch and hold to drag) moves it.

export interface Stop {
  id: string;
  number: number | null;
  customer: string;
  address: string;
  location: LatLng | null;
  time: string | null;
  status: JobStatus;
  /** A day, time or both lock (shown as an icon), or "Two techs"; never "Started". */
  lock: { label: string; kind: LockTagKind } | null;
  movable: boolean;
  legMin: number | null;
  shortMin: number;
  /** The kind of stop and any map warning, as one line (Needs a Time). */
  note: string | null;
  /** The kind of stop, as a pill: "Leak detection", "Repair", or the second-tech note. */
  tag: string;
  /** Its address wasn't found on the map, so drive times leave it out. */
  notOnMap: boolean;
  /** Gate code, which gate, dogs. */
  access: string | null;
  /** Done for the day (finished, or Mark Complete on Today). */
  done: boolean;
  /** The job's main tech, whose day it leaves when dropped on another day. */
  mainTech: string | null;
  /** The plan's cleanings on this visit's checklist: filter, salt cell (owner, 2026-10-20). */
  cleanings?: { kind: CleaningKind; name: string }[];
}

export interface Route {
  key: string;
  techId: string;
  title: string;
  /** The tech's color key (team and week spec section 3). */
  color?: string | null;
  date: string;
  stops: Stop[];
  driveMin: number;
  backLegMin: number | null;
  overtimeMin: number;
  /** Today or later: can be planned. */
  open: boolean;
}

/** The drive into a stop: Today's dotted line and the minutes ("14 min drive"). */
export function Leg({ text }: { text: string }) {
  return (
    <View style={styles.leg}>
      <View style={[styles.dots, { borderColor: color.textMuted }]} />
      <Text
        style={[type.secondary, { color: color.textMuted, flexShrink: 1 }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * A route's summary line, the overtime warning, then Optimize and the maps button: in the
 * route's card, or under the day's map when one tech's day leads the screen (the website's
 * DayFacts and DayButtons).
 */
export function RouteFacts({
  route: c,
  busy,
  mapsButton,
  onPlan,
}: {
  route: Route;
  busy: boolean;
  mapsButton: ReactNode;
  onPlan: () => void;
}) {
  const summary = c.stops.length
    ? [
        `${c.stops.length} ${c.stops.length === 1 ? "stop" : "stops"}`,
        `${durationLabel(c.driveMin)} driving`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    <>
      {summary ? (
        <T variant="secondary" muted>
          {summary}
        </T>
      ) : null}
      {c.stops.length && (c.open || mapsButton) ? (
        <View style={styles.buttons}>
          {c.open ? (
            <View style={styles.half}>
              {/* "Optimize" (owner, 2026-10-20: "Change 'plan route' to 'optimize'"), with its
                  progress shown first while the day is worked out. */}
              <Button
                kind="secondary"
                title={busy ? "Optimizing…" : "Optimize"}
                accessibilityLabel={busy ? "Optimizing" : `Optimize ${c.title}’s route`}
                onPress={onPlan}
                loading={busy}
                wide
                style={{ paddingHorizontal: 8 }}
              />
            </View>
          ) : null}
          {mapsButton ? <View style={styles.half}>{mapsButton}</View> : null}
        </View>
      ) : null}
    </>
  );
}

export function RouteCard({
  route: c,
  busy,
  mapsButton,
  lead = false,
  onPlan,
  onMove,
  onDirections,
  gesturesFor,
}: {
  route: Route;
  busy: boolean;
  /** The secondary maps button ("Apple Maps" / "Google Maps"), when the day has directions. */
  mapsButton: ReactNode;
  /** The day's map, summary and buttons lead the screen above Needs a Time: just the name here. */
  lead?: boolean;
  onPlan: () => void;
  onMove: (s: Stop) => void;
  onDirections: (s: Stop) => void;
  /** A stop's swipe actions (Move…, Lock…) and touch-and-hold menu (gestures spec section 12). */
  gesturesFor?: (s: Stop) => RowGestures;
}) {
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  return (
    // The whole route takes a drop: between two stops, or last.
    <View
      ref={zoneRef({ kind: "route", id: c.key, tech: c.techId, date: c.date, open: c.open })}
      collapsable={false}
      style={[styles.route, { backgroundColor: dropTint(hover, c.key) }]}
    >
      {lead ? (
        <TechTitle route={c} />
      ) : (
        <Card padding={space["4"]}>
          <TechTitle route={c} />
          <RouteFacts route={c} busy={busy} mapsButton={mapsButton} onPlan={onPlan} />
        </Card>
      )}
      <View style={styles.stops}>
        {c.stops.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: color.well }]}>
            <T muted style={{ textAlign: "center" }}>
              Nothing scheduled.
            </T>
          </View>
        ) : null}
        {c.stops.map((s, i) => (
          <View key={s.id} style={styles.stopWrap}>
            {s.legMin != null ? (
              <Leg text={`${durationLabel(s.legMin)} ${i === 0 ? "from the shop" : "drive"}`} />
            ) : null}
            <StopCard
              stop={s}
              n={i + 1}
              item={
                s.movable
                  ? {
                      id: s.id,
                      status: s.status,
                      from: {
                        kind: "route",
                        route: c.key,
                        tech: s.mainTech ?? c.techId,
                        date: c.date,
                        index: i,
                      },
                    }
                  : null
              }
              route={c.key}
              tech={c.color ?? null}
              onMove={onMove}
              onDirections={onDirections}
              gestures={gesturesFor?.(s)}
            />
          </View>
        ))}
        {c.stops.length && c.backLegMin != null ? (
          <Leg text={`${durationLabel(c.backLegMin)} back to the shop`} />
        ) : null}
      </View>
    </View>
  );
}

/** The tech's name with their color dot before it (team and week spec section 3). */
function TechTitle({ route: c }: { route: Route }) {
  return (
    <View style={styles.techTitle}>
      <TechDot tech={c.color} />
      <T variant="cardTitle" style={{ flexShrink: 1 }}>
        {c.title}
      </T>
    </View>
  );
}

/** The stop's number in a round badge (a green check when done, blue while it's going). */
function Badge({ n, status, done }: { n: number; status: JobStatus; done: boolean }) {
  const going = status === "in_progress" && !done;
  return (
    <View
      style={[styles.badge, { backgroundColor: done ? color.pass : going ? color.link : color.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {done ? (
        <WebIcon name="check" size={16} color={color.onStatus} strokeWidth={3} />
      ) : (
        <Text
          style={[styles.badgeText, tabular, { color: going ? color.onPrimary : color.text }]}
          maxFontSizeMultiplier={1.6}
        >
          {n}
        </Text>
      )}
    </View>
  );
}

/**
 * What a stop shows, on the route and under the finger while it's dragged (`ghost`: no Move…
 * button, nothing to press).
 */
function StopFace({
  stop: s,
  n,
  ghost = false,
  onMove,
  onDirections,
  gestures,
}: {
  stop: Stop;
  n: number;
  ghost?: boolean;
  onMove?: (s: Stop) => void;
  onDirections?: (s: Stop) => void;
  /** Its swipe actions and menu, for TalkBack and VoiceOver too. */
  gestures?: RowGestures;
}) {
  const kind = s.tag;
  return (
    <View
      style={[styles.face, { backgroundColor: color.surface }]}
      accessible={false}
      accessibilityActions={
        gestures
          ? gestures.accessibilityActions
          : s.movable && onMove
            ? [{ name: "move", label: "Move" }]
            : undefined
      }
      onAccessibilityAction={(e) => (gestures ? gestures.onAccessibilityAction(e) : onMove?.(s))}
    >
      <View style={styles.top}>
        <Badge n={n} status={s.status} done={s.done} />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Stop ${n}, ${s.time ?? "no time"}, ${s.customer}, ${kind}${
            s.done ? ", done" : ""
          }`}
          accessibilityHint="Opens the job"
          disabled={ghost}
          onPress={unlessSwiping(() => router.push(`/jobs/${s.id}`))}
          onLongPress={s.movable ? undefined : gestures?.onLongPress}
          style={({ pressed }) => [styles.open, pressed && { opacity: 0.6 }]}
        >
          <Text
            style={[styles.time, tabular, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {s.time ?? "Saving…"}
            {s.number ? (
              <Text style={[type.secondary, { color: color.textMuted }]}>{`  #${s.number}`}</Text>
            ) : null}
          </Text>
          <Text
            numberOfLines={1}
            style={[type.bodyEmphasis, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {s.customer}
          </Text>
        </Pressable>
        {s.movable && !ghost && onMove ? (
          <Button
            kind="quiet"
            title="Move…"
            accessibilityLabel={`Move ${s.customer}`}
            onPress={unlessSwiping(() => onMove(s))}
            style={{ paddingHorizontal: 8 }}
          />
        ) : null}
        {/* The drag grip at the trailing edge (owner, 2026-10-20); shown under the finger too. */}
        {s.movable ? <Grip width={28} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.chips}>
          <View style={[styles.pill, { backgroundColor: color.fill }]}>
            <Text
              style={[type.footnote, face.semiBold, { color: color.text }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {kind}
            </Text>
          </View>
          {s.status !== "scheduled" ? <StatusChip status={s.status} /> : null}
          {s.lock ? <LockTag lock={s.lock} /> : null}
          {/* Not found on the map: a symbol after the address (below). */}
          {!s.notOnMap && !s.location ? (
            <Text
              style={[type.footnote, face.semiBold, { color: color.warning }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              No map location
            </Text>
          ) : null}
        </View>
        {s.address ? (
          <AddressLine notOnMap={s.notOnMap} lineHeight={type.secondary.lineHeight!}>
            <Text
              accessibilityRole="link"
              accessibilityLabel={`${s.address}, directions`}
              onPress={ghost ? undefined : unlessSwiping(() => onDirections?.(s))}
              numberOfLines={2}
              style={[type.secondary, { color: color.link, alignSelf: "flex-start" }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {s.address}
            </Text>
          </AddressLine>
        ) : null}
        {/* Gate code, which gate, dogs, as on Today. */}
        {s.access && !s.done ? (
          <View accessible accessibilityLabel={`Access: ${s.access}`} style={styles.access}>
            <View style={{ marginTop: 1 }}>
              <WebIcon name="key" size={18} color={color.warning} />
            </View>
            <Text
              numberOfLines={2}
              style={[type.secondary, face.medium, { flex: 1, color: color.text }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {s.access}
            </Text>
          </View>
        ) : null}
        {s.cleanings?.length ? <CleaningNames list={s.cleanings} /> : null}
      </View>
    </View>
  );
}

function StopCard({
  stop: s,
  n,
  item,
  route,
  tech,
  onMove,
  onDirections,
  gestures,
}: {
  stop: Stop;
  n: number;
  /** What a drag picks up; null for a stop that can't move (a canceled job). */
  item: DragItem | null;
  route: string;
  /** The route's tech color: a 4 pt stripe on the card's leading edge. */
  tech: string | null;
  onMove: (s: Stop) => void;
  onDirections: (s: Stop) => void;
  gestures?: RowGestures;
}) {
  const hover = useDragHover();
  const { slotRef } = useDropZones();
  // Held and let go without moving: the stop's menu; held and moved: dragged (section 12).
  const { gesture, ref } = useDragSource(
    item,
    () => (
      <View style={styles.clip}>
        <StopFace stop={s} n={n} ghost />
        <TechStripe tech={tech} />
      </View>
    ),
    gestures?.onLongPress,
  );
  const slot = slotRef(s.id, route);
  const content = (
    <View>
      <StopFace stop={s} n={n} onMove={onMove} onDirections={onDirections} gestures={gestures} />
      <TechStripe tech={tech} />
    </View>
  );
  // Swipe left for Move…, right for Lock… (a stop that can't move has neither).
  const leading = gestures ? gestures.leading : null;
  const trailing = gestures
    ? gestures.trailing
    : s.movable
      ? [{ label: "Move", tint: color.link, onPress: () => onMove(s) }]
      : [];
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={(node) => {
          ref(node);
          slot(node);
        }}
        collapsable={false}
        // Left in place, faded, while it's held.
        style={[styles.card, cardShadow(), hover.id === s.id && { opacity: 0.35 }]}
      >
        <View style={styles.clip}>
          {leading || trailing.length ? (
            <SwipeActions leading={leading} trailing={trailing}>
              {content}
            </SwipeActions>
          ) : (
            content
          )}
        </View>
      </View>
    </GestureDetector>
  );
}

export function GhostCard({ stop: s }: { stop: Stop }) {
  return (
    <View style={[styles.face, styles.clip, { backgroundColor: color.surface, paddingRight: 36 }]}>
      <Text
        numberOfLines={1}
        style={[type.bodyEmphasis, { color: color.text }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {s.customer}
        {s.number ? <Text style={{ color: color.textMuted }}>{`  #${s.number}`}</Text> : null}
      </Text>
      <View style={styles.chips}>
        <View style={[styles.pill, { backgroundColor: color.fill }]}>
          <Text
            style={[type.footnote, face.semiBold, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {s.tag}
          </Text>
        </View>
      </View>
      {s.address ? (
        <T variant="secondary" muted numberOfLines={1}>
          {s.address}
        </T>
      ) : null}
      <View style={styles.ghostGrip}>
        <Grip width={28} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A little room around the route so a drop over it shows its tint.
  route: {
    gap: space["3"],
    marginHorizontal: -space["2"],
    padding: space["2"],
    borderRadius: shape.card + space["2"],
  },
  stops: { gap: 0 },
  techTitle: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  stopWrap: { gap: space["1"], marginBottom: space["1"] },
  leg: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["4"],
    paddingVertical: 2,
  },
  dots: { height: 16, borderLeftWidth: 2, borderStyle: "dotted" },
  buttons: { flexDirection: "row", gap: space["2"], marginTop: space["3"] },
  half: { flex: 1 },
  empty: { borderRadius: shape.card, padding: space["4"] },
  card: { borderRadius: shape.card },
  clip: { borderRadius: shape.card, overflow: "hidden" },
  face: {
    gap: space["1"],
    paddingHorizontal: space["3"],
    paddingTop: space["2"],
    paddingBottom: space["3"],
  },
  top: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  open: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" },
  // Lined up with the time and name, beside the stop's number.
  body: { gap: space["1"], paddingLeft: 32 + space["2"] },
  badge: {
    minWidth: 32,
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: space["1"],
  },
  badgeText: { fontFamily: font.displayBold, fontSize: 17, lineHeight: 22 },
  time: { fontFamily: font.displayBold, fontSize: 20, lineHeight: 26 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space["2"],
  },
  pill: { borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 2 },
  access: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  ghostGrip: { position: "absolute", right: 4, top: 0, bottom: 0, justifyContent: "center" },
});
