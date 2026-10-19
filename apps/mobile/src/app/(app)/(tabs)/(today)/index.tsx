import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  LOCK_LABELS,
  canMakeJobs,
  dayDirections,
  daySummary,
  durationLabel,
  estimateDriveMinutes,
  formatAddress,
  formatDay,
  formatTime,
  isManagerRole,
  localDate,
  localMinutes,
  minutesLabel,
  propertyLocation,
  routingSettings,
  workDay,
} from "@leakbook/core";
import { inRouteOrderViews, jobLock, useJobViews, type JobView } from "../../../../data/jobs";
import { useCompany, useSession } from "../../../../state/session";
import { useWalkthrough } from "../../../../state/walkthrough";
import { mapsAppFor, openDirections, useDirectionsChoice } from "../../../../state/directions";
import {
  Button,
  Empty,
  FilterPills,
  HeaderButton,
  RoundButton,
  Screen,
  StatusChip,
  T,
} from "../../../../ui/components";
import { haptics } from "../../../../ui/haptics";
import { SyncBar } from "../../../../ui/SyncBar";
import { ScreenTip } from "../../../../ui/Tip";
import {
  cardShadow,
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  shape,
  space,
  tabular,
  type,
} from "../../../../ui/theme";

/** A stop still to do: the next one is the first of these. */
const open = (j: JobView) => j.status === "scheduled" || j.status === "in_progress";

/**
 * Today (spec 5.1): your day stop by stop, from the jobs on this phone. Stops are in route
 * order with drive estimates from the shared routing rules; the server's drive times, the
 * weather and On My Way come with the full route (S8).
 */
