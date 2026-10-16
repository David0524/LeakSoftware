import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { companyServices, launchCards } from "@leakbook/core";
import { useCompany } from "../../state/session";
import { useWalkthrough } from "../../state/walkthrough";
import { Button, HeaderButton, T } from "../../ui/components";
import { Icon } from "../../ui/Icon";
import { color, space, tint } from "../../ui/theme";

/**
 * The first time the app opens (walkthrough, 2026-10-16): three cards for what the shop does,
 * swiped or stepped through with Continue, then straight to the jobs. A sheet on iPhone; Skip
 * or a swipe down closes it. Shown once per phone (Settings › Show Tips Again shows it again).
 */
export default function Welcome() {
  const company = useCompany();
  const walkthrough = useWalkthrough();
  const cards = launchCards(companyServices(company.settings));
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === cards.length - 1;

  // Seen as soon as it opens: closing it any way counts.
  const { launchSeen, finishLaunch } = walkthrough;
  useEffect(() => {
    if (!launchSeen) finishLaunch();
  }, [launchSeen, finishLaunch]);

  const done = () => router.back();
  const next = () => {
    if (last) return done();
    pager.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingBottom: insets.bottom + space["4"] }}>
      <Stack.Screen
        options={{
          title: "Welcome",
          headerRight: () => <HeaderButton title="Skip" onPress={done} />,
        }}
      />
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        accessibilityRole="adjustable"
      >
        {cards.map((c, i) => (
          <View
            key={c.title}
            style={[styles.page, { width }]}
            accessible
            accessibilityLabel={`${c.title}. ${c.message} Card ${i + 1} of ${cards.length}.`}
          >
            <View style={styles.badge}>
              <Icon name={c.icon} size={44} color={color.link} />
            </View>
            <T variant="title" style={styles.center}>
              {c.title}
            </T>
            <T variant="body" style={[styles.center, { color: color.textMuted }]}>
              {c.message}
            </T>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
        {cards.map((c, i) => (
          <View
            key={c.title}
            style={[styles.dot, { backgroundColor: i === page ? color.link : color.neutral200 }]}
          />
        ))}
      </View>
      <View style={{ paddingHorizontal: space["4"] }}>
        <Button title={last ? "Get Started" : "Continue"} onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space["4"],
    paddingHorizontal: space["6"],
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tint(color.link, 0.12),
    marginBottom: space["2"],
  },
  center: { textAlign: "center" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space["2"],
    paddingVertical: space["5"],
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
