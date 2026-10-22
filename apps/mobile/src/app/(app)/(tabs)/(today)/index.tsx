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
import {
  ReorderStopRow,
  useRowDrag,
  useRowPlaces,
  useTodayReorder,
} from "../../../../features/today/Reorder";
import { TodayHeroCard, heroPlace } from "../../../../features/today/TodayHero";
import { useHeroViewing, useTodayHero } from "../../../../features/today/useTodayHero";
import { doneIds, newlyDone, viewingFor, viewingResetKey } from "../../../../lib/heroBrowse";
import { useResultBanner } from "../../../../ui/ResultBanner";
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
import { WebIcon } from "../../../../ui/WebIcon";
import { DriveChip } from "../../../../ui/DriveChip";
import { driveChipMinutes, driveFromOffMap, driveHomeLine } from "../../../../lib/scheduleTile";
import Svg, { Path } from "react-native-svg";
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
  tint,
  type,
} from "../../../../ui/theme";

/**
 * Today (spec 5.1): your day stop by stop, from the jobs on this phone. Stops are in route
 * order with drive estimates from the shared routing rules; the server's drive times, the
 * weather and On My Way come with the full route (S8). The sync bar stays pinned under the bar,
 * so the first stop's buttons are in view at launch (owner, 2026-10-20). It opens with a card for the stop you're on, from the same rule as the current-
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
  const homeLine = driveHomeLine(backLeg, start.label);
  // Do Later and Reorder (owner, 2026-10-20; docs/plans/today-reorder.md): the Schedule's move,
  // from this phone's jobs, saved through the sync layer.
  const reorder = useTodayReorder({ company, stops, techId: shownTech, me, manager, drive });
  const places = useRowPlaces();
  const rowDrag = useRowDrag();
  // Just after a drop the row settles where it was let go, so the list doesn't also glide.
  const [settling, setSettling] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Stable callbacks for the memoized rows, so a render of Today (a swipe on the card, a sync)
  // doesn't redraw every stop (owner, 2026-10-21: Today "freezes").
  const latestReorder = useRef(reorder);
  useEffect(() => {
    latestReorder.current = reorder;
  });
  const [doLaterRow] = useState(
    () => (jobId: string) => latestReorder.current.doLater(jobId, "row"),
  );
  const [undoRow] = useState(() => () => latestReorder.current.undo());
  const shownRows = [...(doneOpen ? doneStops : []), ...rest].map((j) => j.id);
  // The rows in Reorder's edit mode, top first (where a dragged one lands among them).
  const editRows = reorder.editing ? shownRows.filter((id) => reorder.row(id)) : [];

  // The day's stops touch in one block (owner, 2026-10-21; docs/design/
  // 2026-10-21-schedule-tile.md, Today): a hairline above every tile but the block's first, the
  // drive into each stop as a chip on its tile (the first from the start), the drive home last.
  function stopRow(j: JobView, hairline: boolean) {
    const i = stops.indexOf(j);
    // No chip when this stop or the place before it isn't on the map (the drive isn't known).
    const drive = driveChipMinutes(
      summary.legs[i] ?? null,
      propertyLocation(j.property) === null,
      driveFromOffMap(
        i,
        stops.map((s) => propertyLocation(s.property) === null),
        start.at != null,
      ),
    );
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
          drive={drive}
          onLayout={places.onLayout(j.id)}
          onAct={(a) => reorder.act(j.id, a)}
          onDragging={setDragging}
          onDrop={(dy) => {
            setSettling(true);
            setTimeout(() => setSettling(false), 600);
            reorder.drop(j.id, places.landsBefore(j.id, dy, shownRows));
          }}
          index={editRows.indexOf(j.id)}
          rowDrag={rowDrag}
          onSlots={() => rowDrag.slots.set(places.slots(editRows))}
          glide={!settling}
        />
      );
    }
    return (
      <View key={j.id}>
        {hairline ? <Hairline /> : null}
        <Stop
          job={j}
          n={i + 1}
          drive={drive}
          next={j.id === nowId}
          timeZone={tz}
          day={today}
          action={mine && asked?.jobId === j.id ? asked : null}
          mine={mine}
          onMessage={onMessage}
          onDirections={onDirections}
          canLater={Boolean(info?.canLater)}
          onDoLater={doLaterRow}
          undoText={reorder.undoText(j.id, "row")}
          onUndo={undoRow}
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
      {/* No page-wide swipe between techs' days: Whose Day is the way (owner, 2026-10-21:
          Today had "too many gestures"). */}
      <>
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
            {reorder.editing ? (
              // Reorder's rows are cards of their own, so a dragged one lifts clear of the rest.
              <>
                {doneOpen || (asked && doneStops.some((j) => j.id === asked.jobId))
                  ? doneStops.map((j) => stopRow(j, false))
                  : null}
                {rest.map((j) => stopRow(j, false))}
                {homeLine ? <DriveHome text={homeLine} /> : null}
              </>
            ) : (
              <View
                testID="today-stops"
                style={[styles.block, { backgroundColor: color.surface }, cardShadow()]}
              >
                {doneStops.length ? (
                  <Pressable
                    testID="today-done"
                    accessibilityRole="button"
                    accessibilityLabel={`${doneStops.length} done`}
                    accessibilityState={{ expanded: doneOpen }}
                    onPress={() => setDoneOpen(!doneOpen)}
                    style={({ pressed }) => [styles.doneRow, pressed && { opacity: 0.7 }]}
                  >
                    <View style={styles.doneCheck}>
                      <WebIcon name="check" size={18} color={color.pass} strokeWidth={3} />
                    </View>
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
                ) : null}
                {doneOpen || (asked && doneStops.some((j) => j.id === asked.jobId))
                  ? doneStops.map((j) => stopRow(j, true))
                  : null}
                {rest.map((j, k) => stopRow(j, k > 0 || doneStops.length > 0))}
                {homeLine ? (
                  <>
                    <Hairline />
                    <DriveHome text={homeLine} />
                  </>
                ) : null}
              </View>
            )}
          </View>
        )}
      </>
    </Screen>
  );
}