export default function Today() {
  const company = useCompany();
  const { services, membership, user } = useSession();
  const canAdd = canMakeJobs(membership?.role, company.settings);
  const manager = isManagerRole(membership?.role);
  const jobs = useJobViews(company.id);
  const [choice] = useDirectionsChoice();
  const [refreshing, setRefreshing] = useState(false);
  const me = user?.id ?? "";
  const [techId, setTechId] = useState(me);
  const tz = company.timezone;
  const now = new Date();
  const today = localDate(now, tz);

  // The first time the app opens: the three welcome cards (walkthrough, 2026-10-16).
  const { launchSeen } = useWalkthrough();
  const welcomed = useRef(false);
  useEffect(() => {
    if (launchSeen || welcomed.current) return;
    welcomed.current = true;
    router.push("/welcome");
  }, [launchSeen]);

  const dayJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          !j.deleted_at &&
          j.status !== "canceled" &&
          j.scheduled_start &&
          localDate(new Date(j.scheduled_start), tz) === today,
      ),
    [jobs, tz, today],
  );

  // Whose day (managers): me first, then teammates with stops today, by name.
  const team = services.sync.team();
  const people = useMemo(() => {
    const ids = new Set<string>();
    for (const j of dayJobs) {
      if (j.assigned_user_id) ids.add(j.assigned_user_id);
      if (j.second_tech_id) ids.add(j.second_tech_id);
    }
    ids.delete(me);
    const name = (id: string) => {
      const p = team.find((t) => t.id === id);
      return p?.full_name ?? p?.email ?? "Teammate";
    };
    return [
      { value: me, label: "Me" },
      ...[...ids]
        .map((id) => ({ value: id, label: name(id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [dayJobs, me, team]);
  const shownTech = people.some((p) => p.value === techId) ? techId : me;
  const mine = shownTech === me;
  const techName = people.find((p) => p.value === shownTech)?.label ?? "Teammate";

  const settings = routingSettings(company.settings);
  const depot = propertyLocation(
    company as { latitude?: number | null; longitude?: number | null },
  );
  const stops = inRouteOrderViews(
    dayJobs.filter((j) => j.assigned_user_id === shownTech || j.second_tech_id === shownTech),
  );
  const summary = daySummary(
    stops.map((j) => ({
      id: j.id,
      location: propertyLocation(j.property),
      startMin: j.scheduled_start ? localMinutes(j.scheduled_start, tz) : null,
      endMin: j.scheduled_end ? localMinutes(j.scheduled_end, tz) : null,
    })),
    depot,
    workDay(settings),
    estimateDriveMinutes,
  );
  const next = stops.find(open);
  const depotAddress = formatAddress(company as unknown as Parameters<typeof formatAddress>[0]);
  const directions = dayDirections(
    mapsAppFor(choice),
    depot || depotAddress ? { address: depotAddress, location: depot } : null,
    stops.map((j) => ({
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      done: !open(j),
    })),
  );
  const backLeg = summary.driveMin - summary.legs.reduce((a, b) => a + b, 0);

  async function refresh() {
    haptics.light();
    setRefreshing(true);
    await services.sync.syncNow();
    setRefreshing(false);
  }

  return (
    <Screen
      title={mine ? "Today" : `Today · ${techName}`}
      subtitle={formatDay(today, "long")}
      headerRight={
        canAdd
          ? () => (
              <HeaderButton title="New Job" icon="add" onPress={() => router.push("/jobs/new")} />
            )
          : undefined
      }
      headerActions={
        directions ? (
          <Button
            kind="secondary"
            icon="pin"
            title={
              directions.app === "google" ? "Open Route in Google Maps" : "Next Stop in Apple Maps"
            }
            onPress={() => void Linking.openURL(directions.href)}
          />
        ) : undefined
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <SyncBar onPress={() => router.push("/more/sync")} />
      <ScreenTip screen="today" />
      {manager && people.length > 1 ? (
        <FilterPills label="Whose day" options={people} value={shownTech} onChange={setTechId} />
      ) : null}

      {stops.length === 0 ? (
        <Empty>
          <Text style={[type.body, styles.center, { color: color.textMuted }]}>
            Nothing on {mine ? "your" : "this"} route today.{" "}
            <Text
              accessibilityRole="link"
              onPress={() => router.navigate("/schedule")}
              style={{ color: color.link, textDecorationLine: "underline" }}
            >
              Open the schedule
            </Text>
            .
          </Text>
        </Empty>
      ) : (
        <View style={styles.route}>
          <T muted style={{ marginBottom: space["4"] - space["1"] }}>
            {stops.length} {stops.length === 1 ? "stop" : "stops"} ·{" "}
            {durationLabel(summary.driveMin)} driving
            {summary.backMin != null ? ` · back by ${minutesLabel(summary.backMin)}` : ""}
          </T>
          {stops.map((j, i) => (
            <View key={j.id} style={styles.stopWrap}>
              <Leg
                text={`${durationLabel(summary.legs[i] ?? 0)} ${i === 0 ? "from the shop" : "drive"}`}
                late={summary.short[i] ? durationLabel(summary.short[i]!) : null}
              />
              <Stop
                job={j}
                n={i + 1}
                next={j.id === next?.id}
                timeZone={tz}
                onDirections={() =>
                  openDirections(
                    {
                      address: j.property ? formatAddress(j.property) : "",
                      location: propertyLocation(j.property),
                    },
                    choice,
                  )
                }
              />
            </View>
          ))}
          <Leg text={`${durationLabel(backLeg)} back to the shop`} />
        </View>
      )}
    </Screen>
  );
}

/** The drive into a stop: a dotted line and the minutes (spec 5.1). */
function Leg({ text, late }: { text: string; late?: string | null }) {
  return (
    <View style={styles.leg}>
      <View style={[styles.dots, { borderColor: color.textMuted }]} />
      <Text style={[type.secondary, { color: color.textMuted, flexShrink: 1 }]}>
        {text}
        {late ? (
          <Text style={[face.semiBold, { color: color.warning }]}> · {late} late</Text>
        ) : null}
      </Text>
    </View>
  );
}

/** One stop: number, time, status; the customer; the address; access notes. */
function Stop({
  job,
  n,
  next,
  timeZone,
  onDirections,
}: {
  job: JobView;
  n: number;
  next: boolean;
  timeZone: string;
  onDirections: () => void;
}) {
  const done = !open(job);
  const lock = jobLock(job);
  const name = job.customer?.name ?? "Customer";
  const phone = job.customer?.phone;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Stop ${n}: ${name}`}
      onPress={() => router.push(`/jobs/${job.id}`)}
      style={({ pressed }) => [
        styles.stop,
        { backgroundColor: color.surface },
        cardShadow(),
        next && { borderWidth: 2, borderColor: color.link, padding: space["3"] - 2 },
        done && { opacity: 0.7 },
        pressed && { opacity: done ? 0.6 : 0.85 },
      ]}
    >
      <View style={styles.stopTop}>
        <View
          style={[styles.number, { backgroundColor: next ? color.link : color.bg }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Text style={[styles.numberText, { color: next ? color.bg : color.text }]}>{n}</Text>
        </View>
        <Text style={[styles.time, tabular, { color: color.text }]}>
          {job.scheduled_start ? formatTime(job.scheduled_start, timeZone) : ""}
        </Text>
        {job.status !== "scheduled" ? <StatusChip status={job.status} /> : null}
        {lock && lock !== "started" ? (
          <T variant="footnote" muted style={face.semiBold}>
            {LOCK_LABELS[lock]}
          </T>
        ) : null}
        {!done && phone ? (
          <View style={styles.actions}>
            <RoundButton
              icon="phone"
              label={`Call ${name}, ${phone}`}
              onPress={() => void Linking.openURL(`tel:${phone}`)}
            />
          </View>
        ) : null}
      </View>
      <T variant="bodyEmphasis" numberOfLines={1} style={{ marginTop: space["1"] }}>
        {name}
      </T>
      {done || !job.property ? null : (
        <>
          <Text
            accessibilityRole="link"
            accessibilityHint="Directions"
            onPress={onDirections}
            style={[type.secondary, { color: color.link, alignSelf: "flex-start" }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {formatAddress(job.property)}
          </Text>
          {job.property.access_notes ? (
            <Text
              numberOfLines={2}
              style={[
                type.secondary,
                styles.access,
                { color: color.text, backgroundColor: color.accessFill },
              ]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {job.property.access_notes}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  route: { gap: 0 },
  stopWrap: { gap: space["1"], marginBottom: space["1"] },
  leg: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["4"],
    paddingVertical: 2,
  },
  dots: { height: 16, borderLeftWidth: 2, borderStyle: "dotted" },
  stop: { borderRadius: shape.card, padding: space["3"] },
  stopTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["2"] },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontFamily: font.displayBold, fontSize: 17, fontVariant: ["tabular-nums"] },
  time: { fontFamily: font.displayBold, fontSize: 17 },
  actions: { marginLeft: "auto", flexDirection: "row", gap: space["2"] },
  access: {
    marginTop: space["1"],
    borderRadius: 8,
    paddingHorizontal: space["2"],
    paddingVertical: space["1"],
    overflow: "hidden",
  },
});
