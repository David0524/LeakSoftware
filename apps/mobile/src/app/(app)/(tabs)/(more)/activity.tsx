import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, RefreshControl, StyleSheet, View } from "react-native";
import {
  ACTIVITY_EMPTY,
  ACTIVITY_OFFLINE,
  ACTIVITY_TITLE,
  groupActivity,
  type ActivityEvent,
  type ActivityRow,
} from "@leakbook/core";
import { seeActivity } from "../../../../data/activity";
import { useSyncStatus } from "../../../../data/hooks";
import { ActivityListRow } from "../../../../features/activity/ActivityRow";
import { appendActivity, fetchActivity } from "../../../../lib/activity";
import { getServices } from "../../../../lib/services";
import { useCompany } from "../../../../state/session";
import { Button, Empty, T, useScreenChrome } from "../../../../ui/components";
import { color, space } from "../../../../ui/theme";

/**
 * More › Activity (owner, 2026-10-20; docs/plans/search-and-activity.md section 2), as the
 * website's: what happened in the shop, newest first, under day headers; 50 at a time, the
 * next 50 loading as the end scrolls into view. Read from the server like the Dashboard, so
 * each person sees the events about what they can open (row security decides). Opening it
 * clears the dot on More and on the Activity row.
 */
export default function ActivityScreen() {
  const company = useCompany();
  const offlineNow = useSyncStatus().phase === "offline";
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: ACTIVITY_TITLE,
    subtitle: company.name,
  });

  const loadFirst = useCallback(async () => {
    try {
      const page = await fetchActivity(getServices().supabase, company.id);
      setEvents(page.events);
      setMore(page.more);
      setFailed(false);
      void seeActivity(company.id);
    } catch {
      setFailed(true);
    }
  }, [company.id]);

  useEffect(() => {
    const timer = setTimeout(() => void loadFirst(), 0);
    return () => clearTimeout(timer);
  }, [loadFirst]);

  async function loadMore() {
    const last = events?.at(-1);
    if (!last || !more || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchActivity(getServices().supabase, company.id, last);
      setEvents((e) => appendActivity(e ?? [], page.events));
      setMore(page.more);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  }

  // Day headers and rows, flattened for the list.
  const items = useMemo(() => {
    const out: (
      | { key: string; kind: "day"; title: string; first: boolean }
      | { key: string; kind: "row"; row: ActivityRow; first: boolean; last: boolean }
    )[] = [];
    groupActivity(events ?? [], new Date(), company.timezone).forEach((d, di) => {
      out.push({ key: `day:${d.key}`, kind: "day", title: d.title, first: di === 0 });
      d.rows.forEach((row, i) =>
        out.push({
          key: row.id,
          kind: "row",
          row,
          first: i === 0,
          last: i === d.rows.length - 1,
        }),
      );
    });
    return out;
  }, [events, company.timezone]);

  const empty =
    events === null ? (
      failed || offlineNow ? (
        <View style={styles.gap}>
          <Empty>{ACTIVITY_OFFLINE}</Empty>
          <Button title="Try Again" kind="secondary" onPress={() => void loadFirst()} />
        </View>
      ) : (
        <ActivityIndicator color={color.textMuted} style={styles.spinner} />
      )
    ) : (
      <Empty>{ACTIVITY_EMPTY}</Empty>
    );

  const footer =
    events && events.length > 0 ? (
      <View style={styles.footer}>
        {failed ? (
          <View accessibilityRole="alert">
            <T muted style={styles.center}>
              {ACTIVITY_OFFLINE}
            </T>
          </View>
        ) : null}
        {more ? (
          <Button
            title={loadingMore ? "Loading…" : "Show More"}
            kind="secondary"
            disabled={loadingMore}
            onPress={() => void loadMore()}
          />
        ) : null}
      </View>
    ) : null;

  return (
    <Animated.FlatList
      ref={ref as never}
      {...scrollProps}
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={contentContainerStyle}
      data={items}
      keyExtractor={(i) => i.key}
      ListHeaderComponent={<View style={styles.top}>{header}</View>}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={() => {
        if (!failed) void loadMore();
      }}
      onEndReachedThreshold={0.5}
      initialNumToRender={20}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      renderItem={({ item }) =>
        item.kind === "day" ? (
          <View accessibilityRole="header" style={[styles.day, !item.first && styles.dayGap]}>
            <T variant="sectionLabel">{item.title}</T>
          </View>
        ) : (
          <ActivityListRow row={item.row} first={item.first} last={item.last} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  top: { marginBottom: space["5"] },
  day: { marginBottom: space["2"] },
  dayGap: { marginTop: space["6"] },
  gap: { gap: space["3"] },
  spinner: { marginTop: space["6"] },
  footer: { gap: space["2"], alignItems: "center", marginTop: space["5"] },
  center: { textAlign: "center" },
});
