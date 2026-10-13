import type { Metadata } from "next";
import Link from "next/link";
import {
  LOCK_LABELS,
  addDays,
  formatAddress,
  formatDay,
  formatTime,
  isDateString,
  lockReason,
  minutesLabel,
  propertyLocation,
  routeLink,
  scheduleDays,
  type ScheduleView,
} from "@leakbook/core";
import { RouteBoard, type BoardColumn, type BoardStop } from "@/components/route-board";
import { Notice, PageHeader, StatusBadge, buttonClass, cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import type { JobRow } from "@/lib/data";
import {
  loadRoutes,
  routeContext,
  routeKey,
  unscheduledJobs,
  type DayRoute,
  type RouteContext,
} from "@/server/route-days";

export const metadata: Metadata = { title: "Schedule · Tidemark" };

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
          : null,
  };
}

function column(
  ctx: RouteContext,
  techId: string | null,
  title: string,
  date: string,
  route: DayRoute | undefined,
  unassigned: JobRow[],
): BoardColumn {
  const stops = route
    ? route.jobs.map((j, i) => toStop(j, ctx, route, i))
    : unassigned.map((j) => toStop(j, ctx));
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  const origin =
    ctx.depot || ctx.depotAddress ? { address: ctx.depotAddress, location: ctx.depot } : null;
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
    routeHref: route
      ? routeLink(
          origin,
          stops.map((s) => ({ address: s.address, location: s.location })),
        )
      : null,
    open: date >= ctx.today,
  };
}

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const office = await getOffice();
  const params = await searchParams;
  const ctx = await routeContext(office);
  const view: ScheduleView = params.view === "week" ? "week" : "day";
  const today = ctx.today;
  const date = isDateString(params.date) ? params.date : today;
  const days = scheduleDays(view, date);
  const [{ routes, unassigned, team }, tray] = await Promise.all([
    loadRoutes(office, ctx, days),
    unscheduledJobs(office),
  ]);

  // Every active tech gets a route, plus anyone with work these days, plus Unassigned.
  const techs = team.filter(
    (t) => t.status === "active" || days.some((d) => routes.has(routeKey(t.user_id, d))),
  );
  const anyUnassigned = days.some((d) => unassigned.has(d));
  const columns: BoardColumn[] = [];
  for (const t of techs)
    for (const d of days)
      columns.push(column(ctx, t.user_id, t.name, d, routes.get(routeKey(t.user_id, d)), []));
  if (anyUnassigned)
    for (const d of days)
      columns.push(column(ctx, null, "Unassigned", d, undefined, unassigned.get(d) ?? []));
  const unlocated = columns.some((c) => c.stops.some((s) => !s.location));

  const step = view === "day" ? 1 : 7;
  const href = (d: string, v: ScheduleView = view) => `/schedule?view=${v}&date=${d}`;
  const title =
    view === "day"
      ? formatDay(date, "long")
      : `${formatDay(days[0]!)} – ${formatDay(days[days.length - 1]!)}`;
  const jobsShown = columns.reduce((n, c) => n + c.stops.length, 0);

  return (
    <>
      <PageHeader title="Schedule" subtitle={title} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav
          aria-label="View"
          className="inline-flex rounded-md border border-control-border bg-surface p-1"
        >
          {(["day", "week"] as const).map((v) => (
            <Link
              key={v}
              href={href(date, v)}
              aria-current={v === view ? "page" : undefined}
              className={cx(
                "min-h-11 min-w-20 content-center rounded px-3 text-center font-medium",
                v === view && "bg-text text-bg",
              )}
            >
              {v === "day" ? "Day" : "Week"}
            </Link>
          ))}
        </nav>
        <div className="flex gap-2">
          <Link
            href={href(addDays(date, -step))}
            className={buttonClass("secondary")}
            aria-label={`Previous ${view}`}
          >
            ← Previous
          </Link>
          <Link href={href(today)} className={buttonClass("secondary")}>
            Today
          </Link>
          <Link
            href={href(addDays(date, step))}
            className={buttonClass("secondary")}
            aria-label={`Next ${view}`}
          >
            Next →
          </Link>
        </div>
      </div>

      {!ctx.depot ? (
        <div className="mb-4">
          <Notice tone="warning">
            Routes start and end at the shop, which has no map location yet.{" "}
            {office.isOwner ? (
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
        <p className="mb-4 text-[15px] text-text-muted">
          Pools marked “No map location” aren’t counted in drive times. Open the job and use Mark
          Location Here at the pool
          {office.isOwner ? ", or Find Pool Locations in Settings › Scheduling" : ""}.
        </p>
      ) : null}

      {view === "week" ? (
        <>
          {/* Phones: the week as an agenda, day by day. Moving is done from the day view. */}
          <div className="space-y-5 sm:hidden">
            {days.map((d) => {
              const list = columns
                .filter((c) => c.date === d)
                .flatMap((c) =>
                  c.stops
                    .filter((s) => !s.note?.startsWith("Second tech"))
                    .map((s) => ({ s, tech: c.title })),
                );
              return (
                <section key={d} aria-label={formatDay(d, "long")}>
                  <h2
                    className={cx(
                      "mb-2 font-display text-lg font-bold",
                      d === today && "text-link",
                    )}
                  >
                    <Link href={href(d, "day")} className="underline-offset-4 hover:underline">
                      {formatDay(d, "long")}
                      {d === today ? " · Today" : ""}
                    </Link>
                  </h2>
                  {list.length === 0 ? (
                    <p className="text-[15px] text-text-muted">Nothing scheduled.</p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map(({ s, tech }) => (
                        <li key={s.id}>
                          <Link
                            href={`/jobs/${s.id}`}
                            className="block rounded-md border border-border bg-surface p-2 hover:border-water"
                          >
                            <span className="block font-semibold">
                              {s.time} · {s.number ? `#${s.number}` : "New"}
                            </span>
                            <span className="block text-[15px]">
                              {s.customer}
                              <span className="text-text-muted"> · {tech}</span>
                            </span>
                            <span className="mt-1 block">
                              <StatusBadge status={s.status} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          <div className="hidden sm:block">
            <RouteBoard
              mode="week"
              columns={columns}
              tray={tray.map((j) => ({ ...toStop(j, ctx), kind: j.type }))}
              techs={team
                .filter((t) => t.status === "active")
                .map((t) => ({ id: t.user_id, name: t.name }))}
              today={today}
              weekDays={days.map((d) => [d, formatDay(d)])}
            />
          </div>
        </>
      ) : (
        <RouteBoard
          mode="day"
          columns={columns}
          tray={tray.map((j) => ({ ...toStop(j, ctx), kind: j.type }))}
          techs={team
            .filter((t) => t.status === "active")
            .map((t) => ({ id: t.user_id, name: t.name }))}
          today={today}
        />
      )}
      {jobsShown === 0 ? (
        <p className="mt-4 text-text-muted">
          No jobs scheduled {view === "day" ? "this day" : "this week"}.
        </p>
      ) : null}
    </>
  );
}
