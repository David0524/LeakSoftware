import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Chevron } from "../../ui/components";
import { color, shape, space } from "../../ui/theme";

/**
 * One row of an inset grouped list drawn by a FlatList (long lists that load as they scroll):
 * the rows share one rounded block, with hairlines between them that start where the text
 * does (spec 3.4).
 */
export function FlatGroupedRow({
  first,
  last,
  onPress,
  label,
  value,
  children,
}: {
  first: boolean;
  last: boolean;
  onPress: () => void;
  label?: string;
  /** The value at the right, before the chevron. */
  value?: ReactNode;
  children: ReactNode;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        android_ripple={{ color: color.ripple }}
        style={({ pressed }) => [
          styles.row,
          pressed && Platform.OS !== "android" && { backgroundColor: color.rowPressed },
        ]}
      >
        <View style={styles.body}>{children}</View>
        {value}
        <Chevron />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden" },
  first: { borderTopLeftRadius: shape.grouped, borderTopRightRadius: shape.grouped },
  last: { borderBottomLeftRadius: shape.grouped, borderBottomRightRadius: shape.grouped },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: space["4"] },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingVertical: 10,
    paddingHorizontal: space["4"],
  },
  body: { flex: 1, gap: 2 },
});
