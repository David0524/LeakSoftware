import type { ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import type { RowGestures } from "../../ui/RowMenu";
import { SwipeActions } from "../../ui/SwipeRow";
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
  phone,
  gestures,
  children,
}: {
  first: boolean;
  last: boolean;
  onPress: () => void;
  label?: string;
  /** The value at the right, before the chevron. */
  value?: ReactNode;
  /** Swipe left to call this number (gestures spec section 5), also offered to TalkBack. */
  phone?: string | null;
  /**
   * Swipe actions both ways, touch and hold for the row's menu, and the same choices for
   * TalkBack (ui/RowMenu rowGestures; gestures spec section 12), in place of `phone`.
   */
  gestures?: RowGestures;
  children: ReactNode;
}) {
  const callNow = phone ? () => void Linking.openURL(`tel:${phone}`) : null;
  const g: RowGestures | null =
    gestures ??
    (callNow
      ? {
          leading: null,
          trailing: [{ label: "Call", tint: color.link, onPress: callNow }],
          accessibilityActions: [{ name: "call", label: "Call" }],
          onAccessibilityAction: (e) => e.nativeEvent.actionName === "call" && callNow(),
        }
      : null);
  const row = (
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
        accessibilityActions={g?.accessibilityActions.length ? g.accessibilityActions : undefined}
        onAccessibilityAction={g?.onAccessibilityAction}
        onPress={onPress}
        onLongPress={g?.onLongPress}
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
  return g && (g.leading || g.trailing.length) ? (
    <SwipeActions leading={g.leading} trailing={g.trailing}>
      {row}
    </SwipeActions>
  ) : (
    row
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
