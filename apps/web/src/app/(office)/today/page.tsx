import type { Metadata } from "next";
import Link from "next/link";
import {
  durationLabel,
  formatAddress,
  formatDay,
  formatTime,
  minutesLabel,
  propertyLocation,
  onMyWayVia,
  cleaningCountdown,
  cleaningDueSpoken,
  cleaningKind,
  cleaningShortLabel,
  stopDone,
  todayUndo,
  visitReportMode,
  mapStatus,
  todayHero,
  JOB_TYPE_LABELS,
} from "@leakbook/core";
import { TodayHeroCard, type HeroJob } from "@/components/today-hero";
import { NotOnMapTag } from "@/components/not-on-map";
import { LockTag } from "@/components/lock-tag";
import { lockTag } from "@/lib/day-map";
import { routingConfigured } from "@/server/routing";
import { completeSendPrompt } from "@/lib/next-step";
import { Suspense } from "react";
import { CleaningIcon, PhoneIcon } from "@/components/icons";
import { OnMyWay } from "@/components/on-my-way";
import { TodayComplete } from "@/components/today-complete";
import { TodayStop } from "@/components/today-stop";
import { WeatherBadge } from "@/components/weather-badge";
import { AddressLink } from "@/components/open-in-maps";
import { Empty, PageHeader, StatusBadge, cx, iconButtonClass, pillClass } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import {
  checklistCount,
  getCompany,
  getJob,
  getPlanCleanings,
  visitCleanings,
  mayMakeJobs,
} from "@/lib/data";
import { getLine } from "@/lib/messages";
import { loadRoutes, routeContext, routeKey, shopToday } from "@/server/route-days";
import { NavPlus } from "@/components/nav-bar";
import { ScreenTip } from "@/components/screen-tip";
import { GettingStarted } from "@/components/getting-started";

export const metadata: Metadata = { title: "Today · Sundeck Pro" };

