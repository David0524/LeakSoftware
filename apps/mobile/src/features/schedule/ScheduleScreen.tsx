import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  InteractionManager,
  LayoutAnimation,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  addDays,
  addMonths,
  canMakeJobs,
  canUnschedule,
  mapStatus,
  canMoveJob,
  MAPS_LABELS,
  dayDirections,
  dayMapsLabel,
  daySummary,
  formatAddress,
  formatDay,
  formatTime,
  isManagerRole,
  JOB_LOCK_LABELS,
  JOB_LOCKS,
  jobLock,
  jobMinutes,
  localDate,
  localMinutes,
  moveJobChange,
  planDay,
  propertyLocation,
  scheduleDays,
  seesAllJobs,
  startFor,
  stopDone,
  suggestTimes,
  suggestionDates,
  workDay,
  type ScheduleView,
  type SuggestedTime,
  REORDER_TECHS,
  scheduleOrder,
} from "@leakbook/core";
import { saveTechOrder } from "../../lib/techOrder";
import { stopLockTag, useJobViews, type JobView } from "../../data/jobs";
import { useMemberStarts } from "../../data/memberStarts";
import { useVisitCleanings } from "../maintenance/Cleanings";
import {
  needsATime,
  planContext,
  routeKey,
  routesFor,
  saveJobChanges,
  saveJobLock,
  useDriveTimes,
  useTeam,
} from "../../data/schedule";
import { menuTitle, stopRowActions, toggleLock, type StopActionId } from "../../lib/rowActions";
import { rowGestures, useRowMenu } from "../../ui/RowMenu";
import { getServices } from "../../lib/services";
import { useFirstLoad } from "../../data/hooks";
import { useLocateMissing } from "../../lib/locate";
import { bannerText } from "../../lib/resultBanner";
import { mapsAppFor, openDirections, useDirectionsChoice } from "../../state/directions";
import { useCompany, useSession } from "../../state/session";
import {
  Button,
  FilterPills,
  HeaderButton,
  Notice,
  RoundButton,
  Screen,
  Segmented,
  T,
  useReduceMotion,
} from "../../ui/components";
import { dayMap, weekdayName } from "../../lib/dayMap";
import { useRoutingOn } from "../../lib/routing";
import { buildWeekPlan, planWaitingCount } from "../../lib/weekPlan";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { useResultBanner } from "../../ui/ResultBanner";
import { SkeletonCards } from "../../ui/Skeleton";
import { ScreenTip } from "../../ui/Tip";
import { color, face, minTap, space, type } from "../../ui/theme";
import { DatePicker, MonthCalendar, monthTitle } from "./Calendar";
import { MoveSheet, SuggestSheet, type MoveTarget } from "./MoveSheet";
import { NeedsATime } from "./NeedsATime";
import { DayMap } from "./DayMap";
import { PlanWeek } from "./PlanWeek";
import { ReorderTechs } from "./ReorderTechs";
import { RouteCard, RouteFacts, type Route, type Stop } from "./RouteCard";
import { DragScope, useScheduleDrag } from "./ScheduleDrag";
import { usePlanMove } from "./planMove";
import { useCustomersToAdd } from "./CustomersToAdd";
import { WeekDay } from "./WeekBoard";
import { SwipePager } from "../../ui/SwipeNav";
import { WeekStrip } from "./WeekStrip";

const VIEW_NAMES = { day: "Day", week: "Week", month: "Month" } as const;

/**
 * Schedule (spec 5.6; the website's schedule page and route board): Day, Week, or Month. Day
 * shows each person's route with the driving between stops, Optimize and Move…; Week holds the
 * routes (owner, 2026-10-20; team and week spec section 6: there's no Routes view): every
 * tech's row for each day, Optimize in each day's "⋯", Plan Week, and for owners and admins
 * Needs a Time and Customers to Add as trays above it; Month counts each day. Planning, moving, and suggestions are worked out on the phone
 * from its own jobs and saved through the sync layer, so they work offline too. Stops drag and
 * drop (touch and hold): to a place in a day, another tech's day, a day in the week strip, or
 * Needs a Time, through the same move as Move… (owner, 2026-10-20). What a change did shows in
 * a banner at the top (ui/ResultBanner); planning shows its button's progress first and runs
 * once that frame is drawn, and what's worked out from the jobs is kept between renders, so the
 * screen stays smooth (owner, 2026-10-20).
 */

