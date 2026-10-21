import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle } from "react-native-svg";
import { Card, T } from "../../ui/components";
import type { RowGestures } from "../../ui/RowMenu";
import { useMenu } from "../../ui/Select";
import { color, gutter, space } from "../../ui/theme";
import { GhostCard, type Stop } from "./RouteCard";
import { cardLabel, ScheduleCardFace } from "./ScheduleCard";
import { dropTint, useDragHover, useDragSource, useDropZones } from "./ScheduleDrag";

/** Needs a Time's drop zone id. */
export const TRAY = "tray";

/**
 * Needs a Time (spec 5.6, managers): jobs without a time or a tech, in one row that scrolls
 * sideways. Each card's "…" offers Suggest Times and Move…; touch and hold one to drag it onto
 * a tech's day, and drop an unstarted stop here to take it off the schedule. Held and let go
 * without moving, a card shows its menu (gestures spec section 12), the same one as "…". The
 * cards aren't swiped: the row scrolls sideways.
 */
export function NeedsATime({
  jobs,
  onSuggest,
  onMove,
  gesturesFor,
}: {
  jobs: Stop[];
  onSuggest: (s: Stop) => void;
  onMove: (s: Stop) => void;
  /** A card's touch-and-hold menu and accessibility actions. */
  gesturesFor?: (s: Stop) => RowGestures;
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
            {jobs.map((j) => {
              const g = gesturesFor?.(j);
              return (
                <TrayCard
                  key={j.id}
                  stop={j}
                  width={cardWidth}
                  gestures={g}
                  onActions={
                    g?.onLongPress ??
                    (() =>
                      menu.open({
                        title: j.customer,
                        items: [
                          { label: "Suggest Times", onPress: () => onSuggest(j) },
                          { label: "Move…", onPress: () => onMove(j) },
                        ],
                      }))
                  }
                />
              );
            })}
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
  gestures,
}: {
  stop: Stop;
  width: number;
  onActions: () => void;
  gestures?: RowGestures;
}) {
  const hover = useDragHover();
  const { gesture, ref } = useDragSource(
    j.movable ? { id: j.id, status: j.status, from: { kind: "tray" } } : null,
    () => <GhostCard stop={j} />,
    onActions,
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={ref}
        collapsable={false}
        style={[
          styles.card,
          { width },
          // Carried: its place is an empty gap.
          hover.id === j.id && { opacity: 0 },
        ]}
      >
        {/* The schedule card (ScheduleCard.tsx), with the note on its second line; "…" keeps
            Suggest Times and Move…. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={cardLabel(j, null, true)}
          accessibilityActions={gestures?.accessibilityActions}
          onAccessibilityAction={gestures?.onAccessibilityAction}
          onPress={() => router.push(`/jobs/${j.id}`)}
          onLongPress={j.movable ? undefined : onActions}
          style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
        >
          <ScheduleCardFace
            stop={j}
            n={null}
            tech={null}
            tray
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Actions for ${j.customer}`}
                onPress={onActions}
                style={({ pressed }) => [
                  styles.more,
                  pressed && { backgroundColor: color.iconTint },
                ]}
              >
                <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.link}>
                  <Circle cx={6} cy={12} r={1.8} />
                  <Circle cx={12} cy={12} r={1.8} />
                  <Circle cx={18} cy={12} r={1.8} />
                </Svg>
              </Pressable>
            }
          />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: "hidden" },
  more: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
