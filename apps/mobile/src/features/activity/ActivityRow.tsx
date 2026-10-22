import { router } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { ActivityRow, ActivitySymbol } from "@leakbook/core";
import { activityPath } from "../../lib/activity";
import { T } from "../../ui/components";
import { color, shape, space } from "../../ui/theme";

// Activity rows (docs/plans/search-and-activity.md section 2), as the website's
// (apps/web/src/components/activity-rows.tsx): a round symbol for the kind, the title, the
// detail, and the time in secondary text; tapping opens what it's about.

/** The website's symbol paths, on its 24 x 24 artboard. */
const PATHS: Record<ActivitySymbol, string> = {
  // A document with a check.
  quote: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 14l2 2 3.5-4",
  // A dollar sign.
  payment:
    "M12 4v16M16 8.5c0-1.7-1.8-2.8-4-2.8s-4 1.1-4 2.8 1.8 2.5 4 3 4 1.3 4 3-1.8 2.8-4 2.8-4-1.1-4-2.8",
  // A pen on a line.
  signature: "M4 20h16M6 16l9.5-9.5a2.1 2.1 0 0 1 3 3L9 19H6z",
  // A paper plane.
  report: "M21 3 10 14M21 3l-7 18-4-7-7-4z",
  // A check.
  done: "M5 12.5l4.5 4.5L19 7.5",
  // A person.
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  // A calendar with an arrow.
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14v15H5zM10 14h6M13.5 11.5 16 14l-2.5 2.5",
  // An eye (a customer opened a report).
  opened: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  // A speech bubble.
  text: "M4 5h16v11H9l-5 4z",
};

export function ActivityIcon({ symbol }: { symbol: ActivitySymbol }) {
  return (
    <View style={[styles.icon, { backgroundColor: color.iconTint }]}>
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.link}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path d={PATHS[symbol]} />
      </Svg>
    </View>
  );
}

/** One event: its row content, tappable when it opens something. */
export function ActivityItem({
  row,
  onOpen,
}: {
  row: ActivityRow;
  /** Before it opens what it's about (the Dashboard's Activity sheet closes). */
  onOpen?: () => void;
}) {
  const path = activityPath(row.open);
  const body = (
    <>
      <ActivityIcon symbol={row.symbol} />
      <View style={styles.body}>
        <T variant="bodyEmphasis">{row.title}</T>
        {row.detail ? (
          <T variant="secondary" muted>
            {row.detail}
          </T>
        ) : null}
      </View>
      <T variant="secondary" muted style={styles.time}>
        {row.time}
      </T>
    </>
  );
  const label = [row.title, row.detail, row.time].filter(Boolean).join(", ");
  if (!path)
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        onOpen?.();
        router.push(path as never);
      }}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS !== "android" && { backgroundColor: color.rowPressed },
      ]}
    >
      {body}
    </Pressable>
  );
}

/** An event as a row of an inset grouped list drawn by a FlatList (More › Activity). */
export function ActivityListRow({
  row,
  first,
  last,
}: {
  row: ActivityRow;
  first: boolean;
  last: boolean;
}) {
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: color.surface },
        first && styles.first,
        last && styles.last,
      ]}
    >
      {first ? null : <View style={[styles.separator, { backgroundColor: color.separator }]} />}
      <ActivityItem row={row} />
    </View>
  );
}

/** Where the hairline between activity rows starts: after the symbol, where the text does. */
export const ACTIVITY_SEPARATOR_INSET = space["4"] + 36 + space["3"];

const styles = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingVertical: 10,
    paddingHorizontal: space["4"],
  },
  body: { flex: 1, gap: 2 },
  time: { alignSelf: "flex-start", paddingTop: 2 },
  box: { overflow: "hidden" },
  first: { borderTopLeftRadius: shape.grouped, borderTopRightRadius: shape.grouped },
  last: { borderBottomLeftRadius: shape.grouped, borderBottomRightRadius: shape.grouped },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: ACTIVITY_SEPARATOR_INSET },
});
