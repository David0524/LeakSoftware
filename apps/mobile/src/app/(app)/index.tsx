import { router, Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAddress, formatSchedule, groupJobs } from "@leakbook/core";
import { useJobViews, type JobView } from "../../data/jobs";
import { useCompany, useSession } from "../../state/session";
import { HeaderButton, StatusChip, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Icon } from "../../ui/Icon";
import { SyncBar } from "../../ui/SyncBar";
import { ScreenTip } from "../../ui/Tip";
import { useWalkthrough } from "../../state/walkthrough";
import { color, font, ios, radius, space, tint, touch } from "../../ui/theme";

export default function Jobs() {
  const company = useCompany();
  const { services } = useSession();
  const jobs = useJobViews(company.id);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const now = new Date();

  // The first time the app opens: the three welcome cards (walkthrough, 2026-10-16).
  const { launchSeen } = useWalkthrough();
  const welcomed = useRef(false);
  useEffect(() => {
    if (launchSeen || welcomed.current) return;
    welcomed.current = true;
    router.push("/welcome");
  }, [launchSeen]);

  const sections = useMemo(() => {
    const g = groupJobs(jobs, new Date(), company.timezone);
    return [
      { title: "Today", data: g.today },
      { title: "Upcoming", data: g.upcoming },
      { title: "Not scheduled", data: g.unscheduled },
      { title: "Recent", data: g.recent },
    ].filter((s) => s.data.length > 0);
  }, [jobs, company.timezone]);

  async function refresh() {
    haptics.light();
    setRefreshing(true);
    await services.sync.syncNow();
    setRefreshing(false);
  }

  const openSettings = () => router.push("/settings");
  const newJob = () => router.push("/jobs/new");

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: company.name,
          // The screen's main action sits at the bar's right on iPhone (a +); Android keeps the
          // floating New Job button below, its own convention.
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton title="Settings" icon="settings" onPress={openSettings} />
              {ios ? <HeaderButton title="New Job" icon="add" onPress={newJob} /> : null}
            </View>
          ),
        }}
      />
      {/* On iPhone the list comes first, so the large title shrinks as it scrolls. */}
      {ios ? null : <SyncBar onPress={openSettings} />}
      <SectionList
        sections={sections}
        keyExtractor={(j) => j.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.list,
          // Room for the last row to scroll clear of Android's floating New Job button.
          !ios && { paddingBottom: insets.bottom + FAB_HEIGHT + space["4"] * 2 },
        ]}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={{ gap: space["3"], marginBottom: space["2"] }}>
            {ios ? <SyncBar onPress={openSettings} inset /> : null}
            <ScreenTip screen="jobs" />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <T variant="label" style={styles.sectionTitle}>
            {section.title}
          </T>
        )}
        renderItem={({ item, index, section }) => (
          <JobRow
            job={item}
            now={now}
            timeZone={company.timezone}
            first={index === 0}
            last={index === section.data.length - 1}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <T variant="heading">No jobs yet</T>
            <T variant="muted">
              Create your first job. It works without signal and syncs when you’re back online.
            </T>
          </View>
        }
      />
      {ios ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New Job"
          onPress={newJob}
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + space["4"] },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Icon name="add" size={24} color={color.onPrimary} />
          <Text style={styles.fabText} maxFontSizeMultiplier={1.6}>
            New Job
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** One row of an inset grouped list: the section's rows share one rounded block. */
function JobRow({
  job,
  now,
  timeZone,
  first,
  last,
}: {
  job: JobView;
  now: Date;
  timeZone: string;
  first: boolean;
  last: boolean;
}) {
  return (
    <View style={[styles.rowBox, first && styles.rowFirst, last && styles.rowLast]}>
      {first ? null : <View style={styles.separator} />}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/jobs/${job.id}`)}
        android_ripple={{ color: color.fill }}
        style={({ pressed }) => [
          styles.row,
          ios && pressed && { backgroundColor: color.neutral200 },
        ]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.rowLine}>
            <T variant="strong" style={{ flex: 1 }} numberOfLines={1}>
              {job.customer?.name ?? "Customer"}
            </T>
            <T variant="muted" numberOfLines={1}>
              {job.status === "in_progress"
                ? "In progress"
                : formatSchedule(job.scheduled_start, now, timeZone)}
            </T>
          </View>
          <View style={styles.rowLine}>
            <T variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {job.number ? `#${job.number} · ` : "New · "}
              {job.property ? formatAddress(job.property) : "Address"}
            </T>
            <StatusChip status={job.status} />
          </View>
        </View>
        {ios ? (
          <Icon name="chevron" size={14} weight="semibold" color={tint(color.textMuted, 0.6)} />
        ) : null}
      </Pressable>
    </View>
  );
}

/** Height of the floating New Job pill (the field app's minimum tap target plus a little). */
const FAB_HEIGHT = touch + 4;

const GROUP_RADIUS = 12;

const styles = StyleSheet.create({
  list: { padding: space["4"] },
  headerActions: { flexDirection: "row", alignItems: "center", gap: ios ? space["2"] : 0 },
  // iPhone: section headers line up with the rows' text, as in iOS inset grouped lists.
  sectionTitle: {
    marginTop: space["4"],
    marginBottom: space["2"],
    paddingHorizontal: ios ? space["4"] : 0,
  },
  rowBox: { backgroundColor: color.surface, overflow: "hidden" },
  rowFirst: { borderTopLeftRadius: GROUP_RADIUS, borderTopRightRadius: GROUP_RADIUS },
  rowLast: { borderBottomLeftRadius: GROUP_RADIUS, borderBottomRightRadius: GROUP_RADIUS },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space["4"],
    backgroundColor: color.separator,
  },
  row: {
    minHeight: touch + 16,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingVertical: space["3"],
    paddingLeft: space["4"],
    paddingRight: ios ? space["3"] : space["4"],
  },
  rowLine: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  empty: { paddingVertical: space["7"], gap: space["2"] },
  // Floating pill anchored bottom-right above the home indicator.
  fab: {
    position: "absolute",
    right: space["4"],
    minHeight: FAB_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space["1"],
    paddingLeft: space["4"],
    paddingRight: space["5"],
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    shadowColor: color.navy,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    fontFamily: font.displayExtraBold,
    fontSize: 18,
    letterSpacing: 0.4,
    color: color.onPrimary,
  },
});
