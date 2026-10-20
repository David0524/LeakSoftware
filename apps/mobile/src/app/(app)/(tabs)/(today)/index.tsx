import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  LOCK_LABELS,
  canMakeJobs,
  daySummary,
  durationLabel,
  formatAddress,
  mapStatus,
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
import { ReorderStopRow, useRowPlaces, useTodayReorder } from "../../../../features/today/Reorder";
import { TodayHeroCard, heroPlace } from "../../../../features/today/TodayHero";
import { useTodayHero } from "../../../../features/today/useTodayHero";
import { WeatherBadge } from "../../../../features/today/WeatherBadge";
import {
  clearStopAction,
  liveJustDone,
  pendingStopAction,
  useLiveStopVersion,
  type StopAction,
} from "../../../../lib/liveStop";
import { todayList } from "../../../../lib/todayHero";
import { useCompany, useSession } from "../../../../state/session";
import { useWalkthrough } from "../../../../state/walkthrough";
import { openDirections, useDirectionsChoice } from "../../../../state/directions";
import {
  Button,
  Empty,
  FilterPills,
  HeaderButton,
  Notice,
  Pill,
  RoundButton,
  Screen,
  StatusChip,
  T,
} from "../../../../ui/components";
import { haptics } from "../../../../ui/haptics";
import { usePinnedSyncBar } from "../../../../ui/SyncBar";
import { SwipeTrailing } from "../../../../ui/SwipeRow";
import { UndoRow } from "../../../../ui/Undo";
import { AddressLine } from "../../../../ui/NotOnMap";
import { useRoutingOn } from "../../../../lib/routing";
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
 * 2026-10-20). It opens with a card for the stop you're on, from the same rule as the current-
 * stop notification; done stops fold into one "N done" row, and the card's stop is one row
 * marked Now (owner, 2026-10-20; docs/plans/today-hero.md).
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
  // The card for the stop you're on (core todayHero, as the notification). A stop completed in
  // the last minute shows done first, on your own day.
  const routing = useRoutingOn();
  const { hero, job: heroJob } = useTodayHero({
    companyId: company.id,
    stops,
    today,
    timeZone: tz,
    justDone: mine ? liveJustDone() : null,
  });
  const { done: doneStops, rest, nowId } = todayList(stops, today, hero);
  const [doneOpen, setDoneOpen] = useState(false);
  const heroAt = heroJob ? stops.indexOf(heroJob) : -1;
  const backLeg = summary.driveMin - summary.legs.reduce((a, b) => a + b, 0);
  // Do Later and Reorder (owner, 2026-10-20; docs/plans/today-reorder.md): the Schedule's move,
  // from this phone's jobs, saved through the sync layer.
  const reorder = useTodayReorder({ company, stops, techId: shownTech, me, manager, drive });
  const places = useRowPlaces();
  const [dragging, setDragging] = useState(false);
  const shownRows = [...(doneOpen ? doneStops : []), ...rest].map((j) => j.id);

  /** On My Way for a stop: in its row, or as the card's main button. */
  function onMyWayFor(j: JobView, opts: { onWater?: boolean; trigger?: number } = {}) {
    return (
      <OnMyWay
        phone={j.customer?.phone ?? null}
        customer={j.customer?.name ?? null}
        customerId={j.customer?.id ?? null}
        tech={myName}
        shop={company.name}
        driveMin={summary.legs[stops.indexOf(j)] ?? 0}
        windowMin={settings.windowMin}
        timeZone={tz}
        via={onMyWayVia(company.settings)}
        lineActive={line?.status === "active"}
        isManager={manager}
        jobId={j.id}
        trigger={opts.trigger}
        onWater={opts.onWater}
      />
    );
  }

  function stopRow(j: JobView, withLeg: boolean) {
    const i = stops.indexOf(j);
    const leg = withLeg ? (
      <Leg
        text={`${durationLabel(summary.legs[i] ?? 0)} ${i === 0 ? "from the shop" : "drive"}`}
        late={summary.short[i] ? durationLabel(summary.short[i]!) : null}
      />
    ) : null;
    const info = reorder.row(j.id);
    // Reorder's edit mode: a handle, Move Up and Move Down, or a lock and the reason.
    if (reorder.editing && info) {
      return (
        <ReorderStopRow
          key={j.id}
          job={j}
          n={i + 1}
          timeZone={tz}
          info={info}
          now={j.id === nowId}
          leg={leg}
          onLayout={places.onLayout(j.id)}
          onAct={(a) => reorder.act(j.id, a)}
          onDragging={setDragging}
          onDrop={(dy) => reorder.drop(j.id, places.landsBefore(j.id, dy, shownRows))}
        />
      );
    }
    const doLater = info?.canLater ? () => reorder.doLater(j.id, "row") : null;
    const stop = (
      <Stop
        job={j}
        n={i + 1}
        next={j.id === nowId}
        timeZone={tz}
        day={today}
        action={mine && asked?.jobId === j.id ? asked : null}
        onMyWay={
          mine
            ? onMyWayFor(j, {
                trigger:
                  asked?.jobId === j.id && asked.action === "on_my_way" ? asked.nonce : undefined,
              })
            : null
        }
        onDirections={() => openDirections(heroPlace(j), choice)}
        doLater={doLater}
        undoText={reorder.undoText(j.id, "row")}
        onUndo={reorder.undo}
      />
    );
    return (
      <View key={j.id} style={styles.stopWrap}>
        {leg}
        {/* A trailing swipe for Do Later; the open row's Do Later button is the visible way. */}
        {doLater ? (
          <SwipeTrailing label="Do Later" tint={color.link} onPress={doLater}>
            {stop}
          </SwipeTrailing>
        ) : (
          stop
        )}
      </View>
    );
  }

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
        reorder.editing
          ? () => <HeaderButton title="Done" strong onPress={() => reorder.setEditing(false)} />
          : canAdd
            ? () => (
                <HeaderButton title="New Job" icon="add" onPress={() => router.push("/jobs/new")} />
              )
            : undefined
      }
      scrollEnabled={!dragging}
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
          {/* "6 stops · 1 hr 15 min driving · back by 3:14 PM · Reorder" (Done while reordering). */}
          <View style={styles.dayLine}>
            <T muted>
              {stops.length} {stops.length === 1 ? "stop" : "stops"} ·{" "}
              {durationLabel(summary.driveMin)} driving
              {summary.backMin != null ? ` · back by ${minutesLabel(summary.backMin)}` : ""}
              {reorder.canReorder || reorder.editing ? " ·" : ""}
            </T>
            {reorder.canReorder || reorder.editing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={reorder.editing ? "Done" : "Reorder"}
                accessibilityHint={reorder.editing ? undefined : "Change the order of the stops"}
                onPress={() => {
                  haptics.selection();
                  reorder.setEditing(!reorder.editing);
                }}
                hitSlop={4}
                style={({ pressed }) => [styles.dayLineButton, pressed && { opacity: 0.5 }]}
              >
                <Text
                  style={[type.body, face.semiBold, { color: color.link }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {reorder.editing ? "Done" : "Reorder"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {reorder.error ? <Notice tone="error">{reorder.error}</Notice> : null}
          {hero ? (
            <TodayHeroCard
              hero={hero}
              job={heroJob}
              next={rest[0]}
              mine={mine}
              day={today}
              driveMin={heroAt >= 0 ? (summary.legs[heroAt] ?? null) : null}
              notOnMap={!!heroJob && mapStatus(heroJob.property, routing) === "missing"}
              onMyWay={(j) => onMyWayFor(j, { onWater: true })}
              onDirections={(j) => openDirections(heroPlace(j), choice)}
              doLater={{
                onPress:
                  heroJob && reorder.row(heroJob.id)?.canLater && !reorder.editing
                    ? (j) => reorder.doLater(j.id, "card")
                    : null,
                undo: reorder.cardUndo ? { text: reorder.cardUndo, onUndo: reorder.undo } : null,
              }}
            />
          ) : null}
          {doneStops.length ? (
            <View style={styles.stopWrap}>
              <Pressable
                testID="today-done"
                accessibilityRole="button"
                accessibilityLabel={`${doneStops.length} done`}
                accessibilityState={{ expanded: doneOpen }}
                onPress={() => setDoneOpen(!doneOpen)}
                style={({ pressed }) => [
                  styles.doneRow,
                  { backgroundColor: color.surface },
                  cardShadow(),
                  pressed && { opacity: 0.7 },
                ]}
              >
                <WebIcon name="check" size={18} color={color.pass} strokeWidth={3} />
                <Text
                  style={[type.bodyEmphasis, { flex: 1, color: color.textMuted }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {doneStops.length} done
                </Text>
                <View style={{ transform: [{ rotate: doneOpen ? "90deg" : "0deg" }] }}>
                  <WebIcon
                    name="chevronRight"
                    size={20}
                    color={color.textMuted}
                    strokeWidth={2.2}
                  />
                </View>
              </Pressable>
            </View>
          ) : null}
          {doneOpen || (asked && doneStops.some((j) => j.id === asked.jobId))
            ? doneStops.map((j) => stopRow(j, false))
            : null}
          {rest.map((j) => stopRow(j, true))}
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
 * on. Then a tap on an old job or future job expands it"; 2026-10-20: the card above shows the
 * stop you're on, so its row stays closed, marked Now), as the website's TodayStop: one row
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
  doLater,
  undoText,
  onUndo,
}: {
  job: JobView;
  n: number;
  /** The stop on Today's card: ringed and marked Now, and closed, since the card shows it. */
  next: boolean;
  timeZone: string;
  day: string;
  onMyWay: ReactNode;
  onDirections: () => void;
  /** The notification asked to do something on this stop: it opens and does it. */
  action: { action: StopAction; nonce: number } | null;
  /** Do Later, when this stop can move (docs/plans/today-reorder.md). */
  doLater: (() => void) | null;
  /** "Moved to 2:15 PM" for 5 seconds after its Do Later, with Undo. */
  undoText: string | null;
  onUndo: () => void;
}) {
  const done = stopDone(job, day);
  const routing = useRoutingOn();
  const [opened, setExpanded] = useState(false);
  // Asked from the notification: open, and its buttons act as they appear.
  const expanded = opened || action !== null;
  const [turn] = useState(() => new Animated.Value(0));
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
        accessibilityActions={doLater ? [{ name: "doLater", label: "Do Later" }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "doLater") doLater?.();
        }}
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
          {next ? <Pill label="Now" color={color.water} /> : null}
          {/* Most stops are scheduled; the chip shows other states. The Now row leaves it to the
              card, which already says it, so the name isn't cut short (2026-10-20). */}
          {job.status !== "scheduled" && !next ? <StatusChip status={job.status} /> : null}
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
      {/* After Do Later, where its button was: "Moved to 2:15 PM" and Undo, open or closed (a
          swipe moves a closed row). */}
      {undoText ? (
        <View style={styles.undo}>
          <UndoRow text={undoText} onUndo={onUndo} />
        </View>
      ) : null}
      {expanded ? (
        <View style={styles.body}>
          {job.property ? (
            <AddressLine
              notOnMap={mapStatus(job.property, routing) === "missing"}
              lineHeight={type.secondary.lineHeight!}
            >
              <Text
                accessibilityRole="link"
                accessibilityHint="Directions"
                onPress={onDirections}
                style={[type.secondary, { color: color.link, alignSelf: "flex-start" }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {formatAddress(job.property)}
              </Text>
            </AddressLine>
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
            {doLater && !undoText ? (
              <Button
                kind="secondary"
                title="Do Later"
                accessibilityLabel={`Do Later, ${name}`}
                onPress={doLater}
              />
            ) : null}
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
  dayLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 4,
    marginBottom: space["2"],
  },
  // Reorder and Done: 44 pt tall, though they read as the end of the line.
  dayLineButton: { minHeight: minTap, justifyContent: "center" },
  undo: { paddingHorizontal: space["3"], paddingBottom: space["2"] },
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
  // Done stops folded into one row (owner, 2026-10-20), as the website's "N done".
  doneRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
    borderRadius: shape.card,
  },
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
