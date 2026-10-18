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
} from "@leakbook/core";
import { Suspense } from "react";
import { PhoneIcon } from "@/components/icons";
import { OnMyWay } from "@/components/on-my-way";
import { WeatherBadge } from "@/components/weather-badge";
import { AddressLink, OpenRouteInMaps } from "@/components/open-in-maps";
import { Empty, PageHeader, StatusBadge, cx, iconButtonClass, pillClass } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, mayMakeJobs } from "@/lib/data";
import { getLine } from "@/lib/messages";
import { mapsAppForRequest } from "@/lib/maps";
import { loadRoutes, routeContext, routeKey, shopToday } from "@/server/route-days";
import { NavPlus } from "@/components/nav-bar";
import { ScreenTip } from "@/components/screen-tip";
import { GettingStarted } from "@/components/getting-started";

export const metadata: Metadata = { title: "Today · Tidemark" };

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
    office.isOwner && techs.some((t) => t.user_id === wanted) ? wanted : office.user.id;
  const tech = team.find((t) => t.user_id === techId);
  const route = routes.get(routeKey(techId, ctx.today));
  const jobs = route?.jobs ?? [];
  const next = jobs.find((j) => j.status === "scheduled" || j.status === "in_progress");
  const origin =
    ctx.depot || ctx.depotAddress ? { address: ctx.depotAddress, location: ctx.depot } : null;
  const directions = dayDirections(
    await mapsAppForRequest(),
    origin,
    jobs.map((j) => ({
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
      done: j.status !== "scheduled" && j.status !== "in_progress",
    })),
  );
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  const backLeg = route ? route.summary.driveMin - legs : 0;
  const mine = techId === office.user.id;

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
      <Suspense fallback={null}>
        <ScreenTip screen="today" />
      </Suspense>
      {office.isOwner && techs.length > 1 ? (
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
              const done = j.status !== "scheduled" && j.status !== "in_progress";
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
                  <section
                    aria-label={`Stop ${i + 1}: ${j.customer?.name ?? "Customer"}`}
                    className={cx(
                      "relative card p-3",
                      isNext && "ring-2 ring-link",
                      done && "opacity-70",
                    )}
                    data-testid="today-stop"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        aria-hidden="true"
                        className={cx(
                          "grid size-8 shrink-0 place-items-center rounded-full font-display font-bold",
                          isNext ? "bg-link text-bg" : "bg-bg",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="font-display text-[1.0625rem] font-bold">
                        {j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : ""}
                      </span>
                      {/* Most stops on Today are scheduled; the badge only shows other states, so
                          the call and On My Way buttons fit on this row on phones. */}
                      {j.status !== "scheduled" ? <StatusBadge status={j.status} /> : null}
                      {lock && lock !== "started" ? (
                        <span className="text-[0.8125rem] font-semibold text-text-muted">
                          {LOCK_LABELS[lock]}
                        </span>
                      ) : null}
                      {done ? null : (
                        <span className="relative z-10 ml-auto flex shrink-0 flex-wrap justify-end gap-2">
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
                              isOwner={office.isOwner}
                              jobId={j.id}
                            />
                          ) : null}
                        </span>
                      )}
                    </div>
                    {/* The whole card opens the job; the address and buttons sit above the link. */}
                    <Link
                      href={`/jobs/${j.id}`}
                      className="mt-1 block truncate font-semibold after:absolute after:inset-0 after:content-['']"
                    >
                      {j.customer?.name ?? "Customer"}
                    </Link>
                    {done ? null : (
                      <>
                        <p className="relative z-10 w-fit max-w-full text-[0.9375rem]">
                          <AddressLink address={address} location={propertyLocation(j.property)} />
                        </p>
                        {j.property?.access_notes ? (
                          <p className="mt-1 line-clamp-2 rounded-lg bg-status-warning/10 px-2 py-1 text-[0.9375rem]">
                            {j.property.access_notes}
                          </p>
                        ) : null}
                      </>
                    )}
                  </section>
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
    </>
  );
}
