import type { BottomTabBarProps } from "expo-router/tabs";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSyncStatus } from "../data/hooks";
import { useConversations } from "../data/texting";
import { useCompany } from "../state/session";
import { Glass } from "./Glass";
import { haptics } from "./haptics";
import { color, face, shape, type } from "./theme";
import { WebIcon, type WebIconName } from "./WebIcon";

/** The five tabs, in order (spec 4.1). Route names are the tab groups in (tabs)/_layout. */
export const TABS: { name: string; label: string; icon: WebIconName }[] = [
  { name: "(today)", label: "Today", icon: "today" },
  { name: "(jobs)", label: "Jobs", icon: "jobs" },
  { name: "(schedule)", label: "Schedule", icon: "schedule" },
  { name: "(messages)", label: "Messages", icon: "messages" },
  { name: "(more)", label: "More", icon: "more" },
];

/**
 * The website's floating tab bar (spec 3.2, 8.2), drawn the same on iPhone and Android: a
 * glass capsule 12 in from the sides, five items of an icon over a label, the selected one
 * filled in the link color. Messages carries the unread count; More a red dot when changes
 * couldn't be saved. Tapping the current tab pops its stack to the root, then scrolls to the
 * top (the stack and the screen's scroll view listen for the press).
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const company = useCompany();
  const unread = useConversations(company.id).filter((c) => c.unread).length;
  const problems = useSyncStatus().problems.length;
  return (
    // The full-width layer catches taps beside the bar so they never reach the page under it.
    <View
      style={[styles.layer, { paddingBottom: Math.max(12, insets.bottom) }]}
      onStartShouldSetResponder={() => true}
    >
      <Glass style={styles.bar}>
        <View style={styles.items} accessibilityRole="tablist">
          {state.routes.map((route, index) => {
            const tab = TABS.find((t) => t.name === route.name);
            if (!tab) return null;
            const focused = state.index === index;
            const badge = tab.name === "(messages)" && unread > 0 ? unread : null;
            const dot = tab.name === "(more)" && problems > 0;
            const tint = focused ? color.link : color.textMuted;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={[
                  tab.label,
                  badge ? `${badge} unread` : null,
                  dot ? "changes not saved" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                android_ripple={{ color: color.ripple, borderless: true, radius: 36 }}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused) haptics.selection();
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                  }
                }}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                style={styles.item}
              >
                <View>
                  <WebIcon name={tab.icon} size={28} color={tint} filled={focused} />
                  {badge ? (
                    <View style={[styles.badge, { backgroundColor: color.primary }]}>
                      <Text
                        style={[styles.badgeText, { color: color.onPrimary }]}
                        maxFontSizeMultiplier={1.4}
                      >
                        {badge > 99 ? "99+" : badge}
                      </Text>
                    </View>
                  ) : null}
                  {dot ? <View style={[styles.dot, { backgroundColor: color.fail }]} /> : null}
                </View>
                <Text style={[type.tabLabel, { color: tint }]} maxFontSizeMultiplier={1.4}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  bar: { borderRadius: shape.tabBar, paddingHorizontal: 4 },
  items: { flexDirection: "row" },
  item: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 24,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  badge: {
    position: "absolute",
    top: -4,
    left: 16,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...face.semiBold, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  dot: { position: "absolute", top: 0, right: -2, width: 10, height: 10, borderRadius: 5 },
});
