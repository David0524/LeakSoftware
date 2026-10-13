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
  routeLink,
} from "@leakbook/core";
import { Suspense } from "react";
import { OnMyWay } from "@/components/on-my-way";
import { WeatherBadge } from "@/components/weather-badge";
import { AddressLink, OpenRouteInMaps } from "@/components/open-in-maps";
import { Card, Empty, PageHeader, StatusBadge, buttonClass, cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { loadRoutes, routeContext, routeKey } from "@/server/route-days";

export const metadata: Metadata = { title: "Today · Tidemark" };

/**
 * A tech's day in the field: the stops in order with the driving between them, directions
 * in the phone's maps app, and a text to the customer when leaving. Owners can look at any
 * tech's day.
 */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const office = await getOffice();
  const params = await searchParams;
  const ctx = await routeContext(office);
  const { routes, team } = await loadRoutes(office, ctx, [ctx.today]);
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
  const whole = routeLink(
    origin,
    jobs.map((j) => ({
      address: j.property ? formatAddress(j.property) : "",
      location: propertyLocation(j.property),
    })),
  );
  const legs = route?.summary.legs.reduce((a, b) => a + b, 0) ?? 0;
  const backLeg = route ? route.summary.driveMin - legs : 0;
  const mine = techId === office.user.id;

  return (
    <>
      <PageHeader
        title={mine ? "Today" : `Today · ${tech?.name ?? "Teammate"}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {formatDay(ctx.today, "long")}
            <Suspense fallback={null}>
              <WeatherBadge zip={ctx.shopZip} />
            </Suspense>
          </span>
        }
        actions={whole ? <OpenRouteInMaps href={whole} /> : null}
      />
      {office.isOwner && techs.length > 1 ? (
        <nav aria-label="Whose day" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
          {techs.map((t) => (
            <Link
              key={t.user_id}
              href={`/today?tech=${t.user_id}`}
              aria-current={t.user_id === techId ? "page" : undefined}
              className={cx(
                "min-h-11 shrink-0 content-center rounded-full border border-control-border px-4 font-medium",
                t.user_id === techId && "bg-text text-bg",
              )}
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
                  <p className="flex items-center gap-2 py-1 pl-5 text-[15px] text-text-muted">
                    <span
                      aria-hidden="true"
                      className="h-4 border-l-2 border-dotted border-text-muted"
                    />
                    {durationLabel(leg)} {i === 0 ? "from the shop" : "drive"}
                    {route!.summary.short[i] ? (
                      <span className="font-semibold text-status-warning">
                        · {durationLabel(route!.summary.short[i]!)} short
                      </span>
                    ) : null}
                  </p>
                  <Card
                    aria-label={`Stop ${i + 1}: ${j.customer?.name ?? "Customer"}`}
                    className={cx("p-4", isNext && "border-2 border-link", done && "opacity-70")}
                    data-testid="today-stop"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={cx(
                          "grid size-9 shrink-0 place-items-center rounded-full font-display font-bold",
                          isNext ? "bg-link text-bg" : "bg-bg",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 font-display text-xl font-bold">
                          {j.scheduled_start ? formatTime(j.scheduled_start, ctx.timeZone) : ""}
                          <StatusBadge status={j.status} />
                          {lock && lock !== "started" ? (
                            <span className="text-[13px] font-semibold text-text-muted">
                              {LOCK_LABELS[lock]}
                            </span>
                          ) : null}
                        </p>
                        <p className="font-semibold">{j.customer?.name ?? "Customer"}</p>
                        <p className="text-[15px]">
                          <AddressLink address={address} location={propertyLocation(j.property)} />
                        </p>
                        {j.property?.access_notes ? (
                          <p className="mt-1 border-l-4 border-status-warning pl-2 text-[15px]">
                            {j.property.access_notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!done && mine ? (
                        <OnMyWay
                          phone={j.customer?.phone ?? null}
                          customer={j.customer?.name ?? null}
                          tech={office.user.name ?? tech?.name ?? "your tech"}
                          shop={ctx.shopName}
                          driveMin={leg}
                          windowMin={ctx.settings.windowMin}
                          timeZone={ctx.timeZone}
                        />
                      ) : null}
                      {j.customer?.phone ? (
                        <a href={`tel:${j.customer.phone}`} className={buttonClass("quiet")}>
                          Call
                        </a>
                      ) : null}
                      <Link href={`/jobs/${j.id}`} className={buttonClass("quiet")}>
                        {j.status === "scheduled" ? "Open Job" : "View Job"}
                      </Link>
                    </div>
                  </Card>
                </li>
              );
            })}
            <li>
              <p className="flex items-center gap-2 py-1 pl-5 text-[15px] text-text-muted">
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
