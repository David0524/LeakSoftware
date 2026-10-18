import type { Metadata } from "next";
import Link from "next/link";
import {
  LOCK_LABELS,
  addDays,
  formatAddress,
  formatDay,
  formatTime,
  addMonths,
  isDateString,
  localDate,
  lockReason,
  minutesLabel,
  propertyLocation,
  dayDirections,
  scheduleDays,
  type MapsApp,
  type ScheduleView,
  dateFormat,
} from "@leakbook/core";
import {
  RouteBoard,
  type BoardColumn,
  type BoardStop,
  type TrayJob,
} from "@/components/route-board";
import { DateJump } from "@/components/date-jump";
import {
  Grouped,
  Notice,
  PageHeader,
  Row,
  StatusBadge,
  buttonClass,
  cx,
  pillClass,
  SEGMENT_TRACK,
  segmentClass,
} from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { mapsAppForRequest } from "@/lib/maps";
import { mayMakeJobs, type JobRow } from "@/lib/data";
import {
  loadRoutes,
  routeContext,
  routeKey,
  needsScheduling,
  shopToday,
  type DayRoute,
  type RouteContext,
} from "@/server/route-days";
import { NavPlus } from "@/components/nav-bar";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";

export const metadata: Metadata = { title: "Schedule · Sundeck Pro" };

