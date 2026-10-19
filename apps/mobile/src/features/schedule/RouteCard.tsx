import { router } from "expo-router";
import { useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { durationLabel, type JobStatus, type LatLng } from "@leakbook/core";
import { Button, Card, StatusChip, T } from "../../ui/components";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../ui/theme";

// Schedule › Day: one card per person's route (spec 5.6; the website's route-board.tsx
// DayColumn and StopCard): the summary, Plan Route and the maps button, then the stops with
// the driving between them. Move… (or a swipe left on a stop) opens the Move sheet.

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
  note: string | null;
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

export function Leg({ text, late, inset = 12 }: { text: string; late?: number; inset?: number }) {
  return (
    <View style={[styles.leg, { paddingLeft: inset }]}>
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
      <View style={{ marginTop: space["3"], gap: 4 }}>
        {c.stops.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: color.well }]}>
            <T muted style={{ textAlign: "center" }}>
              Nothing scheduled.
            </T>
          </View>
        ) : null}
        {c.stops.map((s) => (
          <View key={s.id} style={{ gap: 4 }}>
            {s.legMin != null ? (
              <Leg text={`${durationLabel(s.legMin)} drive`} late={s.shortMin} />
            ) : null}
            <StopWell stop={s} onMove={onMove} onDirections={onDirections} />
          </View>
        ))}
        {c.stops.length && c.backLegMin != null ? (
          <Leg text={`${durationLabel(c.backLegMin)} back to the shop`} />
        ) : null}
      </View>
    </Card>
  );
}

function StopWell({
  stop: s,
  onMove,
  onDirections,
}: {
  stop: Stop;
  onMove: (s: Stop) => void;
  onDirections: (s: Stop) => void;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const well = (
    <View
      style={[styles.well, { backgroundColor: color.surface }]}
      accessible={false}
      accessibilityActions={s.movable ? [{ name: "move", label: "Move" }] : undefined}
      onAccessibilityAction={() => onMove(s)}
    >
      <View style={[StyleSheet.absoluteFill, styles.wellFill, { backgroundColor: color.well }]} />
      <View style={styles.top}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${s.time ?? "No time"}, ${s.customer}`}
          onPress={() => router.push(`/jobs/${s.id}`)}
          style={({ pressed }) => [styles.open, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.body, { color: color.text }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
            <Text style={face.semiBold}>{s.time ?? "Saving…"}</Text>
            <Text style={{ color: color.textMuted }}>{s.number ? ` · #${s.number}` : ""}</Text>
          </Text>
          <T numberOfLines={1}>{s.customer}</T>
        </Pressable>
        {s.movable ? (
          <Button
            kind="quiet"
            title="Move…"
            onPress={() => onMove(s)}
            style={{ paddingHorizontal: 8, marginTop: -6, marginRight: -4 }}
          />
        ) : null}
      </View>
      {s.address ? (
        <Text
          accessibilityRole="link"
          accessibilityHint="Directions"
          onPress={() => onDirections(s)}
          numberOfLines={1}
          style={[type.secondary, { color: color.link, alignSelf: "flex-start" }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {s.address}
        </Text>
      ) : null}
      {s.note ? (
        <T variant="secondary" muted>
          {s.note}
        </T>
      ) : null}
      {s.status !== "scheduled" || s.lock || !s.location ? (
        <View style={styles.chips}>
          {s.status !== "scheduled" ? <StatusChip status={s.status} /> : null}
          {s.lock ? (
            <View style={[styles.lock, { backgroundColor: color.fill }]}>
              <Text
                style={[type.footnote, face.semiBold, { color: color.text }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {s.lock}
              </Text>
            </View>
          ) : null}
          {!s.location ? (
            <Text
              style={[type.footnote, { color: color.warning }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              No map location
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!s.movable) return well;
  return (
    <View style={styles.swipeClip}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.5}
        rightThreshold={44}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={() => {
              ref.current?.close();
              onMove(s);
            }}
            style={[styles.swipeAction, { backgroundColor: color.link }]}
          >
            <Text style={[type.bodyEmphasis, { color: color.onPrimary }]}>Move</Text>
          </Pressable>
        )}
      >
        {well}
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  leg: { flexDirection: "row", alignItems: "center", gap: space["2"], paddingVertical: 4 },
  dots: { height: 16, borderLeftWidth: 2, borderStyle: "dotted" },
  buttons: { flexDirection: "row", gap: space["2"], marginTop: space["3"] },
  half: { flex: 1 },
  empty: { borderRadius: 16, padding: space["4"] },
  swipeClip: { borderRadius: 16, overflow: "hidden" },
  well: { borderRadius: 16, padding: space["2"], paddingLeft: space["3"] },
  wellFill: { borderRadius: 16 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space["2"] },
  open: { flex: 1, minHeight: 44 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space["2"],
    marginTop: 4,
  },
  lock: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  swipeAction: { width: 88, alignItems: "center", justifyContent: "center" },
});
