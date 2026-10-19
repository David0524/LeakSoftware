import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  addDays,
  canMakeJobs,
  formatDay,
  formatTime,
  localDate,
  scheduleDays,
} from "@leakbook/core";
import { inRouteOrderViews, useJobViews } from "../../../../data/jobs";
import { useCompany, useSession } from "../../../../state/session";
import {
  Group,
  HeaderButton,
  ListRow,
  RoundButton,
  Screen,
  StatusChip,
  T,
} from "../../../../ui/components";
import { ScreenTip } from "../../../../ui/Tip";
import { color, face, space, type } from "../../../../ui/theme";

/**
 * Schedule, first version (spec 5.6 Week view): the week's jobs by day, Monday to Sunday,
 * with Previous and Next. The Day view's routes, the Month grid, Needs a Time, Move and Plan
 * Route come with S8.
 */
export default function Schedule() {
  const company = useCompany();
  const { services, membership } = useSession();
  const canAdd = canMakeJobs(membership?.role, company.settings);
  const jobs = useJobViews(company.id);
  const tz = company.timezone;
  const today = localDate(new Date(), tz);
  const [date, setDate] = useState(today);
  const days = scheduleDays("week", date);
  const team = services.sync.team();
  const techName = (id: string | null | undefined) => {
    if (!id) return "Unassigned";
    const p = team.find((t) => t.id === id);
    return p?.full_name ?? p?.email ?? "Teammate";
  };

  const byDay = useMemo(() => {
    const map = new Map<string, typeof jobs>();
    for (const j of jobs) {
      if (j.deleted_at || j.status === "canceled" || !j.scheduled_start) continue;
      const d = localDate(new Date(j.scheduled_start), tz);
      map.set(d, [...(map.get(d) ?? []), j]);
    }
    return map;
  }, [jobs, tz]);

  const inView = days.some((d) => (byDay.get(d)?.length ?? 0) > 0);
  const onToday = days.includes(today);

  return (
    <Screen
      title="Schedule"
      subtitle={
        <Text style={[type.body, { color: color.textMuted }]}>
          {formatDay(days[0]!)} – {formatDay(days[6]!)}
          {onToday ? null : (
            <>
              {" · "}
              <Text
                accessibilityRole="button"
                onPress={() => setDate(today)}
                style={[face.semiBold, { color: color.link }]}
              >
                Today
              </Text>
            </>
          )}
        </Text>
      }
      headerRight={
        canAdd
          ? () => (
              <HeaderButton title="New Job" icon="add" onPress={() => router.push("/jobs/new")} />
            )
          : undefined
      }
    >
      <ScreenTip screen="schedule" />
      <View style={styles.controls}>
        <RoundButton icon="back" label="Previous week" onPress={() => setDate(addDays(date, -7))} />
        <RoundButton icon="forward" label="Next week" onPress={() => setDate(addDays(date, 7))} />
      </View>
      {days.map((d) => {
        const list = inRouteOrderViews(byDay.get(d) ?? []);
        const isToday = d === today;
        return (
          <View key={d} style={styles.day}>
            <View style={styles.dayHead}>
              <T variant="subHeading" style={isToday ? { color: color.link } : null}>
                {formatDay(d, "long")}
                {isToday ? " · Today" : ""}
              </T>
              {list.length === 0 ? (
                <T variant="secondary" muted>
                  Nothing scheduled
                </T>
              ) : null}
            </View>
            {list.length > 0 ? (
              <Group>
                {list.map((j) => (
                  <ListRow
                    key={j.id}
                    onPress={() => router.push(`/jobs/${j.id}`)}
                    trailing={<StatusChip status={j.status} style={{ alignSelf: "center" }} />}
                  >
                    <T variant="bodyEmphasis">
                      {formatTime(j.scheduled_start!, tz)}
                      {j.number ? ` · #${j.number}` : ""}
                    </T>
                    <T variant="secondary" muted numberOfLines={1}>
                      <Text style={{ color: color.text }}>{j.customer?.name ?? "Customer"}</Text>
                      {" · "}
                      {techName(j.assigned_user_id)}
                    </T>
                  </ListRow>
                ))}
              </Group>
            ) : null}
          </View>
        );
      })}
      {inView ? null : (
        <T muted style={{ textAlign: "center" }}>
          No jobs scheduled this week.
        </T>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  day: { gap: space["2"] },
  dayHead: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: space["2"] },
});
