import type { Metadata } from "next";
import {
  chargesChemicals,
  formatAddress,
  formatSchedule,
  monthlyUsage,
  outOfRangeRows,
  readingSummary,
} from "@leakbook/core";
import { ChemCalculator } from "@/components/chem-calculator";
import { RemoveReading } from "@/components/chem-log";
import { ChemTrends } from "@/components/chem-trends";
import { SegmentedLinks } from "@/components/gestures";
import { Empty, Grouped, PageHeader, Row, SEGMENT_TRACK, cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import {
  getChemicalPool,
  getCompany,
  getChemicalReadings,
  getPoolAdditions,
  getRecentReadings,
  getTeam,
} from "@/lib/data";

export const metadata: Metadata = { title: "Chemical · Sundeck Pro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pool care: how much of each chemical to add, from the pool's size and today's readings. A
 * visit or a customer's pool opens it for that pool (?property=, ?job=): its gallons fill in,
 * Submit saves the readings, and the pool's log shows below (owner, 2026-10-19), with its
 * trends (90 Days, 6 Months, 1 Year). Without a pool, Out of Range lists the last 30 days'
 * readings well outside their range (owner, 2026-11-16).
 */
export default async function ChemicalsPage({ searchParams }: PageProps<"/chemicals">) {
  const { gallons, property, job, view } = await searchParams;
  const office = await getOffice();
  const propertyId = typeof property === "string" && UUID.test(property) ? property : null;
  const jobId = typeof job === "string" && UUID.test(job) ? job : null;
  const outOfRange = !propertyId && view === "out-of-range";
  if (outOfRange) return <OutOfRange office={office} />;
  const [pool, readings, team, added, history, yearAdded, company] = propertyId
    ? await Promise.all([
        getChemicalPool(office, propertyId),
        // Until the chemical log reaches the database, the calculator still works.
        getChemicalReadings(office, propertyId).catch(() => []),
        getTeam(office),
        getPoolAdditions(office, propertyId).catch(() => []),
        getChemicalReadings(office, propertyId, 400).catch(() => []),
        getPoolAdditions(office, propertyId, 400).catch(() => []),
        getCompany(office),
      ])
    : [null, [], [], [], [], [], null];
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
      {!pool ? (
        <SegmentedLinks
          label="Chemical"
          className={cx(SEGMENT_TRACK, "mb-5")}
          items={[
            { href: "/chemicals", label: "Calculator", active: true },
            { href: "/chemicals?view=out-of-range", label: "Out of Range", active: false },
          ]}
        />
      ) : null}
      <ChemCalculator
        initialGallons={startGallons}
        pool={pool ? { propertyId: pool.id, jobId, name: name ?? "this pool" } : null}
      />
      {pool ? (
        <ChemTrends
          readings={history}
          additions={yearAdded}
          charges={chargesChemicals(company?.settings)}
          timeZone={tz}
          now={new Date().toISOString()}
        />
      ) : null}
      {/* What the pool took each month (owner, 2026-10-24), from what techs added on visits. */}
      {pool && added.length ? (
        <Grouped title="Chemicals added" className="mt-8 max-w-2xl">
          {monthlyUsage(added, tz).map((m) => (
            <Row key={m.month} label={m.label} detail={m.line} />
          ))}
        </Grouped>
      ) : null}
      {pool ? (
        <Grouped title="Chemical log" className="mt-8 max-w-2xl">
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

/** Chemicals › Out of Range: readings well outside their range, the last 30 days. */
async function OutOfRange({ office }: { office: Awaited<ReturnType<typeof getOffice>> }) {
  const [{ readings, pools }, team] = await Promise.all([
    getRecentReadings(office),
    getTeam(office),
  ]);
  const tz = office.company.timezone;
  const who = new Map(team.map((t) => [t.user_id, t.name]));
  const pool = new Map(pools.map((p) => [p.id, p]));
  const rows = outOfRangeRows(readings, new Date().toISOString());
  return (
    <>
      <PageHeader title="Chemical" />
      <SegmentedLinks
        label="Chemical"
        className={cx(SEGMENT_TRACK, "mb-5")}
        items={[
          { href: "/chemicals", label: "Calculator", active: false },
          { href: "/chemicals?view=out-of-range", label: "Out of Range", active: true },
        ]}
      />
      {rows.length === 0 ? (
        <Empty>No readings out of range in the last 30 days.</Empty>
      ) : (
        <Grouped
          title="Last 30 days"
          className="max-w-2xl"
          footer="Readings well outside the pool’s range, newest first."
        >
          {rows.map((r) => {
            const p = pool.get(r.propertyId);
            const name = p ? (p.customer?.name ?? formatAddress(p)) : "A pool";
            return (
              <Row
                key={r.id}
                href={`/chemicals?property=${r.propertyId}`}
                label={name}
                detail={[
                  `Aim for ${r.range}`,
                  formatSchedule(r.recordedAt, new Date(), tz),
                  r.recordedBy ? who.get(r.recordedBy) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={
                  <span className="text-status-fail tabular-nums">
                    {r.label} {r.valueText} · {r.direction === "low" ? "Low" : "High"}
                  </span>
                }
              />
            );
          })}
        </Grouped>
      )}
    </>
  );
}
