import { LiveRefresh } from "@/components/live-refresh";
import { PillRow } from "@/components/pill-row";
import type { Metadata } from "next";
import Link from "next/link";
import { SegmentedLinks, SwipeHrefs } from "@/components/gestures";
import {
  addDays,
  canMoveJob,
  formatAddress,
  formatDay,
  formatTime,
  addMonths,
  isDateString,
  localDate,
  minutesLabel,
  propertyLocation,
  dayDirections,
  scheduleDays,
  type MapsApp,
  type ScheduleView,
  dateFormat,
  type CleaningKind,
  JOB_TYPE_LABELS,
  mapStatus,
  weekday,
  jobLock,
  asksPlanMove,
  scheduleOrder,
  scheduleBounds,
} from "@leakbook/core";
import { lockTag } from "@/lib/day-map";
import { NotOnMapTag } from "@/components/not-on-map";
import { routingConfigured } from "@/server/routing";
import {
  RouteBoard,
  type BoardColumn,
  type BoardStop,
  type TrayJob,
} from "@/components/route-board";
import { DateJump } from "@/components/date-jump";
import { WeekStrip } from "@/components/week-strip";
import { Notice, PageHeader, buttonClass, cx, pillClass, SEGMENT_TRACK } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { mapsAppForRequest } from "@/lib/maps";
import { mapsConfigured, resolveMapProvider } from "@/lib/map-provider";
import { MapProviderScope } from "@/components/map-provider-scope";
import { mayMakeJobs, visitCleanings, type JobRow } from "@/lib/data";
import { CleaningIcon } from "@/components/icons";
import {
  loadRoutes,
  routeContext,
  routeKey,
  needsScheduling,
  shopToday,
  techStart,
  type DayRoute,
  type RouteContext,
} from "@/server/route-days";
import { NavPlus } from "@/components/nav-bar";
import { scheduleDate } from "@/lib/limits";
import { redirect } from "next/navigation";
import { loadRouteCustomers } from "@/app/actions/service-days";
import { TechDot } from "@/components/tech-dot";
import { ReorderTechs } from "@/components/reorder-techs";

export const metadata: Metadata = { title: "Schedule · Sundeck Pro" };

/**
 * The job's schedule as the job page's Schedule form holds it, so Lock Day and Lock Time from a
 * card save through the same form action (gestures.md section 12). null: no time yet.
 */
function scheduleOf(j: JobRow, timeZone: string): BoardStop["schedule"] {
  if (!j.scheduled_start) return null;
  const parts = dateFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(j.scheduled_start));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    hours: j.scheduled_end
      ? String(
          (new Date(j.scheduled_end).getTime() - new Date(j.scheduled_start).getTime()) / 3_600_000,
        )
      : "2",
    tech: j.assigned_user_id ?? "",
    lock: jobLock(j),
  };
}

