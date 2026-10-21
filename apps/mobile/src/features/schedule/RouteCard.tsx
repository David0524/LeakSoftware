import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { LinearTransition } from "react-native-reanimated";
import {
  durationLabel,
  startLegLabel,
  type CleaningKind,
  type JobStatus,
  type LatLng,
  type RouteStartLabel,
} from "@leakbook/core";
import type { LockTagKind } from "../../lib/dayMap";
import type { DragItem } from "../../lib/scheduleDrag";
import { Button, Card, T, useReduceMotion } from "../../ui/components";
import type { RowGestures } from "../../ui/RowMenu";
import { TechDot, TechStripe } from "../../ui/TechDot";
import { driveFromOffMap, driveHomeLine } from "../../lib/scheduleTile";
import { cardShadow, color, MAX_TEXT_SCALE, shape, space, type } from "../../ui/theme";
import {
  dropTint,
  justDropped,
  useDragHover,
  useDragSource,
  useDropZones,
  useSlide,
} from "./ScheduleDrag";
import { DriveHome, ScheduleCardFace, StopTileFace, TILE_INSET, tileLabel } from "./ScheduleCard";

// Schedule › Day: one card per person's route (spec 5.6; the website's route-board.tsx
// DayColumn and StopCard): the summary, Optimize and the maps button, then the stops with
// the driving between them, drawn as Today's stops (owner, 2026-10-20: "make the schedule cards
// a little more appealing. Refer to what the today page looks like"): a soft card with the
// stop's number in a round badge, the time, the customer, the kind of stop as a pill, the
// address, and the access notes; since 2026-10-21 the two-line schedule card
// (ScheduleCard.tsx). Its grip drags it; touch and hold opens its menu, with Move….

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
  /** The kind of visit alone ("Repair"): the first line of the stop's menu title. */
  visit: string;
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
  /** Where the tech's day starts and ends: "home" for someone who starts there. */
  startLabel?: RouteStartLabel;
  /** That start has a map point (else the first stop gets no drive chip). */
  startOnMap?: boolean;
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
        // Someone who starts from home: the day's driving is counted from there.
        c.startLabel === "home" ? startLegLabel("home") : null,
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

/** How a moved stop glides to its place (none with Reduce Motion). */
const ROW_SLIDE = LinearTransition.duration(300);

export function RouteCard({
  route: c,
  busy,
  mapsButton,
  lead = false,
  onPlan,
  onMove,
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
  /** A stop's touch-and-hold menu and TalkBack actions (Move…, Lock…; gestures spec 12). */
  gesturesFor?: (s: Stop) => RowGestures;
}) {
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  // Just dropped, the stops are already in their new places (they slid there during the drag).
  const slide = useReduceMotion() || hover.id != null || justDropped(hover) ? undefined : ROW_SLIDE;
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
      {c.stops.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: color.well }]}>
          <T muted style={{ textAlign: "center" }}>
            Nothing scheduled.
          </T>
        </View>
      ) : (
        <StopBlock route={c}>
          {c.stops.map((s, i, all) => (
            // A moved stop glides to its new place (owner, 2026-10-21: as smooth as Reorder
            // Techs); the move is saved on the phone at once, so the list changes right away.
            <Reanimated.View key={s.id} layout={slide}>
              <Slide id={s.id} route={c.key} position={i}>
                <StopCard
                  stop={s}
                  n={i + 1}
                  first={i === 0}
                  fromOffMap={driveFromOffMap(i, all.map(offMap), c.startOnMap ?? true)}
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
                  gestures={gesturesFor?.(s)}
                />
              </Slide>
            </Reanimated.View>
          ))}
        </StopBlock>
      )}
    </View>
  );
}

/**
 * One tech's day as one block (docs/design/2026-10-21-schedule-tile.md): their color stripe on
 * its leading edge, the tiles touching with hairlines after the stop number, and the drive home
 * as its last line. Day and Week.
 */
