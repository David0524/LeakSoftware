import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle } from "react-native-svg";
import { Card, T } from "../../ui/components";
import { NotOnMapTag } from "../../ui/NotOnMap";
import { useMenu } from "../../ui/Select";
import { color, face, gutter, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { Grip } from "../../ui/Grip";
import { LockTag } from "../../ui/LockTag";
import { GhostCard, type Stop } from "./RouteCard";
import { dropTint, useDragHover, useDragSource, useDropZones } from "./ScheduleDrag";

/** Needs a Time's drop zone id. */
export const TRAY = "tray";

/**
 * Needs a Time (spec 5.6, managers): jobs without a time or a tech, in one row that scrolls
 * sideways. Each card's "…" offers Suggest Times and Move…; touch and hold one to drag it onto
 * a tech's day, and drop an unstarted stop here to take it off the schedule.
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
  const { width } = useWindowDimensions();
  const menu = useMenu();
  const { zoneRef } = useDropZones();
  const hover = useDragHover();
  const cardWidth = Math.min(320, (width - gutter * 2) * 0.85);
  const tinted = dropTint(hover, TRAY);
  return (
    <View ref={zoneRef({ kind: "tray", id: TRAY })} collapsable={false}>
      <Card padding={space["4"]} style={tinted ? { backgroundColor: tinted } : undefined}>
        <T variant="cardTitle" style={{ marginBottom: jobs.length ? space["3"] : 0 }}>
          Needs a Time{jobs.length ? ` (${jobs.length})` : ""}
        </T>
        {jobs.length === 0 ? (
          <T variant="secondary" muted>
            Every job has a time.
          </T>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + space["3"]}
            decelerationRate="fast"
            style={{ marginHorizontal: -space["4"] }}
            contentContainerStyle={{ paddingHorizontal: space["4"], gap: space["3"] }}
          >
            {jobs.map((j) => (
              <TrayCard
                key={j.id}
                stop={j}
                width={cardWidth}
                onActions={() =>
                  menu.open({
                    title: j.customer,
                    items: [
                      { label: "Suggest Times", onPress: () => onSuggest(j) },
                      { label: "Move…", onPress: () => onMove(j) },
                    ],
                  })
                }
              />
            ))}
          </ScrollView>
        )}
        {menu.element}
      </Card>
    </View>
  );
}

function TrayCard({
  stop: j,
  width,
  onActions,
}: {
  stop: Stop;
  width: number;
  onActions: () => void;
}) {
  const hover = useDragHover();
  const { gesture, ref } = useDragSource(
    j.movable ? { id: j.id, status: j.status, from: { kind: "tray" } } : null,
    () => <GhostCard stop={j} />,
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={ref}
        collapsable={false}
        style={[
          styles.card,
          { width, backgroundColor: color.well },
          hover.id === j.id && { opacity: 0.35 },
        ]}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${j.customer}${j.number ? `, #${j.number}` : ""}`}
          onPress={() => router.push(`/jobs/${j.id}`)}
          style={({ pressed }) => [{ flex: 1, paddingVertical: 4 }, pressed && { opacity: 0.6 }]}
        >
          <Text
            numberOfLines={1}
            style={[type.body, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            <Text style={face.semiBold}>{j.customer}</Text>
            <Text style={{ color: color.textMuted }}>{j.number ? ` · #${j.number}` : ""}</Text>
          </Text>
          {/* The address, the not-on-map symbol right after it, then the note. */}
          <View style={styles.addressLine}>
            {j.address ? (
              <T variant="secondary" muted numberOfLines={1} style={{ flexShrink: 1 }}>
                {j.address}
              </T>
            ) : null}
            {j.notOnMap ? <NotOnMapTag lineHeight={type.secondary.lineHeight!} /> : null}
            {j.note ? (
              <T variant="secondary" muted numberOfLines={1} style={{ flexShrink: 1 }}>
                {j.address ? `· ${j.note}` : j.note}
              </T>
            ) : null}
          </View>
          {j.lock ? <LockTag lock={j.lock} /> : null}
        </Pressable>
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
        {/* The drag grip at the trailing edge (owner, 2026-10-20). */}
        {j.movable ? <Grip width={24} /> : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  addressLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  card: {
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: space["3"],
    paddingRight: 4,
    paddingVertical: 4,
  },
  more: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