function toStop(j: JobRow, ctx: RouteContext, route?: DayRoute, i = 0): BoardStop {
  const onSecond = route && j.assigned_user_id !== route.techId;
  // The kind of visit, or whose stop it is on the second tech's route: a pill on the card.
  const tag = onSecond
    ? `Second tech, with ${j.techName ?? "the main tech"}`
    : j.secondTechName
      ? `With ${j.secondTechName}`
      : JOB_TYPE_LABELS[j.type];
  // Left out of drive times until its address is found (owner, 2026-10-20).
  const notOnMap = mapStatus(j.property, routingConfigured()) === "missing";
  return {
    id: j.id,
    number: j.number ?? null,
    customer: j.customer?.name ?? "Customer",
    sample: j.sample === true,
    address: j.property ? formatAddress(j.property) : "",
    location: propertyLocation(j.property),
    time: j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : null,
    status: j.status,
    lock: lockTag(j),
    draggable: canMoveJob(j.status),
    legMin: route ? (route.summary.legs[i] ?? null) : null,
    shortMin: route ? (route.summary.short[i] ?? 0) : 0,
    tag,
    // The kind of visit, for the stop's menu title and screen readers (it's off the tile:
    // docs/design/2026-10-21-schedule-tile.md).
    visit: JOB_TYPE_LABELS[j.type],
    notOnMap,
    access: j.property?.access_notes?.trim() || null,
    // One line for Needs a Time's compact cards.
    note: tag,
    schedule: scheduleOf(j, ctx.timeZone),
    // A maintenance plan's visit: moving it to another day or tech asks first (owner,
    // 2026-10-20). Only Scheduled visits ask; core decides.
    plan:
      j.service_plan_id && asksPlanMove(j)
        ? { id: j.service_plan_id, status: j.status, moved: !!j.plan_moved }
        : null,
    // As planning reads it, so Optimize shows its new order at once (owner, 2026-10-22).
    planJob: {
      id: j.id,
      status: j.status,
      assigned_user_id: j.assigned_user_id ?? null,
      second_tech_id: j.second_tech_id ?? null,
      scheduled_start: j.scheduled_start ?? null,
      scheduled_end: j.scheduled_end ?? null,
      route_order: j.route_order ?? null,
      arrival_fixed: !!j.arrival_fixed,
      lock_day: !!j.lock_day,
      lock_time: !!j.lock_time,
      service_plan_id: j.service_plan_id ?? null,
      property: j.property
        ? { latitude: j.property.latitude ?? null, longitude: j.property.longitude ?? null }
        : null,
    },
  };
}

/** A job in Needs a Time; a booked one without a tech shows when it's booked. */
function trayStop(j: JobRow, ctx: RouteContext): TrayJob {
  const booked = j.scheduled_start
    ? `No tech yet · booked ${formatDay(localDate(new Date(j.scheduled_start), ctx.timeZone))} at ${formatTime(j.scheduled_start, ctx.timeZone)}`
    : null;
  const stop = toStop(j, ctx);
  return { ...stop, note: [booked, stop.note].filter(Boolean).join(" · ") || null, kind: j.type };
}

