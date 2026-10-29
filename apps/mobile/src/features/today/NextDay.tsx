import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { NextDayCard } from "@leakbook/core";
import { requestScheduleDay } from "../../data/schedule";
import { Button, Card, Empty, T } from "../../ui/components";
import { color, space, type } from "../../ui/theme";

/**
 * An empty Today (owner, 2026-10-29: "An empty Today shows what's next"): the next day with
 * stops, up to two weeks out, with a way to see it on the Schedule; else the old line and its
 * link to the Schedule. The website's NextDay.
 */
export function NextDay({ empty, card }: { empty: string; card: NextDayCard | null }) {
  if (!card)
    return (
      <Empty>
        <Text style={[type.body, styles.center, { color: color.textMuted }]}>
          {empty}{" "}
          <Text
            accessibilityRole="link"
            onPress={() => router.navigate("/schedule")}
            style={{ color: color.link, textDecorationLine: "underline" }}
          >
            Open the schedule
          </Text>
          .
        </Text>
      </Empty>
    );
  return (
    <View style={styles.wrap}>
      <T muted>{empty}</T>
      <Card>
        <View style={styles.lines}>
          <T variant="heading">{card.heading}</T>
          <T>{card.line}</T>
          <T muted>{card.names}</T>
        </View>
        <View style={styles.action}>
          <Button
            title={card.button}
            kind="secondary"
            onPress={() => {
              requestScheduleDay(card.date);
              router.navigate("/schedule");
            }}
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space["3"] },
  lines: { gap: space["1"] },
  action: { flexDirection: "row", justifyContent: "flex-end", paddingTop: space["3"] },
  center: { textAlign: "center" },
});
