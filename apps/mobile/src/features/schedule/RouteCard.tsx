import { router } from "expo-router";
import { useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { durationLabel, type CleaningKind, type JobStatus, type LatLng } from "@leakbook/core";
import type { DragItem } from "../../lib/scheduleDrag";
import { CleaningNames } from "../maintenance/Cleanings";
import { Button, Card, StatusChip, T } from "../../ui/components";
import { NotOnMapTag } from "../../ui/NotOnMap";
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

// Schedule › Day: one card per person's route (spec 5.6; the website's route-board.tsx
// DayColumn and StopCard): the summary, Plan Route and the maps button, then the stops with
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
  /** "Fixed time", "Two techs" (not "Started"). */
  lock: string | null;
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
  date: string;
  stops: Stop[];
  driveMin: number;
  backLegMin: number | null;
  back: string | null;
  overtimeMin: number;
  /** Today or later: can be planned. */
  open: boolean;
}

/** The drive into a stop: Today's dotted line and the minutes ("14 min drive"). */
export function Leg({ text, late }: { text: string; late?: number }) {
  return (
    <View style={styles.leg}>
      <View style={[styles.dots, { borderColor: color.textMuted }]} />
      <Text
        style={[type.secondary, { color: color.textMuted, flexShrink: 1 }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {text}
        {late ? (
          <Text style={[face.semiBold, { color: color.warning }]}>
            {" "}
            · {durationLabel(late)} late
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

export function RouteCard({
  route: c,
  busy,
  mapsButton,
  onPlan,
  onMove,
  onDirections,
}: {
  route: Route;
  busy: boolean;
  /** The secondary maps button ("Apple Maps" / "Google Maps"), when the day has directions. */
  mapsButton: ReactNode;
  onPlan: () => void;
  onMove: (s: Stop) => void;
  onDirections: (s: Stop) => void;
}) {
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  const summary = c.stops.length
    ? [
        `${c.stops.length} ${c.stops.length === 1 ? "stop" : "stops"}`,
        `${durationLabel(c.driveMin)} driving`,
        c.back ? `back by ${c.back}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    // The whole route takes a drop: between two stops, or last.
    <View
      ref={zoneRef({ kind: "route", id: c.key, tech: c.techId, date: c.date, open: c.open })}
      collapsable={false}
      style={[styles.route, { backgroundColor: dropTint(hover, c.key) }]}
    >
      <Card padding={space["4"]}>
        <T variant="cardTitle">{c.title}</T>
        {summary ? (
          <T variant="secondary" muted>
            {summary}
          </T>
        ) : null}
        {c.overtimeMin > 0 ? (
          <T variant="secondary" style={[face.semiBold, { color: color.warning, marginTop: 4 }]}>
            Runs {durationLabel(c.overtimeMin)} past the end of the day.
          </T>
        ) : null}
        {c.stops.length && (c.open || mapsButton) ? (
          <View style={styles.buttons}>
            {c.open ? (
              <View style={styles.half}>
                <Button
                  kind="secondary"
                  title="Plan Route"
                  onPress={onPlan}
                  disabled={busy}
                  wide
                  style={{ paddingHorizontal: 8 }}
                />
              </View>
            ) : null}
            {mapsButton ? <View style={styles.half}>{mapsButton}</View> : null}
          </View>
        ) : null}
      </Card>
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
              <Leg
                text={`${durationLabel(s.legMin)} ${i === 0 ? "from the shop" : "drive"}`}
                late={s.shortMin}
              />
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
              onMove={onMove}
              onDirections={onDirections}
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
}: {
  stop: Stop;
  n: number;
  ghost?: boolean;
  onMove?: (s: Stop) => void;
  onDirections?: (s: Stop) => void;
}) {
  const kind = s.tag;
  return (
    <View
      style={[styles.face, { backgroundColor: color.surface }]}
      accessible={false}
      accessibilityActions={s.movable && onMove ? [{ name: "move", label: "Move" }] : undefined}
      onAccessibilityAction={() => onMove?.(s)}
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
          onPress={() => router.push(`/jobs/${s.id}`)}
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
            onPress={() => onMove(s)}
            style={{ paddingHorizontal: 8, marginRight: -4 }}
          />
        ) : null}
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
          {s.lock ? (
            <View style={[styles.pill, { backgroundColor: color.fill }]}>
              <Text
                style={[type.footnote, face.semiBold, { color: color.textMuted }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {s.lock}
              </Text>
            </View>
          ) : null}
          {s.notOnMap ? (
            <NotOnMapTag />
          ) : !s.location ? (
            <Text
              style={[type.footnote, face.semiBold, { color: color.warning }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              No map location
            </Text>
          ) : null}
        </View>
        {s.address ? (
          <Text
            accessibilityRole="link"
            accessibilityLabel={`${s.address}, directions`}
            onPress={ghost ? undefined : () => onDirections?.(s)}
            numberOfLines={2}
            style={[type.secondary, { color: color.link, alignSelf: "flex-start" }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {s.address}
          </Text>
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
  onMove,
  onDirections,
}: {
  stop: Stop;
  n: number;
  /** What a drag picks up; null for a stop that can't move (a canceled job). */
  item: DragItem | null;
  route: string;
  onMove: (s: Stop) => void;
  onDirections: (s: Stop) => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const hover = useDragHover();
  const { slotRef } = useDropZones();
  const { gesture, ref } = useDragSource(item, () => (
    <View style={styles.clip}>
      <StopFace stop={s} n={n} ghost />
    </View>
  ));
  const slot = slotRef(s.id, route);
  const content = <StopFace stop={s} n={n} onMove={onMove} onDirections={onDirections} />;
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
        {s.movable ? (
          <View style={styles.clip}>
            <ReanimatedSwipeable
              ref={swipe}
              friction={1.5}
              rightThreshold={44}
              overshootRight={false}
              renderRightActions={() => (
                <Pressable
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  onPress={() => {
                    swipe.current?.close();
                    onMove(s);
                  }}
                  style={[styles.swipeAction, { backgroundColor: color.link }]}
                >
                  <Text style={[type.bodyEmphasis, { color: color.onPrimary }]}>Move</Text>
                </Pressable>
              )}
            >
              {content}
            </ReanimatedSwipeable>
          </View>
        ) : (
          <View style={styles.clip}>{content}</View>
        )}
      </View>
    </GestureDetector>
  );
}

/** Needs a Time's card under the finger while it's dragged. */
export function GhostCard({ stop: s }: { stop: Stop }) {
  return (
    <View style={[styles.face, styles.clip, { backgroundColor: color.surface }]}>
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
  swipeAction: { width: 88, alignItems: "center", justifyContent: "center" },
});
