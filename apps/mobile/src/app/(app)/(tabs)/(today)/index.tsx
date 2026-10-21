import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
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
  propertyLocation,
  routingSettings,
  workDay,
  startLegLabel,
  backLegLabel,
  scheduleOrder,
} from "@leakbook/core";
import { inRouteOrderViews, stopLockTag, useJobViews, type JobView } from "../../../../data/jobs";
import { useDriveTimes, useTeam } from "../../../../data/schedule";
import { useRouteStart } from "../../../../data/memberStarts";
import { useLine } from "../../../../data/texting";
import { useWeather } from "../../../../data/weather";
import { GettingStarted } from "../../../../features/today/GettingStarted";
import { CleaningsDue } from "../../../../features/maintenance/Cleanings";
import { TodayComplete, undoStopDone } from "../../../../features/job/CompleteJob";
import { OnMyWayTrigger } from "../../../../features/today/OnMyWay";
import { useStopMessage } from "../../../../features/today/useStopMessage";
import { ReorderStopRow, useRowPlaces, useTodayReorder } from "../../../../features/today/Reorder";
import { TodayHeroCard, heroPlace } from "../../../../features/today/TodayHero";
import { useHeroViewing, useTodayHero } from "../../../../features/today/useTodayHero";
import { doneIds, newlyDone, viewingFor, viewingResetKey } from "../../../../lib/heroBrowse";
import { useResultBanner } from "../../../../ui/ResultBanner";
import { SwipeNav } from "../../../../ui/SwipeNav";
import { SwipeActions } from "../../../../ui/SwipeRow";
import { WeatherBadge } from "../../../../features/today/WeatherBadge";
import {
  clearStopAction,
  pendingStopAction,
  useLiveStopVersion,
  type StopAction,
} from "../../../../lib/liveStop";
import { todayList } from "../../../../lib/todayHero";
import { useLocateMissing } from "../../../../lib/locate";
import { useFirstLoad } from "../../../../data/hooks";
import { SkeletonCards } from "../../../../ui/Skeleton";
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
import { LockTag } from "../../../../ui/LockTag";
import { UndoRow } from "../../../../ui/Undo";
import { AddressLine } from "../../../../ui/NotOnMap";
import { useRoutingOn } from "../../../../lib/routing";
import { ScreenTip } from "../../../../ui/Tip";
import { WebIcon } from "../../../../ui/WebIcon";
import { unlessSwiping } from "../../../../ui/swipeQuiet";
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

  // Whose day (managers): active techs and anyone with stops today, in the Schedule's order
  // (core scheduleOrder: the shop's saved order, else "Me" first, then A to Z).
  const team = services.sync.team();
  const members = useTeam(company.id);
  const people = useMemo(() => {
    const busy = new Set<string>();
    for (const j of dayJobs) {
      if (j.assigned_user_id) busy.add(j.assigned_user_id);
      if (j.second_tech_id) busy.add(j.second_tech_id);
    }
    const list = scheduleOrder(
      members.filter((m) => m.user_id === me || m.status === "active" || busy.has(m.user_id)),
      me,
    );
    // Each with their color dot (team and week spec section 3).
    const people = list.map((m) => ({
      value: m.user_id,
      label: m.user_id === me ? "Me" : m.name,
      dot: m.color as string | null,
    }));
    return people.some((p) => p.value === me)
      ? people
      : [{ value: me, label: "Me", dot: null }, ...people];
  }, [dayJobs, me, members]);
  // A notification's request shows your own day.
  const shownTech = !asked && people.some((p) => p.value === techId) ? techId : me;
  const mine = shownTech === me;
  const techName = people.find((p) => p.value === shownTech)?.label ?? "Teammate";
  const meProfile = team.find((t) => t.id === me);
  const myName = meProfile?.full_name || meProfile?.email || "your tech";

  const settings = useMemo(() => routingSettings(company.settings), [company.settings]);
  // Where this tech's day starts and ends: the shop, or their home (owner, 2026-10-21).
  const start = useRouteStart(company, shownTech);
  const depot = start.at;
  const line = useLine(company.id);
  const weather = useWeather((company as { postal_code?: string | null }).postal_code);
  // Kept between renders (owner, 2026-10-20: smooth), so the card's rule and the day's drive
  // times are worked out only when the stops or drive times change.
  const stops = useMemo(
    () =>
      inRouteOrderViews(
        dayJobs.filter((j) => j.assigned_user_id === shownTech || j.second_tech_id === shownTech),
      ),
    [dayJobs, shownTech],
  );
  const points = useMemo(
    () => [depot, ...stops.map((j) => propertyLocation(j.property))],
    [depot, stops],
  );
  const { drive } = useDriveTimes(company.id, points);
  const summary = useMemo(
    () =>
      daySummary(
        stops.map((j) => ({
          id: j.id,
          location: propertyLocation(j.property),
          startMin: j.scheduled_start ? localMinutes(j.scheduled_start, tz) : null,
          endMin: j.scheduled_end ? localMinutes(j.scheduled_end, tz) : null,
        })),
        depot,
        workDay(settings),
        drive,
      ),
    [stops, depot, settings, drive, tz],
  );
  // Pools on today's stops with an address but no map location are looked up in the background.
  const pools = useMemo(() => stops.map((j) => j.property), [stops]);
  useLocateMissing(company.id, pools);
  const loading = useFirstLoad(jobs.length > 0);
  // A notification's request for a stop that isn't on your route today: nothing to do.
  const askedHere = !asked || shownTech !== me || stops.some((j) => j.id === asked.jobId);
  useEffect(() => {
    if (asked && !askedHere) clearStopAction(asked.nonce);
  }, [asked, askedHere]);
  // The card for the stop you're on (core todayHero, as the notification). A stop completed in
  // the last minute shows done first, on your own day.
  const routing = useRoutingOn();
  // The stop the tech swiped or tapped to on the card (gestures spec section 1): back to the
  // day's stop when the app opens again, the day or whose day changes, or a stop starts or
  // completes.
  const [viewing, setViewing] = useHeroViewing(viewingResetKey(stops, today, shownTech));
  const { hero, job: heroJob } = useTodayHero({
    companyId: company.id,
    stops,
    today,
    timeZone: tz,
    viewing,
  });
  const currentId = hero?.currentId ?? null;

  // Mark Complete, here or on the job page, moves the card on at once; the banner says "Derek
  // Jeter done" with Undo (Reopen Visit or Mark Not Complete), on your own day (gestures spec
  // section 9).
  const banner = useResultBanner();
  const showBanner = banner.show;
  const seenDone = useRef<{ key: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    const key = `${shownTech}|${today}`;
    const before = seenDone.current?.key === key ? seenDone.current.ids : null;
    seenDone.current = { key, ids: doneIds(stops, today) };
    if (!mine) return;
    const finished = newlyDone(before, stops, today);
    const last = finished.length ? stops.find((j) => j.id === finished.at(-1)) : undefined;
    if (!last) return;
    showBanner({
      tone: "success",
      message: `${last.customer?.name ?? "The stop"} done`,
      undo: () => undoStopDone(last, today),
    });
  }, [stops, today, shownTech, mine, showBanner]);
  const stopIds = useMemo(() => stops.map((j) => j.id), [stops]);
  const onBrowse = useCallback(
    (id: string | null) => setViewing(viewingFor(id, currentId)),
    [setViewing, currentId],
  );
  // Message: the On My Way text before arriving on your own stop, else a blank text
  // (docs/design/2026-10-20-gestures.md section 2).
  const message = useStopMessage({
    companyId: company.id,
    mine,
    today,
    timeZone: tz,
    tech: myName,
    shop: company.name,
    windowMin: settings.windowMin,
    via: onMyWayVia(company.settings),
  });
  const legs = summary.legs;
  const onMessage = useCallback(
    (j: JobView) => message(j, legs[stops.indexOf(j)] ?? 0),
    [message, legs, stops],
  );
  const onDirections = useCallback((j: JobView) => openDirections(heroPlace(j), choice), [choice]);
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

  function stopRow(j: JobView, withLeg: boolean) {
    const i = stops.indexOf(j);
    const leg = withLeg ? (
      <Leg
        text={`${durationLabel(summary.legs[i] ?? 0)} ${i === 0 ? startLegLabel(start.label) : "drive"}`}
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
    return (
      <View key={j.id} style={styles.stopWrap}>
        {leg}
        <Stop
          job={j}
          n={i + 1}
          next={j.id === nowId}
          timeZone={tz}
          day={today}
          action={mine && asked?.jobId === j.id ? asked : null}
          mine={mine}
          onMessage={onMessage}
          onDirections={onDirections}
          doLater={info?.canLater ? () => reorder.doLater(j.id, "row") : null}
          undoText={reorder.undoText(j.id, "row")}
          onUndo={reorder.undo}
        />
      </View>
    );
  }

  // The current-stop notification's On My Way: sent here for your own stop (the car is gone
  // from the card and the rows; On My Way lives in Message).
  const askedJob =
    mine && asked?.action === "on_my_way" ? stops.find((j) => j.id === asked.jobId) : undefined;
  const omwTrigger = askedJob ? (
    <OnMyWayTrigger
      phone={askedJob.customer?.phone ?? null}
      customer={askedJob.customer?.name ?? null}
      customerId={askedJob.customer?.id ?? null}
      tech={myName}
      shop={company.name}
      driveMin={summary.legs[stops.indexOf(askedJob)] ?? 0}
      windowMin={settings.windowMin}
      timeZone={tz}
      via={onMyWayVia(company.settings)}
      lineActive={line?.status === "active"}
      isManager={manager}
      jobId={askedJob.id}
      trigger={asked!.nonce}
    />
  ) : null;

  // Swipe sideways for the teammate before or after (owners and admins; gestures spec section
  // 4), in the Whose Day order, stopping at either end. The pills stay the visible way.
  const shownAt = people.findIndex((p) => p.value === shownTech);
  const pickTech = (to: { value: string } | undefined) => {
    if (!to) return false;
    if (asked) clearStopAction(asked.nonce);
    setTechId(to.value);
    return true;
  };

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
      overlay={
        <>
          {sync.overlay}
          {banner.element}
        </>
      }
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

      {omwTrigger}
      <SwipeNav
        enabled={manager && people.length > 1 && !reorder.editing && !dragging}
        onPrevious={() => pickTech(people[shownAt - 1])}
        onNext={() => pickTech(people[shownAt + 1])}
      >
        {loading ? (
          // Placeholder cards while the first download fills the phone, not an empty day.
          <SkeletonCards />
        ) : stops.length === 0 ? (
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
            {/* "6 stops · 1 hr 15 min driving · Reorder" (Done while reordering). */}
            <View style={styles.dayLine}>
              <T muted>
                {stops.length} {stops.length === 1 ? "stop" : "stops"} ·{" "}
                {durationLabel(summary.driveMin)} driving
                {start.label === "home" ? ` · ${startLegLabel("home")}` : ""}
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
            {hero && !reorder.editing ? (
              <TodayHeroCard
                hero={hero}
                job={heroJob}
                mine={mine}
                day={today}
                driveMin={heroAt >= 0 ? (summary.legs[heroAt] ?? null) : null}
                notOnMap={!!heroJob && mapStatus(heroJob.property, routing) === "missing"}
                stopIds={stopIds}
                onBrowse={onBrowse}
                onMessage={onMessage}
                onDirections={onDirections}
                doLater={{
                  canMove: (j) => !!reorder.row(j.id)?.canLater,
                  onPress: (j) => reorder.doLater(j.id, "card"),
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
            <Leg text={`${durationLabel(backLeg)} ${backLegLabel(start.label)}`} />
          </View>
        )}
      </SwipeNav>
      {/* After the stops, so the first stop's buttons are on screen at launch (2026-10-20). */}
      <ScreenTip screen="today" />
    </Screen>
  );
}

/** The drive into a stop: a dotted line and the minutes (spec 5.1). */
function Leg({ text }: { text: string }) {
  return (
    <View style={styles.leg}>
      <View style={[styles.dots, { borderColor: color.textMuted }]} />
      <Text style={[type.secondary, { color: color.textMuted, flexShrink: 1 }]}>{text}</Text>
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
const Stop = memo(function Stop({
  job,
  n,
  next,
  timeZone,
  day,
  action,
  mine,
  onDirections,
  onMessage,
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
  /** Your own day: Message can fill in On My Way. */
  mine: boolean;
  onMessage: (job: JobView) => void;
  onDirections: (job: JobView) => void;
  /** The notification asked to do something on this stop: it opens and does it. */
  action: { action: StopAction; nonce: number } | null;
  /** Do Later, when this stop can move (docs/plans/today-reorder.md). */
  doLater: (() => void) | null;
  /** "Moved." for 5 seconds after its Do Later, with Undo. */
  undoText: string | null;
  onUndo: () => void;
}) {
  const done = stopDone(job, day);
  const routing = useRoutingOn();
  const [opened, setExpanded] = useState(false);
  // The swipe's Complete: opens the row and presses its Mark Complete (same checks and
  // questions as the button).
  const [completeAsked, setCompleteAsked] = useState(0);
  // Asked from the notification: open, and its buttons act as they appear.
  const expanded = opened || action !== null || completeAsked > 0;
  const [turn] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(turn, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, turn]);
  const lock = stopLockTag(job);
  const name = job.customer?.name ?? "Customer";
  const phone = job.customer?.phone;
  const call = phone ? () => void Linking.openURL(`tel:${phone}`) : null;
  const directions = job.property ? () => onDirections(job) : null;
  const complete = done ? null : () => setCompleteAsked((n) => n + 1);
  // Swipe right for Complete, left for Call and Directions (gestures spec section 5); the row's
  // own buttons and address stay the visible way, and TalkBack gets the same actions.
  const swipeActions = [
    complete ? { name: "complete", label: "Mark Complete", run: complete } : null,
    call ? { name: "call", label: "Call", run: call } : null,
    directions ? { name: "directions", label: "Directions", run: directions } : null,
    doLater ? { name: "doLater", label: "Do Later", run: doLater } : null,
  ].filter((a): a is { name: string; label: string; run: () => void } => a !== null);
  return (
    <SwipeActions
      leading={complete ? { label: "Complete", tint: color.pass, onPress: complete } : null}
      trailing={[
        ...(call ? [{ label: "Call", tint: color.link, onPress: call }] : []),
        ...(directions ? [{ label: "Directions", tint: color.water, onPress: directions }] : []),
        ...(doLater ? [{ label: "Do Later", tint: color.link, onPress: doLater }] : []),
      ]}
    >
      <View
        accessibilityLabel={`Stop ${n}: ${name}`}
        accessibilityActions={swipeActions.map((a) => ({ name: a.name, label: a.label }))}
        onAccessibilityAction={(e) =>
          swipeActions.find((a) => a.name === e.nativeEvent.actionName)?.run()
        }
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
              onPress={unlessSwiping(() => router.push(`/jobs/${job.id}`))}
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
            {lock ? <LockTag lock={lock} /> : null}
          </View>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }),
                },
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
        {/* After Do Later, where its button was: "Moved." and Undo, open or closed (a swipe
            moves a closed row). */}
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
                  onPress={unlessSwiping(() => onDirections(job))}
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
                pressNonce={completeAsked}
                onPressHandled={() => setCompleteAsked(0)}
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
                  {/* One text button: On My Way lives in Message (gestures spec section 2). */}
                  {phone ? (
                    <RoundButton
                      icon="message"
                      label={`Text ${name}`}
                      onPress={() => onMessage(job)}
                    />
                  ) : null}
                  {call ? (
                    <RoundButton icon="phone" label={`Call ${name}, ${phone}`} onPress={call} />
                  ) : null}
                </View>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </SwipeActions>
  );
});

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
