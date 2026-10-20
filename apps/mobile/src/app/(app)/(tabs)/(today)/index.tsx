import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  LOCK_LABELS,
  canMakeJobs,
  dayDirections,
  daySummary,
  durationLabel,
  formatAddress,
  formatDay,
  formatTime,
  isManagerRole,
  localDate,
  onMyWayVia,
  stopDone,
  localMinutes,
  minutesLabel,
  propertyLocation,
  routingSettings,
  workDay,
} from "@leakbook/core";
import { inRouteOrderViews, jobLock, useJobViews, type JobView } from "../../../../data/jobs";
import { useDriveTimes, useTeam } from "../../../../data/schedule";
import { useLine } from "../../../../data/texting";
import { useWeather } from "../../../../data/weather";
import { GettingStarted } from "../../../../features/today/GettingStarted";
import { CleaningsDue } from "../../../../features/maintenance/Cleanings";
import { TodayComplete } from "../../../../features/job/CompleteJob";
import { OnMyWay } from "../../../../features/today/OnMyWay";
import { WeatherBadge } from "../../../../features/today/WeatherBadge";
import {
  clearStopAction,
  pendingStopAction,
  useLiveStopVersion,
  type StopAction,
} from "../../../../lib/liveStop";
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
import { usePinnedSyncBar } from "../../../../ui/SyncBar";
import { ScreenTip } from "../../../../ui/Tip";
import { WebIcon } from "../../../../ui/WebIcon";
import {
  cardShadow,
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  type,
} from "../../../../ui/theme";

/**
 * Today (spec 5.1): your day stop by stop, from the jobs on this phone. Stops are in route
 * order with drive estimates from the shared routing rules; the server's drive times, the
 * weather and On My Way come with the full route (S8). The sync bar stays pinned under the bar
 * and the tip comes after the stops, so the first stop's buttons are in view at launch (owner,
 * 2026-10-20).
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
  const sync = usePinnedSyncBar(() => router.push("/more/sync"));
  // The current-stop notification's On My Way or Mark Complete: done on your own stop here.
  useLiveStopVersion();
  const asked = pendingStopAction();
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

  // Whose day (managers): active techs and anyone with stops today, "Me" first (the website's
  // order: the team by name).
  const team = services.sync.team();
  const members = useTeam(company.id);
  const people = useMemo(() => {
    const busy = new Set<string>();
    for (const j of dayJobs) {
      if (j.assigned_user_id) busy.add(j.assigned_user_id);
      if (j.second_tech_id) busy.add(j.second_tech_id);
    }
    const list = members.filter(
      (m) => m.user_id !== me && (m.status === "active" || busy.has(m.user_id)),
    );
    return [{ value: me, label: "Me" }, ...list.map((m) => ({ value: m.user_id, label: m.name }))];
  }, [dayJobs, me, members]);
  // A notification's request shows your own day.
  const shownTech = !asked && people.some((p) => p.value === techId) ? techId : me;
  const mine = shownTech === me;
  const techName = people.find((p) => p.value === shownTech)?.label ?? "Teammate";
  const meProfile = team.find((t) => t.id === me);
  const myName = meProfile?.full_name || meProfile?.email || "your tech";

  const settings = routingSettings(company.settings);
  const depot = propertyLocation(
    company as { latitude?: number | null; longitude?: number | null },
  );
  const line = useLine(company.id);
  const weather = useWeather((company as { postal_code?: string | null }).postal_code);
  const stops = inRouteOrderViews(
    dayJobs.filter((j) => j.assigned_user_id === shownTech || j.second_tech_id === shownTech),
  );
  const { drive } = useDriveTimes(company.id, [
    depot,
    ...stops.map((j) => propertyLocation(j.property)),
  ]);
  const summary = daySummary(
    stops.map((j) => ({
      id: j.id,
      location: propertyLocation(j.property),
      startMin: j.scheduled_start ? localMinutes(j.scheduled_start, tz) : null,
      endMin: j.scheduled_end ? localMinutes(j.scheduled_end, tz) : null,
    })),
    depot,
    workDay(settings),
    drive,
  );
  // A notification's request for a stop that isn't on your route today: nothing to do.
  const askedHere = !asked || shownTech !== me || stops.some((j) => j.id === asked.jobId);
  useEffect(() => {
    if (asked && !askedHere) clearStopAction(asked.nonce);
  }, [asked, askedHere]);
  // The stop you're on: the first not done today (Mark Complete moves it on).
  const next = stops.find((j) => !stopDone(j, today));
  const depotAddress = formatAddress(company as unknown as Parameters<typeof formatAddress>[0]);
  const directions = dayDirections(
    mapsAppFor(choice),
    depot || depotAddress ? { address: depotAddress, location: depot } : null,
    stops.map((j) => ({
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      done: stopDone(j, today),
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
      subtitle={
        <View style={styles.subtitle}>
          <T muted>{formatDay(today, "long")}</T>
          {weather ? <WeatherBadge weather={weather} /> : null}
        </View>
      }
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
      topInset={sync.height}
      overlay={sync.overlay}
    >
      {sync.inline}
      {manager ? <GettingStarted company={company} /> : null}
      {manager && people.length > 1 ? (
        <FilterPills
          label="Whose day"
          options={people}
          value={shownTech}
          onChange={(v) => {
            if (asked) clearStopAction(asked.nonce);
            setTechId(v);
          }}
        />
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
                day={today}
                action={mine && asked?.jobId === j.id ? asked : null}
                onMyWay={
                  mine ? (
                    <OnMyWay
                      phone={j.customer?.phone ?? null}
                      customer={j.customer?.name ?? null}
                      customerId={j.customer?.id ?? null}
                      tech={myName}
                      shop={company.name}
                      driveMin={summary.legs[i] ?? 0}
                      windowMin={settings.windowMin}
                      timeZone={tz}
                      via={onMyWayVia(company.settings)}
                      lineActive={line?.status === "active"}
                      isManager={manager}
                      jobId={j.id}
                      trigger={
                        asked?.jobId === j.id && asked.action === "on_my_way"
                          ? asked.nonce
                          : undefined
                      }
                    />
                  ) : null
                }
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
      {/* After the stops, so the first stop's buttons are on screen at launch (2026-10-20). */}
      <ScreenTip screen="today" />
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

