import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  LOCK_LABELS,
  addDays,
  addMonths,
  canMakeJobs,
  canMoveJob,
  dayDirections,
  daySummary,
  formatAddress,
  formatDay,
  formatTime,
  isManagerRole,
  jobMinutes,
  localDate,
  localMinutes,
  minutesLabel,
  moveJobChange,
  planDay,
  propertyLocation,
  scheduleDays,
  seesAllJobs,
  suggestTimes,
  suggestionDates,
  workDay,
  type ScheduleView,
  type SuggestedTime,
} from "@leakbook/core";
import { jobLock, useJobViews, type JobView } from "../../data/jobs";
import { useVisitCleanings } from "../maintenance/Cleanings";
import {
  needsATime,
  planContext,
  routeKey,
  routesFor,
  saveJobChanges,
  useDriveTimes,
  useTeam,
} from "../../data/schedule";
import { getServices } from "../../lib/services";
import { mapsAppFor, openDirections, useDirectionsChoice } from "../../state/directions";
import { useCompany, useSession } from "../../state/session";
import {
  Button,
  FilterPills,
  Group,
  HeaderButton,
  ListRow,
  Notice,
  RoundButton,
  Screen,
  Segmented,
  StatusChip,
  T,
} from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { ScreenTip } from "../../ui/Tip";
import { color, face, minTap, space, type } from "../../ui/theme";
import { DatePicker, MonthCalendar, monthTitle } from "./Calendar";
import { MoveSheet, SuggestSheet, type MoveTarget } from "./MoveSheet";
import { NeedsATime } from "./NeedsATime";
import { RouteCard, type Route, type Stop } from "./RouteCard";
import { SwipeNav } from "../../ui/SwipeNav";
import { WeekStrip } from "./WeekStrip";

const VIEW_NAMES = { day: "Day", week: "Week", month: "Month" } as const;

/**
 * Schedule (spec 5.6; the website's schedule page and route board): Day, Week, or Month. Day
 * shows each person's route with the driving between stops, Plan Route and Move…; Week lists
 * the days; Month counts each day. Planning, moving, and suggestions are worked out on the phone
 * from its own jobs and saved through the sync layer, so they work offline too.
 */
