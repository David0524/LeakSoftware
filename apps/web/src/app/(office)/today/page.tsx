import { SamplePill } from "@/components/sample-pill";
import type { Metadata } from "next";
import Link from "next/link";
import {
  formatAddress,
  formatDay,
  formatTime,
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
  jobHasChecklist,
  todayMoves,
  todayStopLock,
  JOB_TYPE_LABELS,
  type HeroStop,
  scheduleOrder,
  jobMinutes,
  techDayProgress,
  lastDoneLine,
  scheduleBounds,
} from "@leakbook/core";
import { TodayHeroCard, type HeroJob } from "@/components/today-hero";
import { TodayDays } from "@/components/today-days";
import { NotOnMapTag } from "@/components/not-on-map";
import { LockTag } from "@/components/lock-tag";
import { dayMap, lockTag, weekdayName } from "@/lib/day-map";
import { mapsConfigured, resolveMapProvider } from "@/lib/map-provider";
import { MapProviderScope } from "@/components/map-provider-scope";
import { TodayMap } from "@/components/today-map";
import { TodayActivity, TodayActivityLoading } from "./today-activity";
import { routingConfigured } from "@/server/routing";
import { completeSendPrompt } from "@/lib/next-step";
import { Suspense } from "react";
import { CleaningIcon, PhoneIcon } from "@/components/icons";
import { OnMyWay } from "@/components/on-my-way";
import { TodayComplete } from "@/components/today-complete";
import { TodayStop } from "@/components/today-stop";
import { HouseFillIcon } from "@/components/icons";
import { driveChipMinutes, driveFromOffMap, driveHomeLine } from "@/lib/schedule-tile";
import {
  DoLaterButton,
  HideWhileReordering,
  ReorderStatus,
  ReorderToggle,
  TodayReorderProvider,
  type StopMoves,
} from "@/components/today-reorder";
import { WeatherBadge } from "@/components/weather-badge";
import { AddressLink } from "@/components/open-in-maps";
import { Empty, StatusBadge, cx, iconButtonClass } from "@/components/ui";
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
import { GettingStarted } from "@/components/getting-started";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = { title: "Today · Sundeck Pro" };

