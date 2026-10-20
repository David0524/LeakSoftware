import type { Metadata } from "next";
import Link from "next/link";
import {
  LOCK_LABELS,
  durationLabel,
  formatAddress,
  formatDay,
  formatTime,
  lockReason,
  minutesLabel,
  propertyLocation,
  dayDirections,
  onMyWayVia,
  cleaningCountdown,
  cleaningDueSpoken,
  cleaningKind,
  cleaningShortLabel,
  stopDone,
  visitReportMode,
} from "@leakbook/core";
import { completeSendPrompt } from "@/lib/next-step";
import { Suspense } from "react";
import { CleaningIcon, PhoneIcon } from "@/components/icons";
import { OnMyWay } from "@/components/on-my-way";
import { TodayComplete } from "@/components/today-complete";
import { TodayStop } from "@/components/today-stop";
import { WeatherBadge } from "@/components/weather-badge";
import { AddressLink, OpenRouteInMaps } from "@/components/open-in-maps";
import { Empty, PageHeader, StatusBadge, cx, iconButtonClass, pillClass } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getPlanCleanings, visitCleanings, mayMakeJobs } from "@/lib/data";
import { getLine } from "@/lib/messages";
import { mapsAppForRequest } from "@/lib/maps";
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
  // The stop you're on: the first not done today (Mark Complete moves it on).
  const next = jobs.find((j) => !stopDone(j, ctx.today));
  const origin =
    ctx.depot || ctx.depotAddress ? { address: ctx.depotAddress, location: ctx.depot } : null;
  const directions = dayDirections(
    await mapsAppForRequest(),
    origin,
    jobs.map((j) => ({
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      done: stopDone(j, ctx.today),
    })),
  );
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  const backLeg = route ? route.summary.driveMin - legs : 0;
  const mine = techId === office.user.id;
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
        actions={
          directions ? <OpenRouteInMaps href={directions.href} app={directions.app} /> : null
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
          <ol className="space-y-1">
            {jobs.map((j, i) => {
              const address = j.property ? formatAddress(j.property) : "";
              const lock = lockReason(j);
              const leg = route!.summary.legs[i] ?? 0;
              const isNext = j.id === next?.id;
              const done = stopDone(j, ctx.today);
              return (
                <li key={j.id}>
                  <p className="flex items-center gap-2 py-0.5 pl-4 text-[0.9375rem] text-text-muted">
                    <span
                      aria-hidden="true"
                      className="h-4 border-l-2 border-dotted border-text-muted"
                    />
                    {durationLabel(leg)} {i === 0 ? "from the shop" : "drive"}
                    {route!.summary.short[i] ? (
                      <span className="font-semibold text-status-warning">
                        · {durationLabel(route!.summary.short[i]!)} late
                      </span>
                    ) : null}
                  </p>
                  <TodayStop
                    label={`Stop ${i + 1}: ${j.customer?.name ?? "Customer"}`}
                    number={i + 1}
                    current={isNext}
                    done={done}
                    time={j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : ""}
                    name={j.customer?.name ?? "Customer"}
                    href={`/jobs/${j.id}`}
                    access={j.property?.access_notes ?? null}
                    extra={
                      <>
                        {/* Most stops are scheduled; the badge shows other states. */}
                        {j.status !== "scheduled" ? <StatusBadge status={j.status} /> : null}
                        {lock && lock !== "started" ? (
                          <span className="text-[0.8125rem] font-semibold text-text-muted">
                            {LOCK_LABELS[lock]}
                          </span>
                        ) : null}
                      </>
                    }
                  >
                    <p className="w-fit max-w-full text-[0.9375rem]">
                      <AddressLink address={address} location={propertyLocation(j.property)} />
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
                        undoable={j.type !== "maintenance" && j.stop_done_on === ctx.today}
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
            })}
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