export function StopBlock({ route: c, children }: { route: Route; children: ReactNode }) {
  const home = driveHomeLine(c.backLegMin, c.startLabel ?? "shop");
  return (
    <View style={[styles.block, { backgroundColor: color.surface }, cardShadow()]}>
      <View style={styles.blockClip}>
        {children}
        {home ? <DriveHome text={home} /> : null}
        <TechStripe tech={c.color ?? null} />
      </View>
    </View>
  );
}

/** A stop is off the map: drive times leave it out. */
export function offMap(s: Stop): boolean {
  return s.notOnMap || Boolean(s.address && !s.location);
}

/** A tile's hairline, after the stop number (not on the first). */
export function TileHairline() {
  return (
    <View pointerEvents="none" style={[styles.hairline, { backgroundColor: color.separator }]} />
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

/**
 * A stop on a tech's day: the schedule card (ScheduleCard.tsx). Its body never drags, so a
 * page of cards always scrolls (owner, 2026-10-21: "I'm still struggling to scroll when I have
 * a page full of job tiles"): the grip picks it up at once, and the other stops slide aside as
 * it passes. Touch and hold on the body opens its menu; only the customer's name opens the job.
 */
function StopCard({
  stop: s,
  n,
  first,
  fromOffMap,
  item,
  route,
  tech,
  onMove,
  gestures,
}: {
  stop: Stop;
  n: number;
  /** The block's first tile: no hairline above it. */
  first: boolean;
  fromOffMap: boolean;
  /** What a drag picks up; null for a stop that can't move (a canceled job). */
  item: DragItem | null;
  route: string;
  /** The route's tech color: a 4 pt stripe on the card's leading edge. */
  tech: string | null;
  onMove: (s: Stop) => void;
  gestures?: RowGestures;
}) {
  const { slotRef } = useDropZones();
  const { gesture, ref } = useDragSource(
    item,
    () => (
      <View style={styles.clip}>
        <StopTileFace stop={s} n={n} tech={tech} />
      </View>
    ),
    undefined,
    "grip",
  );
  const slot = slotRef(s.id, route);
  const open = () => router.push(`/jobs/${s.id}`);
  return (
    <View
      ref={(node) => {
        ref(node);
        slot(node);
      }}
      collapsable={false}
      style={{ backgroundColor: color.surface }}
    >
      {first ? null : <TileHairline />}
      {/* A tap on the body does nothing; TalkBack's double tap opens the job. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={tileLabel(s, n, fromOffMap)}
        accessibilityHint="Opens the job"
        accessibilityActions={[
          { name: "activate", label: "Open Job" },
          ...(gestures
            ? gestures.accessibilityActions
            : s.movable
              ? [{ name: "move", label: "Move" }]
              : []),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "activate") return open();
          if (gestures) gestures.onAccessibilityAction(e);
          else onMove(s);
        }}
        onLongPress={gestures?.onLongPress}
      >
        <StopTileFace
          stop={s}
          n={n}
          fromOffMap={fromOffMap}
          onOpen={open}
          onHold={gestures?.onLongPress}
          gripGesture={item ? gesture : undefined}
        />
      </Pressable>
    </View>
  );
}

/** A stop's tile, sliding aside while another stop is carried past. */
function Slide({
  id,
  route,
  position,
  children,
}: {
  id: string;
  route: string;
  position: number;
  children: ReactNode;
}) {
  const style = useSlide(id, route, position);
  // Carried: its place is an empty gap.
  const carried = useDragHover().id === id;
  return (
    <Reanimated.View style={[styles.stopWrap, style, carried && { opacity: 0 }]}>
      {children}
    </Reanimated.View>
  );
}

/** A Needs a Time card as it's carried. */
export function GhostCard({ stop: s }: { stop: Stop }) {
  return (
    <View style={styles.clip}>
      <ScheduleCardFace stop={s} n={null} tech={null} tray />
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
  block: { borderRadius: shape.card },
  blockClip: { borderRadius: shape.card, overflow: "hidden" },
  hairline: {
    position: "absolute",
    top: 0,
    left: TILE_INSET,
    right: 0,
    height: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  techTitle: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  stopWrap: {},
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
  clip: { borderRadius: shape.card, overflow: "hidden" },
});