/** The hairline between tiles in the day's block, from after the stop number. */
function Hairline() {
  return <View style={[styles.hairline, { backgroundColor: color.separator }]} />;
}

const HOUSE_FILL =
  "M11.3 3.3a1 1 0 0 1 1.4 0l8 7.2a.8.8 0 0 1-.5 1.4H19v7.6a1 1 0 0 1-1 1h-3.5v-5.5h-5v5.5H6a1 1 0 0 1-1-1v-7.6H3.8a.8.8 0 0 1-.5-1.4z";

/** The block's last line: a house and "35 min back to the shop" (or "back home"). */
function DriveHome({ text }: { text: string }) {
  return (
    <View style={styles.home} accessible accessibilityLabel={text}>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill={color.textMuted}>
        <Path d={HOUSE_FILL} />
      </Svg>
      <Text
        style={[type.footnote, { color: color.textMuted, flexShrink: 1 }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {text}
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
const Stop = memo(function Stop({
  job,
  n,
  drive,
  next,
  timeZone,
  day,
  action,
  mine,
  onDirections,
  onMessage,
  canLater,
  onDoLater,
  undoText,
  onUndo,
}: {
  job: JobView;
  n: number;
  /** The stop on Today's card: tinted and marked Now, and closed, since the card shows it. */
  next: boolean;
  /** The drive into it, as a chip at line 1's end; null when it isn't known. */
  drive: number | null;
  timeZone: string;
  day: string;
  /** Your own day: Message can fill in On My Way. */
  mine: boolean;
  onMessage: (job: JobView) => void;
  onDirections: (job: JobView) => void;
  /** The notification asked to do something on this stop: it opens and does it. */
  action: { action: StopAction; nonce: number } | null;
  /** This stop can move: Do Later (docs/plans/today-reorder.md). */
  canLater: boolean;
  onDoLater: (jobId: string) => void;
  /** "Moved." for 5 seconds after its Do Later, with Undo. */
  undoText: string | null;
  onUndo: () => void;
}) {
  const done = stopDone(job, day);
  const doLater = canLater ? () => onDoLater(job.id) : null;
  const routing = useRoutingOn();
  const [opened, setExpanded] = useState(false);
  // TalkBack's Mark Complete action: opens the row and presses its Mark Complete (same checks
  // and questions as the button).
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
  const status = job.status !== "scheduled" && !next;
  const pills = next || status || !!lock;
  const note = (!done && job.property?.access_notes?.trim()) || null;
  const name = job.customer?.name ?? "Customer";
  const phone = job.customer?.phone;
  const call = phone ? () => void Linking.openURL(`tel:${phone}`) : null;
  const directions = job.property ? () => onDirections(job) : null;
  const complete = done ? null : () => setCompleteAsked((n) => n + 1);
  // No swipe actions on the row (owner, 2026-10-21: Today had "too many gestures"): the open
  // row's buttons and address are the way, and TalkBack gets the same actions.
  const rowActions = [
    complete ? { name: "complete", label: "Mark Complete", run: complete } : null,
    call ? { name: "call", label: "Call", run: call } : null,
    directions ? { name: "directions", label: "Directions", run: directions } : null,
    doLater ? { name: "doLater", label: "Do Later", run: doLater } : null,
  ].filter((a): a is { name: string; label: string; run: () => void } => a !== null);
  return (
    <View
      accessibilityLabel={`Stop ${n}: ${name}`}
      accessibilityActions={rowActions.map((a) => ({ name: a.name, label: a.label }))}
      onAccessibilityAction={(e) =>
        rowActions.find((a) => a.name === e.nativeEvent.actionName)?.run()
      }
      // A tile in the day's block. The stop you're on is tinted (link at about 8%), not
      // ringed: touching tiles can't each have a ring.
      style={next ? { backgroundColor: tint(color.link, 0.08) } : undefined}
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
        </View>
        {/* Only the drive chip and the chevron at line 1's end; the pills are on line 2. */}
        {drive != null ? (
          <View style={done && { opacity: 0.7 }}>
            <DriveChip minutes={drive} />
          </View>
        ) : null}
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
      {/* Line 2: the pills that sat at line 1's end (Now, the status, the lock), then the gate
          code, which gate, dogs: open or closed (owner, 2026-10-20), one line closed. A tile
          with neither stays one line. */}
      {pills || note ? (
        <View style={[styles.line2, done && { opacity: 0.7 }]}>
          {pills ? (
            <View style={styles.pills}>
              {next ? <Pill label="Now" color={color.water} /> : null}
              {/* Most stops are scheduled; the chip shows other states. The Now row leaves it to
                  the card, which already says it (2026-10-20). */}
              {status ? <StatusChip status={job.status} /> : null}
              {lock ? <LockTag lock={lock} /> : null}
            </View>
          ) : null}
          {note ? (
            <View accessible accessibilityLabel={`Access: ${note}`} style={styles.access}>
              <View style={styles.accessIcon}>
                <WebIcon name="key" size={18} color={color.warning} />
              </View>
              <Text
                numberOfLines={expanded ? undefined : 1}
                style={[type.secondary, face.medium, { flex: 1, color: color.text }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {note}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {/* After Do Later, where its button was: "Moved." and Undo, open or closed. */}
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
  // The day's stops in one block (`.card`), the tiles touching.
  block: { borderRadius: shape.card, overflow: "hidden" },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: space["3"] + 32 + space["2"] },
  home: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: space["3"] + 32 + space["2"],
    paddingRight: space["3"],
    paddingVertical: space["2"],
  },
  // Done stops folded into one row (owner, 2026-10-20), as the website's "N done": the block's
  // first row, the check in the stop number's column.
  doneRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["3"],
    paddingRight: space["4"],
    paddingVertical: space["2"],
  },
  doneCheck: { width: 32, alignItems: "center" },
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
  line2: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["2"],
    marginTop: -space["1"],
    paddingLeft: space["3"] + 32 + space["2"],
    paddingRight: space["3"],
    paddingBottom: space["2"],
  },
  pills: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  access: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  accessIcon: { marginTop: 1 },
});
