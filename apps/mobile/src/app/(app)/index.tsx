import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAddress, formatSchedule, groupJobs } from "@leakbook/core";
import { useJobViews, type JobView } from "../../data/jobs";
import { useCompany, useSession } from "../../state/session";
import { StatusChip, T } from "../../ui/components";
import { SyncBar } from "../../ui/SyncBar";
import { color, font, radius, space, touch } from "../../ui/theme";

export default function Jobs() {
  const company = useCompany();
  const { services } = useSession();
  const jobs = useJobViews(company.id);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const now = new Date();

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
    setRefreshing(true);
    await services.sync.syncNow();
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: company.name,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={12}
              onPress={() => router.push("/settings")}
            >
              <Ionicons name="settings-outline" size={24} color={color.onHeader} />
            </Pressable>
          ),
        }}
      />
      <SyncBar onPress={() => router.push("/settings")} />
      <SectionList
        sections={sections}
        keyExtractor={(j) => j.id}
        // Room for the last row to scroll clear of the floating New Job button.
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + FAB_HEIGHT + space["4"] * 2 },
        ]}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderSectionHeader={({ section }) => (
          <T variant="label" style={styles.sectionTitle}>
            {section.title}
          </T>
        )}
        renderItem={({ item }) => <JobRow job={item} now={now} timeZone={company.timezone} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <T variant="heading">No jobs yet</T>
            <T variant="muted">
              Create your first job. It works without signal and syncs when you’re back online.
            </T>
          </View>
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New Job"
        onPress={() => router.push("/jobs/new")}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + space["4"] },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add" size={24} color={color.onPrimary} />
        <Text style={styles.fabText} maxFontSizeMultiplier={1.6}>
          New Job
        </Text>
      </Pressable>
    </View>
  );
}

function JobRow({ job, now, timeZone }: { job: JobView; now: Date; timeZone: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/jobs/${job.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
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
    </Pressable>
  );
}

/** Height of the floating New Job pill (the field app's minimum tap target plus a little). */
const FAB_HEIGHT = touch + 4;

const styles = StyleSheet.create({
  list: { padding: space["4"], gap: space["2"] },
  sectionTitle: { marginTop: space["3"], marginBottom: space["1"] },
  row: {
    backgroundColor: color.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    padding: space["3"],
    gap: 4,
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
