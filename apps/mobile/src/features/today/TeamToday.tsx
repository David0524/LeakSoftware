import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
import { AppState, StyleSheet, View } from "react-native";
import {
  daySummary,
  formatTime,
  jobMinutes,
  lastDoneLine,
  localMinutes,
  propertyLocation,
  startFor,
  stopDone,
  techDayProgress,
  workDay,
  type Company,
  type LatLng,
  type RoutingSettings,
  type TechDayProgress,
} from "@leakbook/core";
import { inRouteOrderViews, type JobView } from "../../data/jobs";
import { shopLocation, useMemberStarts } from "../../data/memberStarts";
import { useDriveTimes } from "../../data/schedule";
import { getServices } from "../../lib/services";
import { DayRing } from "../../ui/DayRing";
import { TechDot } from "../../ui/TechDot";
import { Group, ListRow, Pill, Section, StatusChip, T } from "../../ui/components";
import { color, face, space } from "../../ui/theme";

/** How often the owner's Today brings teammates' changes down while it's showing. */
export const TEAM_SYNC_MS = 15_000;

export interface TeamPerson {
  value: string;
  label: string;
  dot: string | null;
}

export interface TeamTodayRow extends TeamPerson {
  day: TechDayProgress;
  lastDone: string | null;
}

/**
 * The owner's Team on Today (owner, 2026-10-22: "The owner sees techs' progress live"; docs/
 * design/2026-10-22-owner-live-today.md), as the website's: each person with stops today, in
 * Whose Day's order, with the day's ring, the stop they're on and the last one done (core
 * techDayProgress). Their drive times come from the same cache as Today's.
 */
export function useTeamToday({
  company,
  dayJobs,
  people,
  today,
  settings,
  enabled,
}: {
  company: Company;
  dayJobs: JobView[];
  people: TeamPerson[];
  today: string;
  settings: RoutingSettings;
  enabled: boolean;
}): TeamTodayRow[] {
  const tz = company.timezone;
  const starts = useMemberStarts(company.id);
  const shop = shopLocation(company);
  const days = useMemo(() => {
    if (!enabled) return [];
    return people
      .map((p) => {
        const stops = inRouteOrderViews(
          dayJobs.filter((j) => j.assigned_user_id === p.value || j.second_tech_id === p.value),
        );
        return { person: p, stops, start: startFor(p.value, starts, shop).at };
      })
      .filter((d) => d.stops.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shop's point by value
  }, [enabled, people, dayJobs, starts, shop?.lat, shop?.lng]);
  const points = useMemo(
    () =>
      days.flatMap((d) => [
        d.start,
        ...d.stops.map((j) => propertyLocation(j.property)),
      ]) as (LatLng | null)[],
    [days],
  );
  const { drive } = useDriveTimes(company.id, points);
  return useMemo(
    () =>
      days.map(({ person, stops, start }) => {
        const summary = daySummary(
          stops.map((j) => ({
            id: j.id,
            location: propertyLocation(j.property),
            startMin: j.scheduled_start ? localMinutes(j.scheduled_start, tz) : null,
            endMin: j.scheduled_end ? localMinutes(j.scheduled_end, tz) : null,
          })),
          start,
          workDay(settings),
          drive,
        );
        const day = techDayProgress(
          stops.map((j, i) => ({
            customer: j.customer?.name ?? "Customer",
            done: stopDone(j, today),
            durationMin: jobMinutes({ ...j, property: j.property ?? null }, settings),
            driveMin: summary.legs[i] ?? null,
            onSite: j.status === "in_progress",
            doneAt: j.stop_done_at ?? null,
          })),
        );
        const last = day.lastDone;
        return {
          ...person,
          day,
          lastDone: last
            ? lastDoneLine(last.customer, last.at ? formatTime(last.at, tz) : null)
            : null,
        };
      }),
    [days, drive, settings, today, tz],
  );
}

/**
 * While the owner's Today shows the team, the phone brings changes down every 15 seconds (it
 * otherwise syncs every minute), so a tech's Start or Mark Complete shows within seconds.
 */
export function useTeamSync(enabled: boolean) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const t = setInterval(() => {
        if (AppState.currentState === "active") void getServices().sync.syncNow();
      }, TEAM_SYNC_MS);
      return () => clearInterval(t);
    }, [enabled]),
  );
}

/** The Team list: one row per tech; a row shows that tech's day, as Whose Day does. */
export function TeamToday({
  rows,
  shown,
  onPick,
}: {
  rows: TeamTodayRow[];
  shown: string;
  onPick: (id: string) => void;
}) {
  return (
    <Section title="Team">
      <View testID="team-today">
        <Group separatorInset={space["4"] + 28 + space["3"]}>
          {rows.map((r) => {
            const { day } = r;
            const current = day.current;
            const spoken = [
              r.label,
              day.progress.text ? day.progress.spoken : day.line,
              current ? `${current.started ? "In progress" : "Now"}: ${current.customer}` : null,
              r.lastDone,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <ListRow
                key={r.value}
                onPress={() => onPick(r.value)}
                accessibilityRole="button"
                accessibilityLabel={spoken}
                accessibilityHint={r.value === shown ? undefined : "Shows their day"}
                leading={<DayRing progress={day.progress} />}
              >
                <View style={styles.top}>
                  <TechDot tech={r.dot} />
                  <T style={styles.name} numberOfLines={1}>
                    {r.label}
                  </T>
                  <T variant="secondary" muted style={styles.line}>
                    {day.line}
                  </T>
                </View>
                {current ? (
                  <View style={styles.now}>
                    {current.started ? (
                      <StatusChip status="in_progress" />
                    ) : (
                      <Pill label="Now" color={color.water} />
                    )}
                    <T variant="secondary" numberOfLines={1} style={styles.customer}>
                      {current.customer}
                    </T>
                  </View>
                ) : null}
                {r.lastDone ? (
                  <T variant="footnote" muted numberOfLines={1}>
                    {r.lastDone}
                  </T>
                ) : null}
              </ListRow>
            );
          })}
        </Group>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  name: { flexShrink: 1, ...face.semiBold },
  line: { marginLeft: "auto", paddingLeft: space["2"], fontVariant: ["tabular-nums"] },
  now: { flexDirection: "row", alignItems: "center", gap: space["2"], marginTop: space["1"] },
  customer: { flexShrink: 1 },
});