/**
 * One stop (owner, 2026-10-19: "keep these cards on Today collapsed except for the job you are
 * on. Then a tap on an old job or future job expands it"), as the website's TodayStop: one row
 * (number, or a green check when done; time; customer; state) that opens to the address,
 * cleanings, Mark Complete, call, and On My Way. Access notes show under the row, open or
 * closed.
 */
function Stop({
  job,
  n,
  next,
  timeZone,
  day,
  action,
  onDirections,
  onMyWay,
}: {
  job: JobView;
  n: number;
  /** The stop you're on: open, and ringed. */
  next: boolean;
  timeZone: string;
  day: string;
  onMyWay: ReactNode;
  onDirections: () => void;
  /** The notification asked to do something on this stop: it opens and does it. */
  action: { action: StopAction; nonce: number } | null;
}) {
  const done = stopDone(job, day);
  const [opened, setExpanded] = useState(next);
  // Asked from the notification: open, and its buttons act as they appear.
  const expanded = opened || action !== null;
  const [turn] = useState(() => new Animated.Value(next ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, turn]);
  const lock = jobLock(job);
  const name = job.customer?.name ?? "Customer";
  const phone = job.customer?.phone;
  return (
    <View
      accessibilityLabel={`Stop ${n}: ${name}`}
      style={[
        styles.stop,
        { backgroundColor: color.surface },
        cardShadow(),
        next && { borderWidth: 2, borderColor: color.link },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Stop ${n}: ${name}${done ? ", done" : ""}`}
        accessibilityState={{ expanded }}
        onPress={() => {
          if (action) clearStopAction(action.nonce);
          setExpanded(!expanded);
        }}
        style={({ pressed }) => [styles.stopTop, pressed && { opacity: 0.7 }]}
      >
        <View
          style={[
            styles.number,
            { backgroundColor: done ? color.pass : next ? color.link : color.bg },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {done ? (
            <WebIcon name="check" size={16} color={color.onStatus} strokeWidth={3} />
          ) : (
            <Text style={[styles.numberText, { color: next ? color.bg : color.text }]}>{n}</Text>
          )}
        </View>
        <View style={[styles.summary, done && { opacity: 0.7 }]}>
          <Text style={[styles.time, tabular, { color: color.text }]}>
            {job.scheduled_start ? formatTime(job.scheduled_start, timeZone) : ""}
          </Text>
          {/* The name is the link to the job, open or closed (owner, 2026-10-20); the rest of
              the row opens and closes the card. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open the job for ${name}`}
            onPress={() => router.push(`/jobs/${job.id}`)}
            hitSlop={8}
            style={({ pressed }) => [styles.nameLink, pressed && { opacity: 0.5 }]}
          >
            <Text
              numberOfLines={1}
              style={[type.bodyEmphasis, { color: color.link, flexShrink: 1 }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {name}
            </Text>
            <WebIcon name="chevronRight" size={16} color={color.link} strokeWidth={2.4} />
          </Pressable>
          {/* Most stops are scheduled; the chip shows other states. */}
          {job.status !== "scheduled" ? <StatusChip status={job.status} /> : null}
          {lock && lock !== "started" ? (
            <T variant="footnote" muted style={face.semiBold}>
              {LOCK_LABELS[lock]}
            </T>
          ) : null}
        </View>
        <Animated.View
          style={{
            transform: [
              { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) },
            ],
          }}
        >
          <WebIcon name="chevronDown" size={20} color={color.textMuted} strokeWidth={2.2} />
        </Animated.View>
      </Pressable>
      {/* Gate code, which gate, dogs: on the card open or closed (owner, 2026-10-20). */}
      {job.property?.access_notes?.trim() && !done ? (
        <View
          accessible
          accessibilityLabel={`Access: ${job.property.access_notes.trim()}`}
          style={styles.access}
        >
          <View style={styles.accessIcon}>
            <WebIcon name="key" size={18} color={color.warning} />
          </View>
          <Text
            numberOfLines={expanded ? undefined : 1}
            style={[type.secondary, face.medium, { flex: 1, color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {job.property.access_notes.trim()}
          </Text>
        </View>
      ) : null}
      {expanded ? (
        <View style={styles.body}>
          {job.property ? (
            <Text
              accessibilityRole="link"
              accessibilityHint="Directions"
              onPress={onDirections}
              style={[type.secondary, { color: color.link, alignSelf: "flex-start" }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {formatAddress(job.property)}
            </Text>
          ) : null}
          {/* Just the icon and how soon (owner, 2026-10-19), as the website. */}
          {done ? null : <CleaningsDue job={job} />}
          <View style={styles.buttons}>
            {/* Every stop: done for the day without the full process (owner, 2026-10-19). */}
            <TodayComplete
              job={job}
              customer={job.customer?.name ?? "this stop"}
              day={day}
              done={done}
              customerName={job.customer?.name ?? null}
              trigger={action?.action === "mark_complete" ? action.nonce : undefined}
            />
            {done ? null : (
              <View style={styles.actions}>
                {phone ? (
                  <RoundButton
                    icon="phone"
                    label={`Call ${name}, ${phone}`}
                    onPress={() => void Linking.openURL(`tel:${phone}`)}
                  />
                ) : null}
                {onMyWay}
              </View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  subtitle: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space["3"],
    rowGap: space["1"],
  },
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
  stop: { borderRadius: shape.card, overflow: "hidden" },
  stopTop: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
  },
  summary: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space["2"],
  },
  nameLink: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 1,
  },
  body: { gap: space["1"], paddingHorizontal: space["3"], paddingBottom: space["3"] },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: space["2"],
    paddingTop: space["2"],
  },
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
  // Lined up with the time and name, under the stop's number.
  access: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: -space["1"],
    paddingLeft: space["3"] + 32 + space["2"],
    paddingRight: space["3"],
    paddingBottom: space["2"],
  },
  accessIcon: { marginTop: 1 },
});