export function ScheduleScreen() {
  const company = useCompany();
  const { membership, user } = useSession();
  const me = user?.id ?? "";
  const role = membership?.role;
  const manager = isManagerRole(role);
  const canAdd = canMakeJobs(role, company.settings);
  const seesAll = seesAllJobs(role, company.settings);
  const ctx = planContext(company);
  const tz = ctx.timeZone;
  const today = ctx.today;
  const jobs = useJobViews(company.id);
  const team = useTeam(company.id);
  // The plan's cleanings on each visit, on the date they're due (owner, 2026-10-20).
  const visitCleanings = useVisitCleanings(company.id);
  const [choice] = useDirectionsChoice();
  const app = mapsAppFor(choice);

  const [view, setView] = useState<ScheduleView>("day");
  const [date, setDate] = useState(today);
  const [wanted, setWanted] = useState<string | null>(null);
  const [goTo, setGoTo] = useState(false);
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [suggesting, setSuggesting] = useState<{
    job: JobView;
    list: SuggestedTime[];
    note?: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const days = scheduleDays(view, date);
  const { routes, unassigned } = routesFor(jobs, days, tz);
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // Every active tech gets a route, plus anyone with work these days; a tech limited to their
  // own jobs sees only their own. Me first.
  const techs = team
    .filter(
      (t) =>
        (seesAll || t.user_id === me) &&
        (t.status === "active" || days.some((d) => routes.has(routeKey(t.user_id, d)))),
    )
    .sort((a, b) => Number(b.user_id === me) - Number(a.user_id === me));
  const tech =
    wanted === "all" && techs.length > 1
      ? "all"
      : wanted && techs.some((t) => t.user_id === wanted)
        ? wanted
        : (techs.find((t) => days.some((d) => routes.has(routeKey(t.user_id, d))))?.user_id ??
          techs[0]?.user_id ??
          "all");
  const shown = techs.filter((t) => tech === "all" || t.user_id === tech);
  const movers = (
    seesAll ? team.filter((t) => t.status === "active") : team.filter((t) => t.user_id === me)
  ).map((t) => ({ id: t.user_id, name: t.name }));

  // Drive times for everything in view (the cache on the server when online).
  const points = [
    ctx.depot,
    ...[...routes.values()].flat().map((j) => propertyLocation(j.property)),
  ];
  const { drive } = useDriveTimes(company.id, points);
  const hours = workDay(ctx.settings);
  const depotAddress = formatAddress(company as unknown as Parameters<typeof formatAddress>[0]);

  const toStop = (
    j: JobView,
    techId: string | null,
    legMin: number | null,
    shortMin: number,
  ): Stop => {
    const lock = jobLock(j);
    const onSecond = techId && j.assigned_user_id !== techId;
    const name = (id: string | null | undefined) => team.find((t) => t.user_id === id)?.name;
    return {
      id: j.id,
      number: j.number ?? null,
      customer: j.customer?.name ?? "Customer",
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      time: j.scheduled_start ? formatTime(j.scheduled_start, tz) : null,
      status: j.status,
      lock: lock && lock !== "started" ? LOCK_LABELS[lock] : null,
      movable: canMoveJob(j.status),
      legMin,
      shortMin,
      note: onSecond
        ? `Second tech, with ${name(j.assigned_user_id) ?? "the main tech"}`
        : j.second_tech_id
          ? `With ${name(j.second_tech_id) ?? "the second tech"}`
          : j.type === "repair"
            ? "Repair"
            : j.type === "maintenance"
              ? "Maintenance"
              : j.type === "inspection"
                ? "Pool inspection"
                : null,
      cleanings: visitCleanings.get(j.id),
    };
  };

  const routeFor = (techId: string, title: string, d: string): Route => {
    const list = routes.get(routeKey(techId, d)) ?? [];
    const summary = daySummary(
      list.map((j) => ({
        id: j.id,
        location: propertyLocation(j.property),
        startMin: j.scheduled_start ? localMinutes(j.scheduled_start, tz) : null,
        endMin: j.scheduled_end ? localMinutes(j.scheduled_end, tz) : null,
      })),
      ctx.depot,
      hours,
      drive,
    );
    const legs = summary.legs.reduce((a, b) => a + b, 0);
    return {
      key: routeKey(techId, d),
      techId,
      title,
      date: d,
      stops: list.map((j, i) => toStop(j, techId, summary.legs[i] ?? null, summary.short[i] ?? 0)),
      driveMin: summary.driveMin,
      backLegMin: list.length ? summary.driveMin - legs : null,
      back: summary.backMin != null ? minutesLabel(summary.backMin) : null,
      overtimeMin: summary.overtimeMin,
      open: d >= today,
    };
  };

  const tray = manager ? needsATime(jobs, today, tz) : null;
  const trayStops = (tray ?? []).map((j) => {
    const booked = j.scheduled_start
      ? `No tech yet · booked ${formatDay(localDate(new Date(j.scheduled_start), tz))} at ${formatTime(j.scheduled_start, tz)}`
      : null;
    const s = toStop(j, null, null, 0);
    return { ...s, note: [booked, s.note].filter(Boolean).join(" · ") || null };
  });

  const shownRoutes = view === "day" ? shown.map((t) => routeFor(t.user_id, t.name, date)) : [];
  const unlocated = days.some((d) =>
    shown.some((t) =>
      (routes.get(routeKey(t.user_id, d)) ?? []).some((j) => !propertyLocation(j.property)),
    ),
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** A tech's day, in route order, as planning reads it. */
  function dayJobsOf(techId: string, d: string) {
    return (routesFor(jobs, [d], tz).routes.get(routeKey(techId, d)) ?? []).map((j) => ({
      ...j,
      property: j.property ?? null,
    }));
  }

  function save(change: {
    updates: Parameters<typeof saveJobChanges>[1];
    message?: string;
    error?: string;
  }) {
    if (change.error) {
      setResult({ error: change.error });
      return;
    }
    try {
      saveJobChanges(company.id, change.updates);
      haptics.success();
      setResult({ message: change.message });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  function plan(r: Route) {
    save(planDay(ctx, r.techId, r.date, dayJobsOf(r.techId, r.date), drive));
  }

  function moveTo(jobId: string, techId: string | null, d: string | null, index: number) {
    const job = byId.get(jobId);
    if (!job) return;
    const fromDate = job.scheduled_start ? localDate(new Date(job.scheduled_start), tz) : null;
    save(
      moveJobChange(
        ctx,
        {
          job: { ...job, property: job.property ?? null },
          tech: techId,
          date: d,
          index,
          targetDay: techId && d ? dayJobsOf(techId, d) : [],
          fromDay:
            job.assigned_user_id && fromDate ? dayJobsOf(job.assigned_user_id, fromDate) : [],
          seesAll,
          userId: me,
        },
        drive,
      ),
    );
  }

  function openMove(s: Stop) {
    const j = byId.get(s.id);
    if (!j) return;
    setMoving({
      id: j.id,
      customer: s.customer,
      address: s.address,
      from:
        j.scheduled_start && j.status !== "unscheduled"
          ? { tech: j.assigned_user_id ?? null, date: localDate(new Date(j.scheduled_start), tz) }
          : null,
    });
  }

  function suggest(s: Stop) {
    const j = byId.get(s.id);
    if (!j) return;
    const dates = suggestionDates(ctx);
    if (dates.length === 0) {
      setResult({ error: "No working days are set (Settings › Scheduling)." });
      return;
    }
    const { routes: ahead } = routesFor(jobs, dates, tz);
    const people = team.filter((t) => t.status === "active" && (seesAll || t.user_id === me));
    const found = suggestTimes(
      ctx,
      {
        id: j.id,
        location: propertyLocation(j.property),
        durationMin: jobMinutes({ ...j, property: j.property ?? null }, ctx.settings),
      },
      dates.flatMap((d) =>
        people.map((t) => ({
          techId: t.user_id,
          techName: t.name,
          date: d,
          jobs: (ahead.get(routeKey(t.user_id, d)) ?? []).map((x) => ({
            ...x,
            property: x.property ?? null,
            label: x.customer?.name ?? "the job before",
          })),
        })),
      ),
      drive,
    );
    setSuggesting({ job: j, list: found.suggestions, note: found.note });
  }

  async function refresh() {
    setRefreshing(true);
    haptics.light();
    await getServices().sync.syncNow();
    setRefreshing(false);
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  const move = (n: number) =>
    view === "month" ? addMonths(date, n) : addDays(date, view === "week" ? 7 * n : n);
  const title =
    view === "day"
      ? formatDay(date, "long")
      : view === "month"
        ? monthTitle(date)
        : `${formatDay(days[0]!)} – ${formatDay(days[days.length - 1]!)}`;

  const weekList = (d: string) =>
    shown
      .flatMap((t) =>
        (routes.get(routeKey(t.user_id, d)) ?? [])
          .filter((j) => j.assigned_user_id === t.user_id)
          .map((j) => ({ j, tech: t.name })),
      )
      .concat(
        tech === "all" ? (unassigned.get(d) ?? []).map((j) => ({ j, tech: "No tech yet" })) : [],
      );

  const monthCounts = Object.fromEntries(
    days.map((d) => {
      const list = shown.flatMap((t) =>
        (routes.get(routeKey(t.user_id, d)) ?? []).filter((j) => j.assigned_user_id === t.user_id),
      );
      const extra = tech === "all" ? (unassigned.get(d)?.length ?? 0) : 0;
      return [
        d,
        {
          jobs: list.filter((j) => j.type !== "maintenance").length + extra,
          cleanings: list.filter((j) => j.type === "maintenance").length,
          due: list.flatMap((j) => visitCleanings.get(j.id) ?? []),
        },
      ];
    }),
  );
  const inView =
    view === "day"
      ? shownRoutes.reduce((n, r) => n + r.stops.length, 0)
      : days.reduce((n, d) => n + weekList(d).length, 0);

  return (
    <>
      <Screen
        title="Schedule"
        subtitle={
          <Text style={[type.body, { color: color.textMuted }]}>
            {title}
            {date !== today ? (
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
            ) : null}
          </Text>
        }
        headerRight={
          canAdd
            ? () => (
                <HeaderButton title="New Job" icon="add" onPress={() => router.push("/jobs/new")} />
              )
            : undefined
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <ScreenTip screen="schedule" />
        <View style={styles.controls}>
          <RoundButton icon="back" label={`Previous ${view}`} onPress={() => setDate(move(-1))} />
          <RoundButton icon="calendar" label="Go to Date" onPress={() => setGoTo(true)} />
          <RoundButton icon="forward" label={`Next ${view}`} onPress={() => setDate(move(1))} />
          <View style={{ marginLeft: "auto" }}>
            <Segmented
              fill={false}
              accessibilityLabel="View"
              options={(["day", "week", "month"] as const).map((v) => ({
                value: v,
                label: VIEW_NAMES[v],
              }))}
              value={view}
              onChange={setView}
            />
          </View>
        </View>

        {view === "day" ? <WeekStrip date={date} today={today} onChange={setDate} /> : null}

        {techs.length > 1 ? (
          <FilterPills
            label="Whose schedule"
            options={[
              ...techs.map((t) => ({ value: t.user_id, label: t.user_id === me ? "Me" : t.name })),
              { value: "all", label: "Everyone" },
            ]}
            value={tech}
            onChange={setWanted}
          />
        ) : null}

        {!ctx.depot ? (
          <Notice tone="warning">
            <T style={{ flex: 1 }}>
              Routes start and end at the shop, which has no map location yet.{" "}
              {manager ? (
                <Text
                  accessibilityRole="link"
                  onPress={() => router.push("/settings/scheduling")}
                  style={[face.semiBold, { color: color.link, textDecorationLine: "underline" }]}
                >
                  Set it in Settings › Scheduling
                </Text>
              ) : (
                "An owner can set it in Settings › Scheduling."
              )}
            </T>
          </Notice>
        ) : null}
        {unlocated ? (
          <T variant="secondary" muted>
            Pools marked “No map location” aren’t counted in drive times: their address wasn’t found
            on the map. Check the address on the customer’s pool.
          </T>
        ) : null}

        {result?.error ? (
          <Notice tone="error">{result.error}</Notice>
        ) : result?.message ? (
          <Notice tone="success">{result.message}</Notice>
        ) : null}

        {/* Swipe sideways for the day, week, or month before or after (owner, 2026-10-19);
            Previous and Next above stay the visible way. */}
        <SwipeNav
          style={styles.pages}
          onPrevious={() => setDate(move(-1))}
          onNext={() => setDate(move(1))}
        >
          {tray && view !== "month" ? (
            <NeedsATime jobs={trayStops} onSuggest={suggest} onMove={openMove} />
          ) : null}

          {view === "day"
            ? shownRoutes.map((r) => {
                const directions = r.stops.length
                  ? dayDirections(
                      app,
                      ctx.depot || depotAddress
                        ? { address: depotAddress, location: ctx.depot }
                        : null,
                      r.stops.map((s) => ({
                        address: s.address,
                        location: s.location,
                        done: s.status !== "scheduled" && s.status !== "in_progress",
                      })),
                    )
                  : null;
                return (
                  <RouteCard
                    key={r.key}
                    route={r}
                    busy={false}
                    onPlan={() => plan(r)}
                    onMove={openMove}
                    onDirections={(s) =>
                      openDirections({ address: s.address, location: s.location }, choice)
                    }
                    mapsButton={
                      directions ? (
                        <Button
                          kind="secondary"
                          icon="pin"
                          wide
                          title={directions.app === "google" ? "Google Maps" : "Apple Maps"}
                          onPress={() => void Linking.openURL(directions.href)}
                          style={{ paddingHorizontal: 8 }}
                        />
                      ) : null
                    }
                  />
                );
              })
            : null}

          {view === "week"
            ? days.map((d) => {
                const list = weekList(d);
                const isToday = d === today;
                return (
                  <View key={d} style={{ gap: space["2"] }}>
                    <View style={styles.dayHead}>
                      <Text
                        accessibilityRole="button"
                        onPress={() => {
                          setDate(d);
                          setView("day");
                        }}
                        style={[
                          type.subHeading,
                          styles.dayLink,
                          { color: isToday ? color.link : color.text },
                        ]}
                      >
                        {formatDay(d, "long")}
                        {isToday ? " · Today" : ""}
                      </Text>
                      {list.length === 0 ? (
                        <T variant="secondary" muted>
                          Nothing scheduled
                        </T>
                      ) : null}
                    </View>
                    {list.length ? (
                      <Group>
                        {list.map(({ j, tech: name }) => (
                          <ListRow
                            key={j.id}
                            onPress={() => router.push(`/jobs/${j.id}`)}
                            trailing={
                              <StatusChip status={j.status} style={{ alignSelf: "center" }} />
                            }
                          >
                            <T variant="bodyEmphasis">
                              {j.scheduled_start ? formatTime(j.scheduled_start, tz) : ""} ·{" "}
                              {j.number ? `#${j.number}` : "New"}
                            </T>
                            <T variant="secondary" muted numberOfLines={1}>
                              <Text style={{ color: color.text }}>
                                {j.customer?.name ?? "Customer"}
                              </Text>
                              {" · "}
                              {name}
                            </T>
                          </ListRow>
                        ))}
                      </Group>
                    ) : null}
                  </View>
                );
              })
            : null}

          {view === "month" ? (
            <MonthCalendar
              days={days}
              month={date.slice(0, 7)}
              today={today}
              counts={monthCounts}
              onPick={(d) => {
                setDate(d);
                setView("day");
              }}
            />
          ) : null}

          {inView === 0 ? (
            <T muted>
              No jobs scheduled{" "}
              {view === "day" ? "this day" : view === "week" ? "this week" : "this month"}.
            </T>
          ) : null}
        </SwipeNav>
      </Screen>

      <ModalSheet visible={goTo} onClose={() => setGoTo(false)} title="Go to Date">
        <DatePicker
          value={date}
          today={today}
          onChange={(d) => {
            setDate(d);
            setGoTo(false);
          }}
        />
        <Button
          kind="secondary"
          title="Today"
          wide
          onPress={() => {
            setDate(today);
            setGoTo(false);
          }}
        />
      </ModalSheet>

      <MoveSheet
        job={moving}
        techs={movers}
        manager={manager}
        today={today}
        placesFor={(t, d, id) =>
          dayJobsOf(t, d)
            .filter((j) => j.id !== id)
            .map((j) => ({
              customer: j.customer?.name ?? "Customer",
              time: j.scheduled_start ? formatTime(j.scheduled_start, tz) : null,
            }))
        }
        onClose={() => setMoving(null)}
        onMove={(t, d, index) => {
          const id = moving?.id;
          setMoving(null);
          if (id) moveTo(id, t, d, index);
        }}
      />

      <SuggestSheet
        open={suggesting != null}
        title="Suggested Times"
        suggestions={suggesting?.list ?? []}
        note={suggesting?.note}
        onClose={() => setSuggesting(null)}
        onPick={(s) => {
          const id = suggesting?.job.id;
          setSuggesting(null);
          if (id) moveTo(id, s.techId, s.date, s.position);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pages: { gap: space["5"] },
  controls: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  dayHead: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: space["2"],
  },
  dayLink: { minHeight: minTap, textAlignVertical: "center", paddingTop: 8 },
});
