import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Card, T } from "../../ui/components";
import { useMenu } from "../../ui/Select";
import { color, face, gutter, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import type { Stop } from "./RouteCard";

/**
 * Needs a Time (spec 5.6, managers): jobs without a time or a tech, in one row that scrolls
 * sideways. Each card's "…" offers Suggest Times and Move….
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
  const cardWidth = Math.min(320, (width - gutter * 2) * 0.85);
  return (
    <Card padding={space["4"]}>
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
            <View
              key={j.id}
              style={[styles.card, { width: cardWidth, backgroundColor: color.well }]}
            >
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${j.customer}${j.number ? `, #${j.number}` : ""}`}
                onPress={() => router.push(`/jobs/${j.id}`)}
                style={({ pressed }) => [
                  { flex: 1, paddingVertical: 4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[type.body, { color: color.text }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  <Text style={face.semiBold}>{j.customer}</Text>
                  <Text style={{ color: color.textMuted }}>
                    {j.number ? ` · #${j.number}` : ""}
                  </Text>
                </Text>
                <T variant="secondary" muted numberOfLines={1}>
                  {[j.address, j.note].filter(Boolean).join(" · ")}
                </T>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Actions for ${j.customer}`}
                onPress={() =>
                  menu.open({
                    title: j.customer,
                    items: [
                      { label: "Suggest Times", onPress: () => onSuggest(j) },
                      { label: "Move…", onPress: () => onMove(j) },
                    ],
                  })
                }
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
            </View>
          ))}
        </ScrollView>
      )}
      {menu.element}
    </Card>
  );
}

const styles = StyleSheet.create({
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
