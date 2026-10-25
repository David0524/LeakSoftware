import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { Chevron, Group, T } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { NotOnMapTag } from "../../ui/NotOnMap";
import { useMenu } from "../../ui/Select";
import { color, face, MAX_TEXT_SCALE, minTap, shape, space, tabular, type } from "../../ui/theme";
import type { Stop } from "./RouteCard";
import { streetOf } from "./ScheduleCard";
import { dropTint, useDragHover, useDropZones } from "./ScheduleDrag";

/** Needs a Time's drop zone id. */
export const TRAY = "tray";

/**
 * Needs a Time (spec 5.6, managers): jobs without a time or a tech, as one row (owner,
 * 2026-10-25: "feels very big"; picked option A): its name, the count and "›". A tap opens the
 * jobs in a sheet, each with "…" for Suggest Times and Move…. The row is still where a stop
 * dragged from a day is let go to take it off the schedule (the menu's Take Off Schedule); it
 * rings blue while one is over it. A waiting job can't be dragged onto a route: Move… does it.
 */
export function NeedsATime({
  jobs,
  onSuggest,
  onMove,
}: {
  jobs: Stop[];
  onSuggest: (s: Stop) => void;
  onMove: (s: Stop) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useMenu();
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  const tinted = dropTint(hover, TRAY);
  // Suggest Times and Move… open sheets of their own, so this one closes first.
  const act = (run: (s: Stop) => void, s: Stop) => {
    setOpen(false);
    run(s);
  };
  return (
    <View ref={zoneRef({ kind: "tray", id: TRAY })} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Needs a Time, ${jobs.length}`}
        accessibilityHint="Shows the jobs waiting for a time"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: tinted ?? color.surface },
          { borderColor: tinted ? (hover.refused ? color.warning : color.link) : "transparent" },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.label}>
          <T numberOfLines={1}>Needs a Time</T>
        </View>
        {jobs.length ? (
          <View style={[styles.count, { backgroundColor: color.primary }]}>
            <Text
              style={[type.secondary, face.bold, tabular, { color: color.onPrimary }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {jobs.length}
            </Text>
          </View>
        ) : (
          <T muted style={tabular}>
            0
          </T>
        )}
        <Chevron />
      </Pressable>
      <ModalSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={`Needs a Time${jobs.length ? ` (${jobs.length})` : ""}`}
        cancel="Done"
      >
        {jobs.length === 0 ? (
          <T variant="secondary" muted>
            Every job has a time. Drag a job here to take it off the schedule.
          </T>
        ) : (
          <Group>
            {jobs.map((j) => (
              <WaitingJob
                key={j.id}
                stop={j}
                onOpen={() => {
                  setOpen(false);
                  router.push(`/jobs/${j.id}`);
                }}
                onActions={() =>
                  menu.open({
                    title: j.customer,
                    items: [
                      { label: "Suggest Times", onPress: () => act(onSuggest, j) },
                      { label: "Move…", onPress: () => act(onMove, j) },
                    ],
                  })
                }
              />
            ))}
          </Group>
        )}
        {/* Inside the sheet, so the menu shows over it. */}
        {menu.element}
      </ModalSheet>
    </View>
  );
}

/**
 * A waiting job in the sheet: the customer's name opens it, then the note ("No tech yet ·
 * booked…") and the street; "…" for Suggest Times and Move….
 */
function WaitingJob({
  stop: j,
  onOpen,
  onActions,
}: {
  stop: Stop;
  onOpen: () => void;
  onActions: () => void;
}) {
  const second = [j.note, j.address ? streetOf(j.address) : null].filter(Boolean).join(" · ");
  return (
    <View style={styles.job}>
      <View style={styles.text}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${j.customer}`}
          onPress={onOpen}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
          style={({ pressed }) => [styles.name, pressed && { opacity: 0.5 }]}
        >
          <Text
            numberOfLines={1}
            style={[type.bodyEmphasis, { color: color.link }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {`${j.customer} ›`}
          </Text>
        </Pressable>
        {second ? (
          <View style={styles.line}>
            <View style={styles.lineText}>
              <T variant="secondary" muted numberOfLines={1}>
                {second}
              </T>
            </View>
            {j.notOnMap || (j.address && !j.location) ? <NotOnMapTag size={17} /> : null}
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${j.customer}`}
        onPress={onActions}
        style={({ pressed }) => [styles.more, pressed && { backgroundColor: color.iconTint }]}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.link}>
          <Circle cx={6} cy={12} r={1.8} />
          <Circle cx={12} cy={12} r={1.8} />
          <Circle cx={18} cy={12} r={1.8} />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // A card-shaped row; the border is always there (clear) so the ring doesn't shift it.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: 10,
    borderRadius: shape.card,
    borderWidth: 2,
  },
  label: { flex: 1, minWidth: 0 },
  count: {
    minWidth: 28,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
  },
  job: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    minHeight: 64,
    paddingLeft: space["4"],
    paddingRight: space["1"],
    paddingVertical: 8,
  },
  text: { flex: 1, minWidth: 0 },
  name: { alignSelf: "flex-start", maxWidth: "100%" },
  line: { flexDirection: "row", alignItems: "center", gap: 6 },
  lineText: { flexShrink: 1, minWidth: 0 },
  more: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
