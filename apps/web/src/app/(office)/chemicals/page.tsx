import type { Metadata } from "next";
import { Suspense } from "react";
import { formatAddress, formatSchedule, readingSummary } from "@leakbook/core";
import { ChemCalculator } from "@/components/chem-calculator";
import { RemoveReading } from "@/components/chem-log";
import { ScreenTip } from "@/components/screen-tip";
import { Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getChemicalPool, getChemicalReadings, getTeam } from "@/lib/data";

export const metadata: Metadata = { title: "Chemical · Sundeck Pro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pool care: how much of each chemical to add, from the pool's size and today's readings. A
 * visit or a customer's pool opens it for that pool (?property=, ?job=): its gallons fill in,
 * Submit saves the readings, and the pool's log shows below (owner, 2026-10-19).
 */
export default async function ChemicalsPage({ searchParams }: PageProps<"/chemicals">) {
  const { gallons, property, job } = await searchParams;
  const office = await getOffice();
  const propertyId = typeof property === "string" && UUID.test(property) ? property : null;
  const jobId = typeof job === "string" && UUID.test(job) ? job : null;
  const [pool, readings, team] = propertyId
    ? await Promise.all([
        getChemicalPool(office, propertyId),
        getChemicalReadings(office, propertyId),
        getTeam(office),
      ])
    : [null, [], []];
  const size = Number(gallons);
  const startGallons =
    pool?.approx_gallons ?? (Number.isFinite(size) && size > 0 ? Math.round(size) : null);
  const tz = office.company.timezone;
  const who = new Map(team.map((t) => [t.user_id, t.name]));
  const name = pool ? (pool.customer?.name ?? formatAddress(pool)) : null;
  return (
    <>
      <PageHeader
        title="Chemical"
        subtitle={pool ? [name, formatAddress(pool)].filter(Boolean).join(" · ") : undefined}
      />
      <Suspense fallback={null}>
        <ScreenTip screen="chemicals" />
      </Suspense>
      <ChemCalculator
        initialGallons={startGallons}
        pool={pool ? { propertyId: pool.id, jobId, name: name ?? "this pool" } : null}
      />
      {pool ? (
        <Grouped
          title="Chemical log"
          className="mt-8 max-w-2xl"
          footer="One entry for each Submit, newest first."
        >
          {readings.length === 0 ? (
            <Row label={<span className="text-text-muted">No readings submitted yet</span>} />
          ) : (
            readings.map((r) => (
              <Row
                key={r.id}
                label={<span className="tabular-nums">{readingSummary(r)}</span>}
                detail={[
                  formatSchedule(r.recorded_at, new Date(), tz),
                  r.recorded_by ? who.get(r.recorded_by) : null,
                  r.gallons ? `${r.gallons.toLocaleString("en-US")} gal` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={<RemoveReading id={r.id} />}
              />
            ))
          )}
        </Grouped>
      ) : null}
    </>
  );
}