/**
 * A tech's day in the field: the stops in order with the driving between them, directions
 * in the phone's maps app, and a text to the customer when leaving. Owners can look at any
 * tech's day.
 */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const office = await getOffice();
  // Everything the page needs starts at once (gestures.md section 6): the route context
  // (company settings), every tech's jobs today, the texting line, and the company.
  const ctxP = routeContext(office);
  const day = shopToday(office);
  const [params, canAdd, ctx, { routes, team }, line, company] = await Promise.all([
    searchParams,
    mayMakeJobs(office),
    ctxP,
    loadRoutes(office, ctxP, [day]),
    getLine(office),
    getCompany(office),
  ]);
  // Whose Day, in the Schedule's order (core scheduleOrder: the shop's saved order, else Me
  // first, then A to Z).
  const techs = scheduleOrder(
    team.filter((t) => t.status === "active" || routes.has(routeKey(t.user_id, ctx.today))),
    office.user.id,
  );
  const wanted = typeof params.tech === "string" ? params.tech : office.user.id;
  const techId =
    office.isManager && techs.some((t) => t.user_id === wanted) ? wanted : office.user.id;
  // Owners and admins get every tech's day with the page, so Whose Day and a swipe switch in
  // the browser (gestures.md section 4); a tech gets their own.
  const dayIds = office.isManager && techs.length > 1 ? techs.map((t) => t.user_id) : [techId];
  const allJobs = [
    ...new Map(
      dayIds.flatMap((id) => routes.get(routeKey(id, ctx.today))?.jobs ?? []).map((j) => [j.id, j]),
    ).values(),
  ];
  const routing = routingConfigured();
  // Today's Map beside the day on a computer (owner, 2026-10-21): the Schedule's day map.
  const mapCompany = mapsConfigured() ? office.company.id : null;
  // Completing a visit in an Automatic shop sends its report: ask first (owner, 2026-10-20).
  const reportMode = visitReportMode(company.settings);
  // The plan's cleanings on each visit's checklist, with how they stand against their due date
  // (owner, 2026-10-19; 2026-10-20: what Today shows is what the checklist has), and a started
  // job's checklist count for the card, read from its rows: all at once.
  const [cleanings, onVisits, counts] = await Promise.all([
    getPlanCleanings(office, [
      ...new Set(allJobs.map((j) => j.service_plan_id).filter((id): id is string => !!id)),
    ]).catch(() => []),
    visitCleanings(
      office,
      allJobs.map((j) => j.id),
    ).catch(() => new Map<string, { planCleaningId: string }[]>()),
    Promise.all(
      allJobs
        // A repair job has no checklist to count (owner, 2026-10-22).
        .filter((j) => j.status === "in_progress" && jobHasChecklist(j.type))
        .map(async (j) => {
          const detail = await getJob(office, j.id).catch(() => null);
          return [j.id, detail ? checklistCount(detail) : { done: 0, total: 0 }] as const;
        }),
    ).then((rows) => new Map(rows)),
  ]);
  const dueAt = (j: (typeof allJobs)[number]) => {
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

  /** One tech's day: the card, then the stops in order with the driving between them. */
  const dayFor = (dayTech: string) => {
    const tech = team.find((t) => t.user_id === dayTech);
    const route = routes.get(routeKey(dayTech, ctx.today));
    const jobs = route?.jobs ?? [];
    const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
    const backLeg = route ? route.summary.driveMin - legs : 0;
    // Home for someone who starts their day there, else the shop.
    const startLabel = route?.start.label ?? "shop";
    const mine = dayTech === office.user.id;
    // The card at the top for the stop you're on (owner, 2026-10-20; docs/plans/today-hero.md):
    // the Live Activity's rule, so the phone and the website pick the same stop. The card
    // computes it again in the browser to show other stops (gestures.md section 1).
    const stops: HeroStop[] = jobs.map((j) => ({
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
      // The filter and salt cell alerts, as on the stop's row (owner, 2026-10-20).
      cleanings: dueAt(j).map((c) => ({
        name: c.name,
        kind: c.kind,
        days: c.due.days,
        weeks: c.due.weeks,
      })),
    }));
    const hero = todayHero({ stops, today: ctx.today, timeZone: ctx.timeZone });
    // The stop the day is on: the Now row (it follows the day, not the card's browsing).
    const next = jobs.find((j) => j.id === hero?.stopId);
    const heroJob = (j: (typeof jobs)[number]): HeroJob => {
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
        maintenance: j.type === "maintenance",
        undo: todayUndo(j, ctx.today)?.label ?? null,
        prompt: completeSendPrompt({ jobType: j.type, reportMode, customer: j.customer?.name }),
      };
    };
    const doneJobs = jobs.filter((j) => stopDone(j, ctx.today));
    // Changing the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md): techs on
    // their own day, owners and admins on any tech's day they're viewing.
    const canReorder = mine || office.isManager;
    const moveStops = jobs.map((j) => {
      const done = stopDone(j, ctx.today);
      return {
        id: j.id,
        done,
        lock: todayStopLock(j, ctx.timeZone),
        started: !done && j.status === "in_progress",
      };
    });
    const moveable = todayMoves(moveStops);
    const movesFor = (j: (typeof jobs)[number]): StopMoves | undefined => {
      const s = moveStops[jobs.indexOf(j)]!;
      const m = moveable.get(j.id)!;
      return canReorder && !s.done
        ? { jobId: j.id, customer: j.customer?.name ?? "Customer", lock: s.lock, ...m }
        : undefined;
    };
    const homeLine = driveHomeLine(route ? backLeg : null, startLabel);
    const anyMoves = canReorder && [...moveable.values()].some((m) => m.up || m.down);

    // The day's stops touch in one block (owner, 2026-10-21; docs/design/
    // 2026-10-21-schedule-tile.md, Today): a hairline above every tile but the block's first,
    // the drive into each stop as a chip on its tile, and the drive home as the last line.
    const stopRow = (j: (typeof jobs)[number], hairline: boolean) => {
      const i = jobs.indexOf(j);
      const address = j.property ? formatAddress(j.property) : "";
      const lock = lockTag(j);
      const leg = route!.summary.legs[i] ?? 0;
      const isNext = j.id === next?.id;
      const done = stopDone(j, ctx.today);
      const moves = movesFor(j);
      return (
        <li key={j.id} data-move-row={done ? undefined : j.id}>
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
            moves={moves}
            hairline={hairline}
            // The drive in: from the start (shop or home) for the first stop. None when it
            // isn't known (this stop or the place before it not on the map).
            driveMin={driveChipMinutes(
              route!.summary.legs[i] ?? null,
              propertyLocation(j.property) === null,
              driveFromOffMap(
                i,
                jobs.map((x) => propertyLocation(x.property) === null),
                !!route!.start.at,
              ),
            )}
            pills={
              isNext || (j.status !== "scheduled" && !isNext) || lock || j.sample ? (
                <>
                  {j.sample ? <SamplePill /> : null}
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
              ) : null
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
                            2026-10-19). Complete, Do Later and the contact buttons on one
                            line (owner, 2026-10-22). */}
              <TodayComplete
                jobId={j.id}
                customer={j.customer?.name ?? "this stop"}
                done={done}
                maintenance={j.type === "maintenance"}
                undo={todayUndo(j, ctx.today)?.label ?? null}
                prompt={completeSendPrompt({
                  jobType: j.type,
                  reportMode,
                  customer: j.customer?.name,
                })}
                inRow
              />
              {moves ? (
                <DoLaterButton
                  jobId={j.id}
                  customer={j.customer?.name ?? "this stop"}
                  show={moves.later}
                  inRow
                />
              ) : null}
              {done ? null : (
                <span className="ml-auto flex max-w-full min-w-0 gap-2">
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
                      icon
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

    // The day as a map (docs/plans/route-maps.md): the start, then the stops in order, the one
    // you're on marked. A stop done today counts as done, as in the list.
    const mapStops = jobs.map((j) => ({
      id: j.id,
      location: propertyLocation(j.property),
      status: stopDone(j, ctx.today) ? "completed" : j.status,
      time: j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : null,
      customer: j.customer?.name ?? "Customer",
    }));
    const map =
      route && jobs.length
        ? dayMap({
            stops: mapStops,
            depot: route.start.at,
            startLabel: route.start.label,
            date: ctx.today,
            today: ctx.today,
          })
        : null;

    // The owner's Team row (owner, 2026-10-22: techs' progress live): the same ring, the stop
    // they're on, and the last one done with its time.
    const teamDay = techDayProgress(
      jobs.map((j, i) => ({
        customer: j.customer?.name ?? "Customer",
        done: stopDone(j, ctx.today),
        durationMin: jobMinutes(j, ctx.settings),
        driveMin: route?.summary.legs[i] ?? null,
        onSite: j.status === "in_progress",
        doneAt: j.stop_done_at ?? null,
      })),
    );

    return {
      id: dayTech,
      mine,
      team: jobs.length
        ? {
            progress: teamDay.progress,
            line: teamDay.line,
            current: teamDay.current,
            lastDone: teamDay.lastDone
              ? lastDoneLine(
                  teamDay.lastDone.customer,
                  teamDay.lastDone.at ? formatTime(teamDay.lastDone.at, ctx.timeZone) : null,
                )
              : null,
          }
        : undefined,
      label: dayTech === office.user.id ? "Me" : (tech?.name ?? "Teammate"),
      color: tech?.color ?? null,
      title: mine ? "Today" : `Today · ${tech?.name ?? "Teammate"}`,
      map: (
        <TodayMap
          company={mapCompany}
          pins={map?.pins ?? null}
          stops={mapStops}
          missing={map?.missing ?? 0}
          tech={tech?.name ?? office.user.name ?? "Tech"}
          color={tech?.color ?? null}
          day={weekdayName(ctx.today)}
        />
      ),
      content: (
        <>
          {jobs.length === 0 ? (
            <Empty>
              Nothing on {mine ? "your" : "this"} route today.{" "}
              <Link href="/schedule" className="text-link underline">
                Open the schedule
              </Link>
              .
            </Empty>
          ) : (
            <TodayReorderProvider tech={dayTech}>
              {/* No summary line (owner, 2026-10-22: "Get rid of this on all platforms: 0 of 4
                  stops done. 4 stops · 1 hr 37 min driving"); the card says "Stop 1 of 4".
                  Reorder is in the bar at the top right (ReorderToggle). */}
              {anyMoves ? <ReorderToggle /> : null}
              <ReorderStatus />
              {hero ? (
                <HideWhileReordering>
                  <TodayHeroCard
                    stops={stops}
                    jobs={Object.fromEntries(jobs.map((j) => [j.id, heroJob(j)]))}
                    today={ctx.today}
                    timeZone={ctx.timeZone}
                    mine={mine}
                    onMyWay={{
                      tech: office.user.name ?? tech?.name ?? "your tech",
                      shop: ctx.shopName,
                      windowMin: ctx.settings.windowMin,
                      timeZone: ctx.timeZone,
                      via: onMyWayVia(company.settings),
                      lineActive: line?.status === "active",
                    }}
                    laterIds={
                      canReorder
                        ? jobs
                            .filter(
                              (j) => moveable.get(j.id)?.later && !todayStopLock(j, ctx.timeZone),
                            )
                            .map((j) => j.id)
                        : undefined
                    }
                  />
                </HideWhileReordering>
              ) : null}
              <ol className="card overflow-hidden" data-testid="today-stops">
                {doneJobs.length ? (
                  <li>
                    <details className="group" data-testid="today-done">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold text-text-muted">
                        <span aria-hidden="true" className="w-8 text-center text-status-pass">
                          ✓
                        </span>
                        {doneJobs.length} done
                        <span
                          aria-hidden="true"
                          className="mr-2 ml-auto transition-transform group-open:rotate-90"
                        >
                          ›
                        </span>
                      </summary>
                      <ol>{doneJobs.map((j) => stopRow(j, true))}</ol>
                    </details>
                  </li>
                ) : null}
                {jobs
                  .filter((j) => !stopDone(j, ctx.today))
                  .map((j, k) => stopRow(j, k > 0 || doneJobs.length > 0))}
                {homeLine ? (
                  <li className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute top-0 right-0 left-[3.25rem] h-[0.5px] bg-separator"
                    />
                    <p
                      className="flex min-h-11 items-center gap-1.5 py-2 pr-3 pl-[3.25rem] text-[0.8125rem] text-text-muted"
                      data-testid="today-drive-home"
                    >
                      <HouseFillIcon className="size-3.5 shrink-0" />
                      {homeLine}
                    </p>
                  </li>
                ) : null}
              </ol>
            </TodayReorderProvider>
          )}
        </>
      ),
    };
  };

  // Live (owner, 2026-10-22): a stop started or done on a phone shows here within seconds.
  const live = scheduleBounds([ctx.today], ctx.timeZone);
  return (
    <MapProviderScope provider={resolveMapProvider()}>
      <LiveRefresh from={live.from} to={live.to} />
      <TodayDays
        days={dayIds.map(dayFor)}
        initial={techId}
        navAction={canAdd ? <NavPlus href="/jobs/new" label="New Job" /> : undefined}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {formatDay(ctx.today, "long")}
            <Suspense fallback={null}>
              <WeatherBadge zip={ctx.shopZip} />
            </Suspense>
          </span>
        }
        intro={
          <Suspense fallback={null}>
            <GettingStarted />
          </Suspense>
        }
        // Computers: Activity under the map (owner, 2026-10-21). It streams in on its own, so
        // the day never waits for it.
        aside={
          <Suspense fallback={<TodayActivityLoading />}>
            <TodayActivity />
          </Suspense>
        }
      />
    </MapProviderScope>
  );
}
