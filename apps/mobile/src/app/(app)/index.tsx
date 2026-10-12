import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAddress, formatSchedule, groupJobs } from "@leakbook/core";
import { useJobViews, type JobView } from "../../data/jobs";
import { useCompany, useSession } from "../../state/session";
import { Button, StatusChip, T } from "../../ui/components";
import { SyncBar } from "../../ui/SyncBar";
import { color, space } from "../../ui/theme";

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
        contentContainerStyle={styles.list}
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
      <View style={[styles.footer, { paddingBottom: insets.bottom + space["3"] }]}>
        <Button title="New Job" onPress={() => router.push("/jobs/new")} />
      </View>
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
      <View style={styles.rowTop}>
        <T variant="strong" style={{ flex: 1 }} numberOfLines={1}>
          {job.customer?.name ?? "Customer"}
        </T>
        <StatusChip status={job.status} />
      </View>
      <T variant="small" numberOfLines={1}>
        {job.property ? formatAddress(job.property) : "Address"}
      </T>
      <T variant="muted">
        {job.number ? `#${job.number} · ` : "New · "}
        {job.status === "in_progress"
          ? "In progress"
          : formatSchedule(job.scheduled_start, now, timeZone)}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: space["4"], gap: space["2"], paddingBottom: 120 },
  sectionTitle: { marginTop: space["3"], marginBottom: space["1"] },
  row: {
    backgroundColor: color.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    padding: space["4"],
    gap: 4,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  empty: { paddingVertical: space["7"], gap: space["2"] },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space["4"],
    paddingTop: space["3"],
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