function column(
  ctx: RouteContext,
  techId: string,
  title: string,
  color: string,
  date: string,
  route: DayRoute | undefined,
  app: MapsApp,
): BoardColumn {
  const stops = route ? route.jobs.map((j, i) => toStop(j, ctx, route, i)) : [];
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  // The day starts at the tech's home when they start there (never its street in the link:
  // its map point), else at the shop.
  const start = route?.start ?? techStart(ctx, techId);
  const origin =
    start.label === "home"
      ? { address: "", location: start.at }
      : ctx.depot || ctx.depotAddress
        ? { address: ctx.depotAddress, location: ctx.depot }
        : null;
  const directions = route
    ? dayDirections(
        app,
        origin,
        stops.map((s) => ({
          address: s.address,
          location: s.location,
          done: s.status !== "scheduled" && s.status !== "in_progress",
        })),
      )
    : null;
  return {
    key: routeKey(techId, date),
    techId,
    title,
    color,
    date,
    start,
    stops,
    driveMin: route?.summary.driveMin ?? 0,
    backLegMin: route && route.jobs.length ? route.summary.driveMin - legs : null,
    back: route?.summary.backMin != null ? minutesLabel(route.summary.backMin) : null,
    overtimeMin: route?.summary.overtimeMin ?? 0,
    routeHref: directions?.href ?? null,
    routeApp: app,
    open: date >= ctx.today,
  };
}

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const office = await getOffice();
  const canAdd = await mayMakeJobs(office);
  const params = await searchParams;
  const today = shopToday(office);
  // Day, Week and Month. Routes went into Week (owner, 2026-10-20: "it's actually a pretty
  // useless tab. Let's just build that all into Week"); its old links open Week.
  const views = ["day", "week", "month"] as const;
  if (params.view === "routes") {
    const q = new URLSearchParams({ view: "week" });
    if (isDateString(params.date)) q.set("date", params.date);
    if (typeof params.tech === "string") q.set("tech", params.tech);
    redirect(`/schedule?${q}`);
  }
  const viewLinks = (current: string, d: string, t: string) => (
    <SegmentedLinks
      label="View"
      className={cx(SEGMENT_TRACK, "ml-auto")}
      items={views.map((v) => ({
        href: `/schedule?view=${v}&date=${d}&tech=${t}`,
        label: VIEW_NAMES[v],
        active: v === current,
      }))}
    />
  );
  const view: ScheduleView =
    params.view === "week" ? "week" : params.view === "month" ? "month" : "day";
  // A bad date in the link (9999-99-99, Feb 31) shows today, not an error page.
  const date = isDateString(params.date) && scheduleDate(params.date) ? params.date : today;
  const days = scheduleDays(view, date);
  // Settings, routes, and Needs a Time all load at once.
  const ctxP = routeContext(office);
  const [ctx, app, { routes, unassigned, team }, tray, routePlans] = await Promise.all([
    ctxP,
    mapsAppForRequest(),
    loadRoutes(office, ctxP, days),
    // Needs a Time is the office's list: techs don't see it (owner, 2026-10-18).
    office.isManager ? needsScheduling(office) : null,
    // Week's Customers to Add (maintenance plans with no day yet): owners and admins.
    view === "week" && office.isManager ? loadRouteCustomers() : null,
  ]);
  const trayJobs = tray ? tray.map((j) => trayStop(j, ctx)) : null;

  // Every active tech gets a route, plus anyone with work these days. Jobs with no tech are
  // in Needs a Time.
  // A tech limited to their own jobs sees only their own route (and can move jobs only
  // within it).
  // In the shop's saved order (Reorder Techs, owner 2026-10-21); without one, the signed-in
  // person first ("Me"), then A to Z (core scheduleOrder).
  const techs = scheduleOrder(
    team.filter(
      (t) =>
        (ctx.seesAll || t.user_id === office.user.id) &&
        (t.status === "active" || days.some((d) => routes.has(routeKey(t.user_id, d)))),
    ),
    office.user.id,
  );
  // Reorder Techs: owners and admins, with the active techs in the order shown.
  const reorder =
    office.isManager && ctx.seesAll
      ? techs
          .filter((t) => t.status === "active")
          .map((t) => ({ id: t.membership_id, name: t.name, color: t.color }))
      : [];
  // Phones: one tech at a time, picked from chips like Today's (owner: the page shouldn't be
  // long); Everyone shows them all. Desktop always shows everyone (owner, 2026-10-14).
  const wanted = typeof params.tech === "string" ? params.tech : "";
  const tech =
    wanted === "all" && techs.length > 1
      ? "all"
      : techs.some((t) => t.user_id === wanted)
        ? wanted
        : // The first person with work in view (you first), else the first chip.
          (techs.find((t) => days.some((d) => routes.has(routeKey(t.user_id, d))))?.user_id ??
          techs[0]?.user_id ??
          "all");
  const onPhone = (techId: string) => tech === "all" || techId === tech;
  const movers = ctx.seesAll
    ? scheduleOrder(
        team.filter((t) => t.status === "active"),
        office.user.id,
      )
    : team.filter((t) => t.user_id === office.user.id);
  const columns: BoardColumn[] = [];
  for (const t of techs)
    for (const d of days)
      columns.push({
        ...column(ctx, t.user_id, t.name, t.color, d, routes.get(routeKey(t.user_id, d)), app),
        phoneHidden: !onPhone(t.user_id),
      });
  // The plan's cleanings on each visit, on the date they're due (owner, 2026-10-20).
  const due = await visitCleanings(
    office,
    columns.flatMap((c) => c.stops.map((s) => s.id)),
  );
  for (const c of columns) for (const s of c.stops) s.cleanings = due.get(s.id);
  const phoneColumns = columns.filter((c) => !c.phoneHidden);
  const unlocated = columns.some((c) => c.stops.some((s) => !s.location));
  // Day maps, when the shop's maps are set up (owner, 2026-10-20, docs/plans/route-maps.md).
  // Apple Maps once its keys are set, else Mapbox (docs/plans/apple-maps.md).
  const maps = mapsConfigured() ? { company: office.company.id, depot: ctx.depot } : null;
  // Plan Week: owners and admins, for the days of the week still to come.
  const planDates = view === "week" && office.isManager ? days.filter((d) => d >= ctx.today) : [];
  // Needs a Time jobs with nobody on them that Plan Week may place this week.
  const planWaiting = (tray ?? []).filter(
    (j) =>
      !j.assigned_user_id &&
      (!j.scheduled_start ||
        planDates.includes(localDate(new Date(j.scheduled_start), ctx.timeZone))),
  ).length;
  const planTechs = movers.map((t) => ({ id: t.user_id, name: t.name, color: t.color }));
  // Customers to Add: the plans, and the techs (you first, as on the rest of Schedule).
  const plans = routePlans ? { list: routePlans, workDays: ctx.settings.workDays } : null;
  // What the browser needs to show Optimize's and Optimize Week's new order at once: the
  // settings, the shop, and where each tech who starts at home starts (a map point only).
  const preview = {
    timeZone: ctx.timeZone,
    settings: ctx.settings,
    depot: ctx.depot,
    today: ctx.today,
    nowMin: ctx.nowMin,
    // Owners and admins see every day whole, so Optimize may move shared jobs (owner, 2026-10-24).
    partners: office.isManager,
    homes: [
      ...new Map(
        columns
          .filter((c) => c.start.label === "home" && c.start.at)
          .map((c) => [c.techId, { techId: c.techId, at: c.start.at! }]),
      ).values(),
    ],
  };

  const move = (n: number) =>
    view === "month" ? addMonths(date, n) : addDays(date, view === "week" ? 7 * n : n);
  const href = (d: string, v: ScheduleView = view, t: string = tech) =>
    `/schedule?view=${v}&date=${d}&tech=${t}`;
  const title =
    view === "day"
      ? formatDay(date, "long")
      : view === "month"
        ? dateFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${date}T12:00:00Z`))
        : `${formatDay(days[0]!)} – ${formatDay(days[days.length - 1]!)}`;
  const unassignedCount = days.reduce((n, d) => n + (unassigned.get(d)?.length ?? 0), 0);
  const jobsShown = columns.reduce((n, c) => n + c.stops.length, 0) + unassignedCount;
  const jobsOnPhone =
    phoneColumns.reduce((n, c) => n + c.stops.length, 0) + (tech === "all" ? unassignedCount : 0);
  const monthCounts = (cols: BoardColumn[], withUnassigned: boolean) =>
    Object.fromEntries(
      days.map((d) => {
        const stops = cols.filter((c) => c.date === d).flatMap((c) => c.stops);
        const extra = withUnassigned ? (unassigned.get(d)?.length ?? 0) : 0;
        return [
          d,
          {
            jobs: stops.filter((x) => x.tag !== JOB_TYPE_LABELS.maintenance).length + extra,
            cleanings: stops.filter((x) => x.tag === JOB_TYPE_LABELS.maintenance).length,
            due: stops.flatMap((x) => x.cleanings ?? []),
          },
        ];
      }),
    );

  // Previous, the date, next, Day / Week / Month and Reorder Techs. Computers: in the title's
  // row, at its right (owner, 2026-10-22: "Close up all the empty space"); phones: a row of
  // their own under it.
  const controls = (phone: boolean) => (
    <>
      <Link
        href={href(move(-1))}
        className={buttonClass("secondary", "min-w-11 shrink-0 px-3")}
        aria-label={`Previous ${view}`}
      >
        ‹
      </Link>
      <DateJump value={date} view={view} tech={tech} />
      <Link
        href={href(move(1))}
        className={buttonClass("secondary", "min-w-11 shrink-0 px-3")}
        aria-label={`Next ${view}`}
      >
        ›
      </Link>
      {viewLinks(view, date, tech)}
      {/* Computers: Reorder Techs beside Day / Week / Month, not in a row of its own
              (owner, 2026-10-21). Phones have it at the end of Whose schedule. */}
      {reorder.length > 1 && !phone ? <ReorderTechs techs={reorder} /> : null}
    </>
  );

  // Live (owner, 2026-10-22: "desktop Week updates as stops complete"): a job started, done or
  // moved elsewhere shows here within seconds, without a reload.
  const live = scheduleBounds(days, ctx.timeZone);
  return (
    <MapProviderScope provider={resolveMapProvider()}>
      <LiveRefresh from={live.from} to={live.to} />
      <PageHeader
        title="Schedule"
        navAction={canAdd ? <NavPlus href="/jobs/new" label="New Job" /> : undefined}
        actions={<div className="flex flex-wrap items-center gap-2">{controls(false)}</div>}
        actionsClassName="max-sm:hidden"
        subtitle={
          <>
            {title}
            {/* Back to today sits with the date, so the control row stays one line. */}
            {date !== today ? (
              <>
                {" · "}
                <Link
                  href={href(today)}
                  className="-my-3 inline-block py-3 font-semibold text-link underline-offset-4 hover:underline"
                >
                  Today
                </Link>
              </>
            ) : null}
          </>
        }
      />
      {/* Day and Week use the whole window on a computer (the office layout widens <main>). */}
      {view !== "month" ? <span data-wide-page="" hidden /> : null}
      {/* Swipe sideways for the previous or next day, week, or month (owner, 2026-10-20). */}
      <SwipeHrefs page={href(date)} scope="schedule" prev={href(move(-1))} next={href(move(1))}>
        {/* Phones: one row: previous, the date, next, and Day / Week / Month at the far right.
            With large text Day / Week / Month moves to its own row instead of off the screen. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 sm:hidden">{controls(true)}</div>

        {view === "day" ? <WeekStrip date={date} today={today} tech={tech} /> : null}

        {/* Whose schedule: under the days of the week, with Reorder Techs after the last name
            (owners and admins), the whole row scrolling sideways so no name is ever cut off by
            the button (owner, 2026-10-26). */}
        {techs.length > 1 ? (
          <div className="mb-4 sm:hidden">
            <PillRow
              label="Whose schedule"
              className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1"
            >
              {[
                ...techs.map((t) => ({
                  id: t.user_id,
                  name: t.user_id === office.user.id ? "Me" : t.name,
                  color: t.color as string | null,
                })),
                { id: "all", name: "Everyone", color: null },
              ].map((t) => (
                <Link
                  key={t.id}
                  href={href(date, view, t.id)}
                  aria-current={t.id === tech ? "page" : undefined}
                  className={pillClass(t.id === tech, "gap-2")}
                >
                  {t.color ? (
                    <TechDot
                      color={t.color}
                      className={cx(t.id === tech && "ring-2 ring-white/90")}
                    />
                  ) : null}
                  {t.name}
                </Link>
              ))}
              {reorder.length > 1 ? <ReorderTechs techs={reorder} /> : null}
            </PillRow>
          </div>
        ) : null}

        {!ctx.depot && columns.some((c) => c.start.label === "shop") ? (
          <div className="mb-4">
            <Notice tone="warning">
              Routes start and end at the shop, which has no map location yet.{" "}
              {office.isManager ? (
                <Link href="/settings/scheduling" className="font-semibold text-link underline">
                  Set it in Settings › Scheduling
                </Link>
              ) : (
                "An owner can set it in Settings › Scheduling."
              )}
            </Notice>
          </div>
        ) : null}
        {unlocated ? (
          <p className="mb-4 text-[0.9375rem] text-text-muted">
            Stops marked <NotOnMapTag /> aren’t counted in drive times: their address wasn’t found
            on the map. Check the address on the customer’s pool.
          </p>
        ) : null}

        {view === "month" ? (
          <>
            <div className="sm:hidden">
              <MonthCalendar
                days={days}
                month={date.slice(0, 7)}
                today={today}
                counts={monthCounts(phoneColumns, tech === "all")}
                href={(d) => href(d, "day")}
              />
            </div>
            <div className="max-sm:hidden">
              <MonthCalendar
                days={days}
                month={date.slice(0, 7)}
                today={today}
                counts={monthCounts(columns, true)}
                href={(d) => href(d, "day")}
              />
            </div>
          </>
        ) : view === "week" ? (
          <>
            {/* Phones: the week day by day, each tech's day a block of stop tiles that drag as
                on Day (docs/design/2026-10-21-schedule-tile.md). */}
            <div className="sm:hidden">
              <RouteBoard
                mode="week"
                phone
                columns={phoneColumns}
                tray={trayJobs}
                techs={planTechs}
                plans={plans}
                today={today}
                weekDays={days.map((d) => [d, formatDay(d)])}
                planDates={planDates.length ? planDates : null}
                planWaiting={planWaiting}
                preview={preview}
              />
            </div>
            <div className="hidden sm:block">
              <RouteBoard
                mode="week"
                columns={columns}
                tray={trayJobs}
                techs={planTechs}
                plans={plans}
                today={today}
                weekDays={days.map((d) => [d, formatDay(d)])}
                maps={maps}
                workDates={days.filter((d) => ctx.settings.workDays.includes(weekday(d)))}
                planDates={planDates.length ? planDates : null}
                planWaiting={planWaiting}
                preview={preview}
              />
            </div>
          </>
        ) : (
          <RouteBoard
            mode="day"
            columns={columns}
            tray={trayJobs}
            techs={planTechs}
            today={today}
            maps={maps}
            preview={preview}
          />
        )}
        {jobsOnPhone === 0 || jobsShown === 0 ? (
          <p className={cx("mt-4 text-text-muted", jobsShown > 0 && "sm:hidden")}>
            No jobs scheduled{" "}
            {view === "day" ? "this day" : view === "week" ? "this week" : "this month"}.
          </p>
        ) : null}
      </SwipeHrefs>
    </MapProviderScope>
  );
}

/**
 * The month at a glance for the chosen tech (or everyone): each day's jobs and cleanings;
 * a day opens its route.
 */
function MonthCalendar({
  days,
  month,
  today,
  counts,
  href,
}: {
  days: string[];
  month: string;
  today: string;
  counts: Record<
    string,
    { jobs: number; cleanings: number; due?: { kind: CleaningKind; name: string }[] }
  >;
  href: (d: string) => string;
}) {
  return (
    <div className="card p-2">
      <div
        className="grid grid-cols-7 text-center text-[0.8125rem] font-semibold text-text-muted"
        aria-hidden="true"
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const c = counts[d] ?? { jobs: 0, cleanings: 0 };
          const inMonth = d.startsWith(month);
          const label = [
            formatDay(d, "long"),
            c.jobs ? `${c.jobs} ${c.jobs === 1 ? "job" : "jobs"}` : null,
            c.cleanings ? `${c.cleanings} ${c.cleanings === 1 ? "cleaning" : "cleanings"}` : null,
            ...(c.due ?? []).map((x) => `${x.name} due`),
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={d}>
              <Link
                href={href(d)}
                aria-label={label}
                aria-current={d === today ? "date" : undefined}
                className={cx(
                  "flex min-h-16 flex-col items-center rounded-lg p-1 hover:bg-bg",
                  !inMonth && "opacity-40",
                  d === today && "ring-2 ring-link",
                )}
              >
                <span className="font-display text-lg font-bold">{Number(d.slice(8))}</span>
                {c.jobs ? (
                  <span className="text-[0.8125rem] leading-tight font-semibold">
                    {c.jobs} {c.jobs === 1 ? "job" : "jobs"}
                  </span>
                ) : null}
                {c.cleanings ? (
                  <span className="text-[0.8125rem] leading-tight text-text-muted">
                    {c.cleanings} clean
                  </span>
                ) : null}
                {c.due?.length ? (
                  // The filter and salt cell cleanings due that day, as their icons.
                  <span aria-hidden="true" className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {[...new Set(c.due.map((x) => x.kind))].map((k) => (
                      <CleaningIcon key={k} kind={k} className="size-4 text-link" />
                    ))}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const VIEW_NAMES = { day: "Day", week: "Week", month: "Month" } as const;