/**
 * A tech's day in the field: the stops in order with the driving between them, directions
 * in the phone's maps app, and a text to the customer when leaving. Owners can look at any
 * tech's day.
 */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const office = await getOffice();
  const canAdd = await mayMakeJobs(office);
  const params = await searchParams;
  // The route context (company settings) and the day's jobs load together.
  const ctxP = routeContext(office);
  const day = shopToday(office);
  const [ctx, { routes, team }, line, company] = await Promise.all([
    ctxP,
    loadRoutes(office, ctxP, [day]),
    getLine(office),
    getCompany(office),
  ]);
  const techs = team.filter(
    (t) => t.status === "active" || routes.has(routeKey(t.user_id, ctx.today)),
  );
  const wanted = typeof params.tech === "string" ? params.tech : office.user.id;
  const techId =
    office.isManager && techs.some((t) => t.user_id === wanted) ? wanted : office.user.id;
  const tech = team.find((t) => t.user_id === techId);
  const route = routes.get(routeKey(techId, ctx.today));
  const jobs = route?.jobs ?? [];
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  const backLeg = route ? route.summary.driveMin - legs : 0;
  const mine = techId === office.user.id;
  const routing = routingConfigured();
  // Completing a visit in an Automatic shop sends its report: ask first (owner, 2026-10-20).
  const reportMode = visitReportMode(company.settings);
  // The plan's cleanings on each visit's checklist, with how they stand against their due date
  // (owner, 2026-10-19; 2026-10-20: what Today shows is what the checklist has).
  const [cleanings, onVisits] = await Promise.all([
    getPlanCleanings(office, [
      ...new Set(jobs.map((j) => j.service_plan_id).filter((id): id is string => !!id)),
    ]).catch(() => []),
    visitCleanings(
      office,
      jobs.map((j) => j.id),
    ).catch(() => new Map<string, { planCleaningId: string }[]>()),
  ]);
  // The card at the top for the stop you're on (owner, 2026-10-20; docs/plans/today-hero.md):
  // the Live Activity's rule, so the phone and the website pick the same stop. A started job's
  // checklist count is read from its rows.
  const counts = new Map(
    await Promise.all(
      jobs
        .filter((j) => j.status === "in_progress")
        .map(async (j) => {
          const detail = await getJob(office, j.id).catch(() => null);
          return [j.id, detail ? checklistCount(detail) : { done: 0, total: 0 }] as const;
        }),
    ),
  );
  const hero = todayHero({
    stops: jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      stop_done_on: j.stop_done_on,
      scheduled_start: j.scheduled_start,
      on_my_way_at: j.on_my_way_at,
      arrive_at: j.arrive_at,
      customer: j.customer?.name ?? "Customer",
      address: j.property?.address_line1 ?? null,
      access: j.property?.access_notes ?? null,
      checklistDone: counts.get(j.id)?.done ?? 0,
      checklistTotal: counts.get(j.id)?.total ?? 0,
    })),
    today: ctx.today,
    timeZone: ctx.timeZone,
  });
  // The stop you're on: the card's (Mark Complete moves it on).
  const next = jobs.find((j) => j.id === hero?.stopId);
  const heroJob = (j: (typeof jobs)[number] | undefined): HeroJob | null => {
    if (!j) return null;
    const i = jobs.indexOf(j);
    return {
      id: j.id,
      typeLabel: JOB_TYPE_LABELS[j.type],
      customer: j.customer?.name ?? "Customer",
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      notOnMap: mapStatus(j.property, routing) === "missing",
      phone: j.customer?.phone ?? null,
      notes:
        [j.customer?.notes, j.property?.notes]
          .map((n) => n?.trim())
          .filter(Boolean)
          .join(" · ") || null,
      textHref: j.customer?.phone
        ? line?.status === "active" && j.customer.id
          ? `/messages/new?customer=${j.customer.id}&job=${j.id}`
          : `sms:${j.customer.phone.replace(/[^\d+]/g, "")}`
        : null,
      driveMin: route?.summary.legs[i] ?? null,
      done: stopDone(j, ctx.today),
      undo: todayUndo(j, ctx.today)?.label ?? null,
      prompt: completeSendPrompt({ jobType: j.type, reportMode, customer: j.customer?.name }),
    };
  };
  const doneJobs = jobs.filter((j) => stopDone(j, ctx.today));
  const dueAt = (j: (typeof jobs)[number]) => {
    const here = new Set((onVisits.get(j.id) ?? []).map((x) => x.planCleaningId));
    return cleanings
      .filter((c) => here.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.type?.name ?? "Cleaning",
        kind: cleaningKind(c.type ?? {}),
        due: cleaningCountdown(c.next_due, j.plan_date ?? ctx.today),
      }));
  };

  const stopRow = (j: (typeof jobs)[number], withLeg: boolean) => {
    const i = jobs.indexOf(j);
    const address = j.property ? formatAddress(j.property) : "";
    const lock = lockTag(j);
    const leg = route!.summary.legs[i] ?? 0;
    const isNext = j.id === next?.id;
    const done = stopDone(j, ctx.today);
    return (
      <li key={j.id}>
        {withLeg ? (
          <p className="flex items-center gap-2 py-0.5 pl-4 text-[0.9375rem] text-text-muted">
            <span aria-hidden="true" className="h-4 border-l-2 border-dotted border-text-muted" />
            {durationLabel(leg)} {i === 0 ? "from the shop" : "drive"}
            {route!.summary.short[i] ? (
              <span className="font-semibold text-status-warning">
                · {durationLabel(route!.summary.short[i]!)} late
              </span>
            ) : null}
          </p>
        ) : null}
        <TodayStop
          label={`Stop ${i + 1}: ${j.customer?.name ?? "Customer"}`}
          number={i + 1}
          current={isNext}
          // The card above shows the stop you're on: here it's one row, marked Now.
          startOpen={false}
          done={done}
          time={j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : ""}
          name={j.customer?.name ?? "Customer"}
          href={`/jobs/${j.id}`}
          access={j.property?.access_notes ?? null}
          extra={
            <>
              {isNext ? (
                <span className="rounded-full bg-water px-2.5 py-0.5 text-[0.8125rem] font-semibold text-white">
                  Now
                </span>
              ) : null}
              {/* Most stops are scheduled; the badge shows other states. */}
              {/* The Now row leaves its state to the card, so the name has room. */}
              {j.status !== "scheduled" && !isNext ? <StatusBadge status={j.status} /> : null}
              {lock ? <LockTag lock={lock} /> : null}
            </>
          }
        >
          <p className="flex w-fit max-w-full items-center gap-1.5 text-[0.9375rem]">
            <AddressLink address={address} location={propertyLocation(j.property)} />
            {mapStatus(j.property, routing) === "missing" ? <NotOnMapTag /> : null}
          </p>

          {!done && dueAt(j).length ? (
            // Just the icon and how soon (owner, 2026-10-19: "Don't make it too
            // wordy"); read aloud with the cleaning's name.
            <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Cleanings due">
              {dueAt(j).map((c) => (
                <li
                  key={c.id}
                  aria-label={cleaningDueSpoken(c.name, c.due)}
                  className={cx(
                    "inline-flex items-center gap-1.5 text-[0.9375rem] font-medium",
                    c.due.days < 0 ? "text-status-fail" : "text-text-muted",
                  )}
                >
                  <CleaningIcon kind={c.kind} className="size-[1.125rem] shrink-0" />
                  <span aria-hidden="true">{cleaningShortLabel(c.due)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-start gap-2 pt-2">
            {/* Every stop: done for the day without the full process (owner,
                          2026-10-19). */}
            <TodayComplete
              jobId={j.id}
              customer={j.customer?.name ?? "this stop"}
              done={done}
              undo={todayUndo(j, ctx.today)?.label ?? null}
              prompt={completeSendPrompt({
                jobType: j.type,
                reportMode,
                customer: j.customer?.name,
              })}
            />
            {done ? null : (
              <span className="ml-auto flex shrink-0 gap-2">
                {j.customer?.phone ? (
                  <a
                    href={`tel:${j.customer.phone}`}
                    aria-label={`Call ${j.customer.name ?? "the customer"}`}
                    className={iconButtonClass()}
                  >
                    <PhoneIcon />
                  </a>
                ) : null}
                {mine ? (
                  <OnMyWay
                    phone={j.customer?.phone ?? null}
                    customer={j.customer?.name ?? null}
                    tech={office.user.name ?? tech?.name ?? "your tech"}
                    shop={ctx.shopName}
                    driveMin={leg}
                    windowMin={ctx.settings.windowMin}
                    timeZone={ctx.timeZone}
                    className="px-3"
                    via={onMyWayVia(company.settings)}
                    lineActive={line?.status === "active"}
                    isOwner={office.isManager}
                    jobId={j.id}
                  />
                ) : null}
              </span>
            )}
          </div>
        </TodayStop>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={mine ? "Today" : `Today · ${tech?.name ?? "Teammate"}`}
        navAction={canAdd ? <NavPlus href="/jobs/new" label="New Job" /> : undefined}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {formatDay(ctx.today, "long")}
            <Suspense fallback={null}>
              <WeatherBadge zip={ctx.shopZip} />
            </Suspense>
          </span>
        }
      />
      <Suspense fallback={null}>
        <GettingStarted />
      </Suspense>
      {office.isManager && techs.length > 1 ? (
        <nav aria-label="Whose day" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
          {techs.map((t) => (
            <Link
              key={t.user_id}
              href={`/today?tech=${t.user_id}`}
              aria-current={t.user_id === techId ? "page" : undefined}
              className={pillClass(t.user_id === techId)}
            >
              {t.user_id === office.user.id ? "Me" : t.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {jobs.length === 0 ? (
        <Empty>
          Nothing on {mine ? "your" : "this"} route today.{" "}
          <Link href="/schedule" className="text-link underline">
            Open the schedule
          </Link>
          .
        </Empty>
      ) : (
        <>
          <p className="mb-4 text-text-muted" data-testid="today-summary">
            {jobs.length} {jobs.length === 1 ? "stop" : "stops"} ·{" "}
            {durationLabel(route!.summary.driveMin)} driving
            {route!.summary.backMin != null
              ? ` · back by ${minutesLabel(route!.summary.backMin)}`
              : ""}
          </p>
          {hero ? (
            <TodayHeroCard
              hero={hero}
              job={heroJob(next)}
              next={null}
              mine={mine}
              onMyWay={{
                tech: office.user.name ?? tech?.name ?? "your tech",
                shop: ctx.shopName,
                windowMin: ctx.settings.windowMin,
                timeZone: ctx.timeZone,
                via: onMyWayVia(company.settings),
                lineActive: line?.status === "active",
                isOwner: office.isManager,
              }}
            />
          ) : null}
          <ol className="space-y-1">
            {doneJobs.length ? (
              <li>
                <details className="group" data-testid="today-done">
                  <summary className="card flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold text-text-muted">
                    <span aria-hidden="true" className="text-status-pass">
                      ✓
                    </span>
                    {doneJobs.length} done
                    <span
                      aria-hidden="true"
                      className="ml-auto transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                  </summary>
                  <ol className="mt-1 space-y-1">{doneJobs.map((j) => stopRow(j, false))}</ol>
                </details>
              </li>
            ) : null}
            {jobs.filter((j) => !stopDone(j, ctx.today)).map((j) => stopRow(j, true))}
            <li>
              <p className="flex items-center gap-2 py-0.5 pl-4 text-[0.9375rem] text-text-muted">
                <span
                  aria-hidden="true"
                  className="h-4 border-l-2 border-dotted border-text-muted"
                />
                {durationLabel(backLeg)} back to the shop
              </p>
            </li>
          </ol>
        </>
      )}
      {/* After the stops, so the first stop's buttons are on screen at launch (owner,
          2026-10-20). */}
      <div className="mt-6">
        <Suspense fallback={null}>
          <ScreenTip screen="today" />
        </Suspense>
      </div>
    </>
  );
}
