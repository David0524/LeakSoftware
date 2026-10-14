import type { Metadata } from "next";
import Link from "next/link";
import {
  WARRANTY_STATE_LABELS,
  formatAddress,
  localDate,
  warrantyEndsText,
  warrantyState,
  type WarrantyState,
} from "@leakbook/core";
import {
  Chip,
  Empty,
  Grouped,
  PageHeader,
  Row,
  cx,
  SEGMENT_TRACK,
  segmentClass,
} from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getWarranties } from "@/lib/data";

export const metadata: Metadata = { title: "Warranties · Tidemark" };

const VIEWS: WarrantyState[] = ["active", "expiring", "expired"];
const CHIP: Record<WarrantyState, string> = {
  active: "bg-status-pass",
  expiring: "bg-status-warning",
  expired: "bg-status-excluded",
};
const date = (d: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );

/** Repairs still under warranty, the ones ending soon, and the ones that ended. */
export default async function WarrantiesPage({ searchParams }: PageProps<"/warranties">) {
  const office = await getOffice();
  const { show } = await searchParams;
  const view: WarrantyState = VIEWS.includes(show as WarrantyState)
    ? (show as WarrantyState)
    : "active";
  const today = localDate(new Date(), office.company.timezone);
  const all = (await getWarranties(office)).map((w) => ({
    ...w,
    state: warrantyState(w.ends_on, today),
  }));
  // "Active" lists every warranty still running, including the ones ending soon.
  const list = all.filter((w) => (view === "active" ? w.state !== "expired" : w.state === view));
  if (view === "expired") list.reverse();
  const count = (v: WarrantyState) =>
    all.filter((w) => (v === "active" ? w.state !== "expired" : w.state === v)).length;

  return (
    <>
      <PageHeader
        title="Warranties"
        subtitle="Recorded when a repair is paid, from the quote lines with a warranty term."
      />
      <nav aria-label="Show" className={cx(SEGMENT_TRACK, "mb-5")}>
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/warranties?show=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={segmentClass(v === view)}
          >
            {v === "expiring" ? "Expiring Soon" : WARRANTY_STATE_LABELS[v]} ({count(v)})
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <Empty>
          {view === "active"
            ? "No active warranties. They’re recorded when a repair with a warranty term is paid."
            : view === "expiring"
              ? "Nothing ends in the next 60 days."
              : "No expired warranties."}
        </Empty>
      ) : (
        <Grouped className="max-w-3xl">
          {list.map((w) => (
            <Row key={w.id}>
              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{w.description}</p>
                  <Chip label={WARRANTY_STATE_LABELS[w.state]} className={CHIP[w.state]} />
                </div>
                {w.job ? (
                  <p>
                    {w.job.customer ? (
                      <Link
                        href={`/customers/${w.job.customer.id}`}
                        className="font-medium text-link underline-offset-4 hover:underline"
                      >
                        {w.job.customer.name}
                      </Link>
                    ) : null}
                    {w.job.property ? (
                      <span className="block text-[0.9375rem] text-text-muted">
                        {formatAddress(w.job.property)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <p className="mt-1 text-[0.9375rem]">
                  {date(w.starts_on)} – {date(w.ends_on)} · {warrantyEndsText(w.ends_on, today)}
                </p>
                {w.terms ? <p className="text-[0.9375rem] text-text-muted">{w.terms}</p> : null}
                {w.job ? (
                  <Link
                    href={`/jobs/${w.job.id}`}
                    className="inline-flex min-h-11 items-center gap-1 text-[0.9375rem] font-semibold text-link"
                  >
                    Repair job{w.job.number ? ` #${w.job.number}` : ""}
                    <span aria-hidden="true">›</span>
                  </Link>
                ) : null}
              </div>
            </Row>
          ))}
        </Grouped>
      )}
    </>
  );
}