/** Run heavy planning after the button's progress state is on screen, so a tap never freezes. */
function afterPaint(fn: () => void) {
  requestAnimationFrame(() => {
    void InteractionManager.runAfterInteractions(() => setTimeout(fn, 0));
  });
}

/** Animate the stops into their new order (none with Reduce Motion). */
function animateReorder(reduceMotion: boolean) {
  if (!reduceMotion)
    LayoutAnimation.configureNext(
      LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, "opacity"),
    );
}
export function ScheduleScreen() {
  const company = useCompany();
  const { membership, user } = useSession();
  const me = user?.id ?? "";
  const role = membership?.role;
  const manager = isManagerRole(role);
  const canAdd = canMakeJobs(role, company.settings);
  const seesAll = seesAllJobs(role, company.settings);
  // The shop's planning context, kept between renders; planning reads a fresh one (with now).
  // Where each tech's day starts: the shop, or their home (owner, 2026-10-21).
  const starts = useMemberStarts(company.id);
  const ctx = useMemo(
    () => planContext(company),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planContext reads the starts
    [company, starts],
  );
  const startOf = useCallback(
    (techId: string | null | undefined) => startFor(techId, ctx.starts, ctx.depot),
    [ctx],
  );
  const live = () => planContext(company);
  const routing = useRoutingOn();
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
  const banner = useResultBanner();
  const planMove = usePlanMove({
    companyId: company.id,
    today,
    timeZone: tz,
    team,
    show: banner.show,
  });
  // Customers to Add on Week (owners and admins; team and week spec sections 6 and 8).
  const toAdd = useCustomersToAdd({ company, team, me, show: banner.show });
  const rowMenu = useRowMenu();
  const reduceMotion = useReduceMotion();
  const loading = useFirstLoad(jobs.length > 0);
  /** The route being optimized: its button shows "Optimizing…". */
  const [planning, setPlanning] = useState<string | null>(null);
  const fail = useCallback(
    (error: string) => banner.show({ tone: "error", message: error }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show is stable
    [],
  );
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [suggesting, setSuggesting] = useState<{
    job: JobView;
    list: SuggestedTime[];
    note?: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const days = useMemo(() => scheduleDays(view, date), [view, date]);
  const { routes, unassigned } = useMemo(() => routesFor(jobs, days, tz), [jobs, days, tz]);
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // Every active tech gets a route, plus anyone with work these days; a tech limited to their
  // own jobs sees only their own. In the shop's saved order (Reorder Techs, owner 2026-10-21);
  // without one, Me first, then A to Z (core scheduleOrder).
  const techs = useMemo(
    () =>
      scheduleOrder(
        team.filter(
          (t) =>
            (seesAll || t.user_id === me) &&
            (t.status === "active" || days.some((d) => routes.has(routeKey(t.user_id, d)))),
        ),
        me,
      ),
    [team, seesAll, me, days, routes],
  );
  const tech =
    wanted === "all" && techs.length > 1
      ? "all"
      : wanted && techs.some((t) => t.user_id === wanted)
        ? wanted
        : (techs.find((t) => days.some((d) => routes.has(routeKey(t.user_id, d))))?.user_id ??
          techs[0]?.user_id ??
          "all");
  const shown = useMemo(
    () => techs.filter((t) => tech === "all" || t.user_id === tech),
    [techs, tech],
  );
  const movers = useMemo(
    () =>
      (seesAll
        ? scheduleOrder(
            team.filter((t) => t.status === "active"),
            me,
          )
        : team.filter((t) => t.user_id === me)
      ).map((t) => ({ id: t.user_id, name: t.name, color: t.color })),
    [team, seesAll, me],
  );

  // Drag and drop: the same move as Move… (owner, 2026-10-20). A job from Needs a Time dropped
  // on a day in the week strip joins the tech in view (or yours, when everyone's in view).
  const drag = useScheduleDrag({
    today,
    fallbackTech: tech !== "all" ? tech : movers.some((m) => m.id === me) ? me : null,
    onDrop: (item, plan, zone) => {
      if (plan.kind === "none") return;
      if (plan.kind === "refuse") {
        haptics.light();
        fail(plan.error);
        return;
      }
      if (plan.kind === "tray") {
        moveTo(item.id, null, null, 0);
        return;
      }
      // A customer to add, dropped on a tech's day: that weekday, that tech.
      if (plan.kind === "plan") {
        toAdd.drop(item.id, plan.tech, plan.date);
        return;
      }
      // Dropped on another day in the strip: show that day, where it went.
      if (moveTo(item.id, plan.tech, plan.date, plan.index) && zone?.kind === "day")
        setDate(plan.date);
    },
  });

  // Drive times for everything in view (the cache on the server when online).
  const depotLat = ctx.depot?.lat;
  const depotLng = ctx.depot?.lng;
  const points = useMemo(
    () => [
      depotLat != null && depotLng != null ? { lat: depotLat, lng: depotLng } : null,
      ...starts.map((s) => startOf(s.user_id).at),
      ...[...routes.values()].flat().map((j) => propertyLocation(j.property)),
    ],
    [routes, depotLat, depotLng, starts, startOf],
  );
  const { drive } = useDriveTimes(company.id, points);
  const hours = workDay(ctx.settings);
  const settingsKey = JSON.stringify(ctx.settings);
  const depotAddress = formatAddress(company as unknown as Parameters<typeof formatAddress>[0]);

  const toStop = (
    j: JobView,
    techId: string | null,
    legMin: number | null,
    shortMin: number,
    day: string | null,
  ): Stop => {
    const onSecond = techId && j.assigned_user_id !== techId;
    const name = (id: string | null | undefined) => team.find((t) => t.user_id === id)?.name;
    const tag = onSecond
      ? `Second tech, with ${name(j.assigned_user_id) ?? "the main tech"}`
      : j.second_tech_id
        ? `With ${name(j.second_tech_id) ?? "the second tech"}`
        : j.type === "repair"
          ? "Repair"
          : j.type === "maintenance"
            ? "Maintenance"
            : j.type === "inspection"
              ? "Pool inspection"
              : "Leak detection";
    // Left out of drive times until its address is found (owner, 2026-10-20).
    const notOnMap = mapStatus(j.property, routing) === "missing";
    return {
      id: j.id,
      number: j.number ?? null,
      customer: j.customer?.name ?? "Customer",
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      time: j.scheduled_start ? formatTime(j.scheduled_start, tz) : null,
      status: j.status,
      lock: stopLockTag(j),
      movable: canMoveJob(j.status),
      legMin,
      shortMin,
      // Not found on the map shows as a symbol after the address, not as words (2026-10-20).
      note: tag,
      tag,
      notOnMap,
      access: j.property?.access_notes?.trim() || null,
      done: day ? stopDone(j, day) : false,
      mainTech: j.assigned_user_id ?? null,
      cleanings: visitCleanings.get(j.id),
    };
  };

  const routeFor = (techId: string, title: string, d: string): Route => {
    const list = routes.get(routeKey(techId, d)) ?? [];
    const start = startOf(techId);
    const summary = daySummary(
      list.map((j) => ({
        id: j.id,
        location: propertyLocation(j.property),
        startMin: j.scheduled_start ? localMinutes(j.scheduled_start, tz) : null,
        endMin: j.scheduled_end ? localMinutes(j.scheduled_end, tz) : null,
      })),
      start.at,
      hours,
      drive,
    );
    const legs = summary.legs.reduce((a, b) => a + b, 0);
    return {
      key: routeKey(techId, d),
      techId,
      title,
      color: team.find((t) => t.user_id === techId)?.color ?? null,
      date: d,
      startLabel: start.label,
      stops: list.map((j, i) =>
        toStop(j, techId, summary.legs[i] ?? null, summary.short[i] ?? 0, d),
      ),
      driveMin: summary.driveMin,
      backLegMin: list.length ? summary.driveMin - legs : null,
      overtimeMin: summary.overtimeMin,
      open: d >= today,
    };
  };

  // Worked out once per change to the jobs, the view or the drive times, not on every render
  // (a drag's hover, a sheet opening).
  const tray = useMemo(
    () => (manager ? needsATime(jobs, today, tz) : null),
    [manager, jobs, today, tz],
  );
  const trayStops = useMemo(
    () =>
      (tray ?? []).map((j) => {
        const booked = j.scheduled_start
          ? `No tech yet · booked ${formatDay(localDate(new Date(j.scheduled_start), tz))} at ${formatTime(j.scheduled_start, tz)}`
          : null;
        const s = toStop(j, null, null, 0, null);
        return { ...s, note: [booked, s.note].filter(Boolean).join(" · ") || null };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toStop reads team, routing, cleanings
    [tray, tz, team, routing, visitCleanings],
  );

  const shownRoutes = useMemo(
    () => (view === "day" ? shown.map((t) => routeFor(t.user_id, t.name, date)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeFor reads these; ctx and hours are rebuilt each render
    [
      view,
      shown,
      date,
      routes,
      drive,
      team,
      routing,
      visitCleanings,
      tz,
      today,
      depotLat,
      depotLng,
      settingsKey,
      startOf,
    ],
  );
  // Week: every tech in view's route for each day (team and week spec section 6).
  const weekRoutes = useMemo(
    () =>
      view === "week"
        ? new Map(days.map((d) => [d, shown.map((t) => routeFor(t.user_id, t.name, d))]))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeFor reads these; ctx and hours are rebuilt each render
    [
      view,
      shown,
      days,
      routes,
      drive,
      team,
      routing,
      visitCleanings,
      tz,
      today,
      depotLat,
      depotLng,
      settingsKey,
      startOf,
    ],
  );
  const weekUnassigned = useMemo(
    () =>
      view === "week" && tech === "all"
        ? new Map(
            days.map((d) => [d, (unassigned.get(d) ?? []).map((j) => toStop(j, null, null, 0, d))]),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toStop reads team, routing, cleanings
    [view, tech, days, unassigned, team, routing, visitCleanings],
  );

  // One tech's day: its map, summary and buttons lead, right under the tech chips (owner,
  // 2026-10-20: "uses the maps all the time"), then Needs a Time and the stops.
  const lead =
    view === "day" && shownRoutes.length === 1 && shownRoutes[0]!.stops.length
      ? shownRoutes[0]!
      : null;
  const leadMap = useMemo(() => {
    if (!lead) return null;
    // The start pin: a house labeled Home for someone who starts there.
    const start = startOf(lead.techId);
    return dayMap({
      stops: lead.stops.map((s) => ({ id: s.id, location: s.location, status: s.status })),
      depot: start.at,
      startLabel: start.label,
      date: lead.date,
      today,
    });
  }, [lead, startOf, today]);
  const leadStops = useMemo(
    () => lead?.stops.map((s) => ({ id: s.id, time: s.time, customer: s.customer })) ?? [],
    [lead],
  );

  // Pools in view with an address but no map location are looked up in the background.
  const poolsInView = useMemo(
    () => [
      ...[...routes.values()].flat().map((j) => j.property),
      ...(tray ?? []).map((j) => j.property),
    ],
    [routes, tray],
  );
  useLocateMissing(company.id, poolsInView);

  // Plan Week: owners and admins, for the days of the week still to come.
  // (Weekends and days off are left out when it runs, as on the website.)
  const weekDates = view === "week" && manager ? days.filter((d) => d >= today) : [];
  const weekWaiting = planWaitingCount(tray ?? [], weekDates, tz);

  const unlocated = useMemo(
    () =>
      days.some((d) =>
        shown.some((t) =>
          (routes.get(routeKey(t.user_id, d)) ?? []).some((j) => !propertyLocation(j.property)),
        ),
      ),
    [days, shown, routes],
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

  /** Saves a planned change and shows it in the banner; false when it was refused or failed. */
  function save(change: {
    updates: Parameters<typeof saveJobChanges>[1];
    message?: string;
    detail?: string;
    error?: string;
  }): boolean {
    if (change.error) {
      fail(change.error);
      return false;
    }
    try {
      animateReorder(reduceMotion);
      saveJobChanges(company.id, change.updates);
      if (change.message) {
        // Core gives the short line and its notes apart; older wording is split by bannerText.
        const text = bannerText(change.message);
        banner.show({ tone: "success", ...text, detail: change.detail ?? text.detail });
      } else haptics.success();
      return true;
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /** Optimize: "Optimizing…" first, then the planning once that's on screen. */
  function plan(r: Route) {
    if (planning) return;
    setPlanning(r.key);
    banner.dismiss();
    afterPaint(() => {
      try {
        save(planDay(live(), r.techId, r.date, dayJobsOf(r.techId, r.date), drive));
      } finally {
        setPlanning(null);
      }
    });
  }

  /** Week's "⋯" › Optimize: one tech's route, or every route of the day, saved in one go. */
  function optimizeDay(date: string, list: Route[]) {
    if (planning) return;
    setPlanning(`day:${date}`);
    banner.dismiss();
    afterPaint(() => {
      try {
        const now = live();
        const changes = list.map((r) =>
          planDay(now, r.techId, r.date, dayJobsOf(r.techId, r.date), drive),
        );
        if (changes.length === 1) return void save(changes[0]!);
        const ok = changes.filter((c) => !c.error);
        if (!ok.length) return void fail(changes[0]!.error!);
        save({
          updates: ok.flatMap((c) => c.updates),
          message: `Optimized ${ok.length} ${ok.length === 1 ? "route" : "routes"} for ${formatDay(date, "long")}.`,
        });
      } finally {
        setPlanning(null);
      }
    });
  }

  /** Plan Week, worked out on the phone and saved in one go; its undo rows put it back. */
  function planTheWeek(forTechs: string[], withTray: boolean) {
    const r = buildWeekPlan({
      ctx: live(),
      dates: weekDates,
      techs: forTechs,
      name: (id) => movers.find((m) => m.id === id)?.name ?? "A tech",
      tray: withTray,
      team,
      dayJobs: dayJobsOf,
      waiting: needsATime(jobs, today, tz).map((j) => ({ ...j, property: j.property ?? null })),
      drive,
    });
    if (r.error) return r;
    try {
      animateReorder(reduceMotion);
      if (r.updates.length) saveJobChanges(company.id, r.updates);
      return r;
    } catch (e) {
      return { ...r, error: e instanceof Error ? e.message : String(e), undo: [] };
    }
  }

  function undoTheWeek(rows: Parameters<typeof saveJobChanges>[1]): string | null {
    try {
      saveJobChanges(company.id, rows);
      haptics.light();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** The move's changes (core moveJobChange), worked out but not saved. */
  function moveChange(job: JobView, techId: string | null, d: string | null, index: number) {
    const fromDate = job.scheduled_start ? localDate(new Date(job.scheduled_start), tz) : null;
    return moveJobChange(
      live(),
      {
        job: { ...job, property: job.property ?? null },
        tech: techId,
        date: d,
        index,
        targetDay: techId && d ? dayJobsOf(techId, d) : [],
        fromDay: job.assigned_user_id && fromDate ? dayJobsOf(job.assigned_user_id, fromDate) : [],
        seesAll,
        userId: me,
      },
      drive,
    );
  }

  /**
   * Move a job. A plan's visit going to another day or tech asks first (team and week spec
   * section 5): Change Schedule or Just This Visit. False when it was refused or is asking.
   */
  function moveTo(jobId: string, techId: string | null, d: string | null, index: number) {
    const job = byId.get(jobId);
    if (!job) return false;
    let moved = false;
    planMove.move({
      job,
      to: { tech: techId, date: d },
      move: () => {
        moved = save(moveChange(job, techId, d, index));
      },
      changes: () => {
        animateReorder(reduceMotion);
        return moveChange(job, techId, d, index);
      },
      before: (id) => byId.get(id) as unknown as Record<string, unknown> | undefined,
    });
    return moved;
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
      unschedulable: canUnschedule(j.status),
    });
  }

  // Swipe actions and touch-and-hold menus on stops (gestures spec section 12): Move… and
  // Take Off Schedule are the Move sheet's, the locks are the job page's Lock picker.
  function setLock(s: Stop, next: ReturnType<typeof jobLock>) {
    const j = byId.get(s.id);
    if (!j || next === jobLock(j)) return;
    try {
      saveJobLock(company.id, j.id, next);
      banner.show({
        tone: "success",
        message: `${s.customer}: ${JOB_LOCK_LABELS[next].tag ?? "Not locked"}`,
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }

  function stopGestures(s: Stop, tray = false) {
    const j = byId.get(s.id);
    const lock = j ? jobLock(j) : "none";
    const actions = stopRowActions({
      status: s.status,
      lock,
      scheduled: Boolean(j?.scheduled_start && j.status !== "unscheduled"),
      hasAddress: Boolean(s.address),
      tray,
    });
    const title = menuTitle(s.customer, s.number ? `#${s.number}` : null);
    const run = (id: StopActionId) => {
      if (id === "open") router.push(`/jobs/${s.id}`);
      if (id === "move") openMove(s);
      if (id === "suggest") suggest(s);
      if (id === "directions") openDirections({ address: s.address, location: s.location }, choice);
      if (id === "lockDay") setLock(s, toggleLock(lock, "day"));
      if (id === "lockTime") setLock(s, toggleLock(lock, "time"));
      if (id === "unschedule") moveTo(s.id, null, null, 0);
      if (id === "lock")
        rowMenu.open(
          `Lock ${s.customer}`,
          JOB_LOCKS.map((l) => ({ id: l, label: JOB_LOCK_LABELS[l].segment, checked: l === lock })),
          (l) => setLock(s, l),
        );
    };
    return rowGestures(actions, run, () => rowMenu.open(title, actions.menu, run));
  }

  function suggest(s: Stop) {
    const j = byId.get(s.id);
    if (!j) return;
    const now = live();
    const dates = suggestionDates(now);
    if (dates.length === 0) {
      fail("No working days are set (Settings › Scheduling).");
      return;
    }
    const { routes: ahead } = routesFor(jobs, dates, tz);
    const people = team.filter((t) => t.status === "active" && (seesAll || t.user_id === me));
    const found = suggestTimes(
      now,
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

  const monthCounts = useMemo(
    () =>
      Object.fromEntries(
        days.map((d) => {
          const list = shown.flatMap((t) =>
            (routes.get(routeKey(t.user_id, d)) ?? []).filter(
              (j) => j.assigned_user_id === t.user_id,
            ),
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
      ),
    [days, shown, routes, unassigned, tech, visitCleanings],
  );
  const inView =
    view === "day"
      ? shownRoutes.reduce((n, r) => n + r.stops.length, 0)
      : view === "week"
        ? days.reduce(
            (n, d) =>
              n +
              (weekRoutes?.get(d) ?? []).reduce((m, r) => m + r.stops.length, 0) +
              (weekUnassigned?.get(d)?.length ?? 0),
            0,
          )
        : days.reduce(
            (n, d) => n + (monthCounts[d]?.jobs ?? 0) + (monthCounts[d]?.cleanings ?? 0),
            0,
          );

  /** The day in the phone's maps app, as the secondary button beside Optimize. */
  const mapsButton = (r: Route) => {
    const start = startOf(r.techId);
    const directions = r.stops.length
      ? dayDirections(
          app,
          // From home by its map location only (the street never shows).
          start.label === "home"
            ? { address: "", location: start.at }
            : ctx.depot || depotAddress
              ? { address: depotAddress, location: ctx.depot }
              : null,
          r.stops.map((s) => ({
            address: s.address,
            location: s.location,
            done: s.status !== "scheduled" && s.status !== "in_progress",
          })),
        )
      : null;
    return directions ? (
      <Button
        kind="secondary"
        icon="pin"
        wide
        // "Maps", never the company's name (team and week spec section 4); the whole route in
        // Google Maps, the next stop in Apple Maps, as its spoken name says.
        title={MAPS_LABELS.maps}
        accessibilityLabel={`${dayMapsLabel(directions.app)}, ${r.title}`}
        onPress={() => void Linking.openURL(directions.href)}
        style={{ paddingHorizontal: 8 }}
      />
    ) : null;
  };

  // Day · Week · Month, beside the date controls (team and week spec section 6: Routes is in
  // Week now).
  const viewControl = (
    <Segmented
      accessibilityLabel="View"
      options={(["day", "week", "month"] as const).map((v) => ({ value: v, label: VIEW_NAMES[v] }))}
      value={view}
      onChange={setView}
    />
  );
  const newJob = canAdd
    ? () => <HeaderButton title="New Job" icon="add" onPress={() => router.push("/jobs/new")} />
    : undefined;

  return (
    <DragScope api={drag.api} hover={drag.hover}>
      <Screen
        title="Schedule"
        scrollEnabled={!drag.dragging}
        scrollRef={drag.scrollRef}
        onScrollMetrics={drag.onScrollMetrics}
        overlay={
          <>
            {drag.overlay}
            {banner.element}
          </>
        }
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
        headerRight={newJob}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <ScreenTip screen="schedule" />
        <View style={styles.controls}>
          <RoundButton icon="back" label={`Previous ${view}`} onPress={() => setDate(move(-1))} />
          <RoundButton icon="calendar" label="Go to Date" onPress={() => setGoTo(true)} />
          <RoundButton icon="forward" label={`Next ${view}`} onPress={() => setDate(move(1))} />
          <View style={{ marginLeft: "auto" }}>{viewControl}</View>
        </View>

        {view === "day" ? <WeekStrip date={date} today={today} onChange={setDate} /> : null}

        {techs.length > 1 ? (
          <FilterPills
            label="Whose schedule"
            options={[
              ...techs.map((t) => ({
                value: t.user_id,
                label: t.user_id === me ? "Me" : t.name,
                dot: t.color,
              })),
              { value: "all", label: "Everyone" },
            ]}
            value={tech}
            onChange={setWanted}
          />
        ) : null}
        {/* Reorder Techs: owners and admins, under Whose schedule (the website's place). */}
        {manager && seesAll ? (
          <ReorderTechs
            techs={techs
              .filter((t) => t.status === "active")
              .map((t) => ({ id: t.membership_id, name: t.name, color: t.color }))}
            onSave={(ordered) => {
              try {
                saveTechOrder(getServices().sync, company.id, team, ordered);
                banner.show({ tone: "success", message: REORDER_TECHS.saved });
                return null;
              } catch (e) {
                return e instanceof Error ? e.message : String(e);
              }
            }}
          />
        ) : null}

        {/* Only while someone shown starts at the shop (owner, 2026-10-21), as the website. */}
        {!ctx.depot && shown.some((t) => startOf(t.user_id).label === "shop") ? (
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

        {/* Swipe sideways for the day, week, or month before or after (owner, 2026-10-19), the
            page following the finger (owner, 2026-10-21);
            Previous and Next above stay the visible way. */}
        <SwipePager
          page={`${view}|${date}`}
          style={styles.pages}
          onPrevious={() => setDate(move(-1))}
          onNext={() => setDate(move(1))}
        >
          {lead ? (
            <View style={{ gap: space["2"] }}>
              {leadMap ? (
                <DayMap
                  company={company.id}
                  pins={leadMap.pins}
                  missing={leadMap.missing}
                  stops={leadStops}
                  tech={lead.title}
                  day={weekdayName(lead.date)}
                />
              ) : null}
              <View>
                <RouteFacts
                  route={lead}
                  busy={planning === lead.key}
                  onPlan={() => plan(lead)}
                  mapsButton={mapsButton(lead)}
                />
              </View>
            </View>
          ) : null}

          {tray && view !== "month" ? (
            <NeedsATime
              jobs={trayStops}
              onSuggest={suggest}
              onMove={openMove}
              gesturesFor={(s) => stopGestures(s, true)}
            />
          ) : null}

          {/* Plans without a day, on phones a tray above the board as Needs a Time is. */}
          {manager && view === "week" ? toAdd.tray : null}

          {view === "day"
            ? shownRoutes.map((r) => (
                <RouteCard
                  key={r.key}
                  route={r}
                  busy={planning === r.key}
                  lead={r.key === lead?.key}
                  onPlan={() => plan(r)}
                  onMove={openMove}
                  onDirections={(s) =>
                    openDirections({ address: s.address, location: s.location }, choice)
                  }
                  gesturesFor={(s) => stopGestures(s)}
                  mapsButton={mapsButton(r)}
                />
              ))
            : null}

          {/* Above the week's agenda (the website's phone layout). */}
          {weekDates.length ? (
            <PlanWeek
              techs={movers}
              defaultTech={tech === "all" ? null : tech}
              waiting={weekWaiting}
              onPlan={planTheWeek}
              onUndo={undoTheWeek}
              onResult={banner.show}
            />
          ) : null}

          {weekRoutes
            ? days.map((d) => (
                <WeekDay
                  key={d}
                  date={d}
                  today={today}
                  routes={weekRoutes.get(d) ?? []}
                  unassigned={weekUnassigned?.get(d) ?? []}
                  busy={planning === `day:${d}`}
                  canOptimize={Boolean(seesAll || manager)}
                  onOpenDay={() => {
                    setDate(d);
                    setView("day");
                  }}
                  onOptimize={(list) => optimizeDay(d, list)}
                  gesturesFor={(s) => stopGestures(s)}
                />
              ))
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

          {/* Placeholder cards while the first download fills the phone. */}
          {loading ? <SkeletonCards /> : null}

          {inView === 0 && !loading ? (
            <T muted>
              No jobs scheduled{" "}
              {view === "day" ? "this day" : view === "week" ? "this week" : "this month"}.
            </T>
          ) : null}
        </SwipePager>
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

      {rowMenu.element}
      {planMove.element}
      {manager ? toAdd.sheets : null}
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
    </DragScope>
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