function toStop(j: JobRow, ctx: RouteContext, route?: DayRoute, i = 0): BoardStop {
  const lock = lockReason(j);
  const onSecond = route && j.assigned_user_id !== route.techId;
  return {
    id: j.id,
    number: j.number ?? null,
    customer: j.customer?.name ?? "Customer",
    address: j.property ? formatAddress(j.property) : "",
    location: propertyLocation(j.property),
    time: j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : null,
    status: j.status,
    lock: lock && lock !== "started" ? LOCK_LABELS[lock] : null,
    draggable: j.status === "scheduled" || j.status === "unscheduled",
    legMin: route ? (route.summary.legs[i] ?? null) : null,
    shortMin: route ? (route.summary.short[i] ?? 0) : 0,
    note: onSecond
      ? `Second tech, with ${j.techName ?? "the main tech"}`
      : j.secondTechName
        ? `With ${j.secondTechName}`
        : j.type === "repair"
          ? "Repair"
          : j.type === "maintenance"
            ? "Maintenance"
            : null,
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
  date: string,
  route: DayRoute | undefined,
  app: MapsApp,
): BoardColumn {
  const stops = route ? route.jobs.map((j, i) => toStop(j, ctx, route, i)) : [];
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  const origin =
    ctx.depot || ctx.depotAddress ? { address: ctx.depotAddress, location: ctx.depot } : null;
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
    date,
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
  const view: ScheduleView =
    params.view === "week" ? "week" : params.view === "month" ? "month" : "day";
  const today = shopToday(office);
  const date = isDateString(params.date) ? params.date : today;
  const days = scheduleDays(view, date);
  // Settings, routes, and Needs a Time all load at once.
  const ctxP = routeContext(office);
  const [ctx, app, { routes, unassigned, team }, tray] = await Promise.all([
    ctxP,
    mapsAppForRequest(),
    loadRoutes(office, ctxP, days),
    // Needs a Time is the office's list: techs don't see it (owner, 2026-10-18).
    office.isManager ? needsScheduling(office) : null,
  ]);
  const trayJobs = tray ? tray.map((j) => trayStop(j, ctx)) : null;

  // Every active tech gets a route, plus anyone with work these days. Jobs with no tech are
  // in Needs a Time.
  // A tech limited to their own jobs sees only their own route (and can move jobs only
  // within it).
  const techs = team
    .filter(
      (t) =>
        (ctx.seesAll || t.user_id === office.user.id) &&
        (t.status === "active" || days.some((d) => routes.has(routeKey(t.user_id, d)))),
    )
    // The signed-in person first ("Me"), then everyone else.
    .sort((a, b) => Number(b.user_id === office.user.id) - Number(a.user_id === office.user.id));
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
    ? team.filter((t) => t.status === "active")
    : team.filter((t) => t.user_id === office.user.id);
  const columns: BoardColumn[] = [];
  for (const t of techs)
    for (const d of days)
      columns.push({
        ...column(ctx, t.user_id, t.name, d, routes.get(routeKey(t.user_id, d)), app),
        phoneHidden: !onPhone(t.user_id),
      });
  const phoneColumns = columns.filter((c) => !c.phoneHidden);
  const unlocated = columns.some((c) => c.stops.some((s) => !s.location));

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
  const week = scheduleDays("week", date);
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
            jobs: stops.filter((x) => x.note !== "Maintenance").length + extra,
            cleanings: stops.filter((x) => x.note === "Maintenance").length,
          },
        ];
      }),
    );

  return (
    <>
      <PageHeader
        title="Schedule"
        navAction={canAdd ? <NavPlus href="/jobs/new" label="New Job" /> : undefined}
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
      <Suspense fallback={null}>
        <ScreenTip screen="schedule" />
      </Suspense>
      {/* One row: previous, the date, next, and Day / Week / Month at the far right. */}
      <div className="mb-3 flex items-center gap-2">
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
        <nav aria-label="View" className={cx(SEGMENT_TRACK, "ml-auto shrink-0 flex-nowrap")}>
          {(["day", "week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href(date, v)}
              aria-current={v === view ? "page" : undefined}
              className={segmentClass(v === view, "px-3 text-[0.9375rem]")}
            >
              {VIEW_NAMES[v]}
            </Link>
          ))}
        </nav>
      </div>

      {view === "day" ? (
        <nav
          aria-label="Days this week"
          className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1"
        >
          {week.map((d) => {
            const at = new Date(`${d}T12:00:00Z`);
            return (
              <Link
                key={d}
                href={href(d)}
                aria-current={d === date ? "date" : undefined}
                aria-label={formatDay(d, "long")}
                className={cx(
                  "flex min-h-14 min-w-12 flex-1 flex-col items-center justify-center rounded-xl text-[0.8125rem] font-medium",
                  d === date ? "bg-text text-bg" : d === today ? "text-link" : "hover:bg-surface",
                )}
              >
                {dateFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(at)}
                <span className="font-display text-xl font-bold">{at.getUTCDate()}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {/* Whose schedule: under the days of the week. */}
      {techs.length > 1 ? (
        <nav
          aria-label="Whose schedule"
          className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden"
        >
          {[
            ...techs.map((t) => ({
              id: t.user_id,
              name: t.user_id === office.user.id ? "Me" : t.name,
            })),
            { id: "all", name: "Everyone" },
          ].map((t) => (
            <Link
              key={t.id}
              href={href(date, view, t.id)}
              aria-current={t.id === tech ? "page" : undefined}
              className={pillClass(t.id === tech)}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!ctx.depot ? (
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
          Pools marked “No map location” aren’t counted in drive times. Open the job and use Mark
          Location Here at the pool
          {office.isManager ? ", or Find Pool Locations in Settings › Scheduling" : ""}.
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
          {/* Phones: the week as an agenda, day by day. Moving is done from the day view. */}
          <div className="space-y-5 sm:hidden">
            {days.map((d) => {
              const list = phoneColumns
                .filter((c) => c.date === d)
                .flatMap((c) =>
                  c.stops
                    .filter((s) => !s.note?.startsWith("Second tech"))
                    .map((s) => ({ s, tech: c.title })),
                )
                .concat(
                  (tech === "all" ? (unassigned.get(d) ?? []) : []).map((j) => ({
                    s: toStop(j, ctx),
                    tech: "No tech yet",
                  })),
                );
              return (
                <section key={d} aria-label={formatDay(d, "long")}>
                  {/* An empty day is one line: the day, then "Nothing scheduled" beside it. */}
                  <h2
                    className={cx(
                      "flex flex-wrap items-baseline gap-x-2 font-display text-lg font-bold",
                      list.length > 0 && "mb-2",
                      d === today && "text-link",
                    )}
                  >
                    <Link
                      href={href(d, "day")}
                      className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {formatDay(d, "long")}
                      {d === today ? " · Today" : ""}
                    </Link>
                    {list.length === 0 ? (
                      <span className="font-sans text-[0.9375rem] font-normal text-text-muted">
                        Nothing scheduled
                      </span>
                    ) : null}
                  </h2>
                  {list.length === 0 ? null : (
                    <Grouped>
                      {list.map(({ s, tech }) => (
                        <Row
                          key={s.id}
                          href={`/jobs/${s.id}`}
                          label={
                            <span className="font-semibold">
                              {s.time} · {s.number ? `#${s.number}` : "New"}
                            </span>
                          }
                          detail={
                            <>
                              <span className="text-text">{s.customer}</span> · {tech}
                            </>
                          }
                          value={<StatusBadge status={s.status} />}
                        />
                      ))}
                    </Grouped>
                  )}
                </section>
              );
            })}
          </div>
          <div className="hidden sm:block">
            <RouteBoard
              mode="week"
              columns={columns}
              tray={trayJobs}
              techs={movers.map((t) => ({ id: t.user_id, name: t.name }))}
              today={today}
              weekDays={days.map((d) => [d, formatDay(d)])}
            />
          </div>
        </>
      ) : (
        <RouteBoard
          mode="day"
          columns={columns}
          tray={trayJobs}
          techs={movers.map((t) => ({ id: t.user_id, name: t.name }))}
          today={today}
        />
      )}
      {jobsOnPhone === 0 || jobsShown === 0 ? (
        <p className={cx("mt-4 text-text-muted", jobsShown > 0 && "sm:hidden")}>
          No jobs scheduled{" "}
          {view === "day" ? "this day" : view === "week" ? "this week" : "this month"}.
        </p>
      ) : null}
    </>
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
  counts: Record<string, { jobs: number; cleanings: number }>;
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
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const VIEW_NAMES = { day: "Day", week: "Week", month: "Month" } as const;
