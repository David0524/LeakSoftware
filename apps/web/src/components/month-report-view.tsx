import {
  additionLabel,
  chemicalTotals,
  dateFormat,
  formatCents,
  monthName,
  textOnBrand,
  waterTestRows,
  type ChemicalAddition,
  type ReportSnapshot,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import Link from "next/link";
import type { ReactNode } from "react";
import { ContactLine } from "./contact-line";
import { PdfLink } from "./pdf-link";
import { PHONE_CARD } from "./doc-ui";
import type { VisitSnapshot } from "./visit-report-view";
import { cx } from "./ui";

// A month of maintenance visits for the customer (owner, 2026-10-24: monthly reports that go
// "in hand with the invoice"; docs/design/2026-10-24-chemicals-added.md), from the snapshot frozen
// when it was sent: the month at a glance, then each visit, newest first.

export interface MonthSnapshot extends ReportSnapshot {
  kind: "month";
  month: string;
  charge_chemicals?: boolean;
  visits: (VisitSnapshot & { job_id: string; date: string })[];
  invoice: { number: number | null; total_cents: number; token: string | null } | null;
}

const STATUS = tokens.color.status;
const TONE = { ok: STATUS.pass, low: STATUS.warning, high: STATUS.warning } as const;
const SHORT: Record<string, string> = {
  fc: "FC",
  ph: "pH",
  ta: "TA",
  ch: "CH",
  cya: "CYA",
  salt: "Salt",
};
/** Visits shown before "Show more". */
const SHOWN = 3;

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "report-block mt-6 max-sm:mt-4 sm:rounded-lg sm:border sm:border-neutral-200 sm:p-5",
        PHONE_CARD,
        className,
      )}
    >
      {children}
    </section>
  );
}

export function MonthReportView({
  snapshot: s,
  version,
  urls,
  logoUrl,
  pdfHref,
}: {
  snapshot: MonthSnapshot;
  version: number;
  urls: Map<string, string>;
  logoUrl: string | null;
  pdfHref?: string;
}) {
  const tz = s.company.timezone;
  const brand = s.company.brand_primary;
  const onBrand = textOnBrand(brand, tokens.color.brand.navy, tokens.color.brand.paper);
  const month = monthName(s.month, tz);
  const charged = !!s.charge_chemicals;
  const added: ChemicalAddition[] = s.visits.flatMap((v, vi) =>
    (v.added ?? []).map((a, i) => ({
      ...a,
      id: `${vi}-${i}`,
      job_id: v.job_id,
      property_id: "",
      price_book_item_id: null,
      suggested_quantity: null,
      // Oldest visit first, so totals list chemicals in the order first added.
      added_at: `${v.date}T${String(i).padStart(2, "0")}`,
      sort_order: i,
    })),
  );
  const totals = chemicalTotals(added);
  const chemCents = totals.reduce((sum, t) => sum + t.total_cents, 0);
  const photos = (v: { media: ReportSnapshot["media"] }) =>
    v.media.filter((m) => m.kind === "photo" && urls.has(m.storage_path));
  const photoCount = s.visits.reduce((n, v) => n + photos(v).length, 0);
  const day = (d: string) =>
    dateFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  const visit = (v: MonthSnapshot["visits"][number]) => {
    const reading = v.chemicals?.[0];
    const water = reading ? waterTestRows(reading, reading.goals) : [];
    const done = v.components.filter((c) => c.status === "inspected").map((c) => c.label);
    const pics = photos(v);
    return (
      <Card key={v.job_id}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-display text-2xl font-bold">{day(v.date)}</h2>
          {v.job.tech_name ? (
            <span className="text-[0.9375rem] text-text-muted">{v.job.tech_name}</span>
          ) : null}
        </div>
        {water.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Water test">
            {water.map((w) => (
              <li
                key={w.key}
                className="rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold"
                style={{ color: TONE[w.status], backgroundColor: `${TONE[w.status]}1F` }}
              >
                {SHORT[w.key]} {w.value}
                {w.status === "ok" ? "" : ` · ${w.statusLabel}`}
              </li>
            ))}
          </ul>
        ) : null}
        {v.added?.length ? (
          <p className="mt-3 text-[0.9375rem]">
            <span className="text-text-muted">Added · </span>
            {v.added
              .map((a) => `${additionLabel(a)}${a.customer_supplied ? " (yours)" : ""}`)
              .join(", ")}
          </p>
        ) : null}
        {done.length ? (
          <p className="mt-1 text-[0.9375rem]">
            <span className="text-text-muted">Done · </span>
            {done.join(", ")}
          </p>
        ) : null}
        {v.job.summary_notes ? (
          <p className="mt-2 text-[0.9375rem] whitespace-pre-line">{v.job.summary_notes}</p>
        ) : null}
        {pics.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {pics.slice(0, 6).map((m) => (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img
                key={m.id}
                src={urls.get(m.storage_path)}
                alt={m.caption ?? `Photo from ${day(v.date)}`}
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        ) : null}
      </Card>
    );
  };

  return (
    <article
      className="mx-auto max-w-4xl p-4 sm:p-8"
      style={{ ["--shop" as string]: brand }}
      data-testid="month-report"
    >
      <header
        className="report-header -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-4 px-6 py-5 max-sm:px-5 sm:mx-0 sm:mt-0 sm:rounded-lg"
        style={{ backgroundColor: brand, color: onBrand }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-4 max-sm:gap-3 sm:flex-nowrap">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={logoUrl}
              alt={`${s.company.name} logo`}
              className="max-h-14 max-w-48 rounded bg-paper p-1 max-sm:max-w-40"
            />
          ) : null}
          <div className={cx("min-w-0", logoUrl && "max-sm:basis-full")}>
            <p className="font-display text-2xl font-extrabold">{s.company.name}</p>
            <p className="text-[0.9375rem]">
              <ContactLine phone={s.company.phone} email={s.company.email} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          <div className="text-[0.9375rem] sm:text-right">
            <h1 className="font-display text-xl font-bold">{month} Service Report</h1>
            <p>
              {[s.property.address, s.customer?.name].filter(Boolean).join(" · ")}
              {version > 1 ? ` · version ${version}` : ""}
            </p>
          </div>
          {pdfHref ? <PdfLink href={pdfHref} className="inline-flex" /> : null}
        </div>
      </header>

      <Card>
        <div className="grid grid-cols-3 text-center">
          <div>
            <p className="font-display text-3xl font-extrabold tabular-nums">{s.visits.length}</p>
            <p className="text-[0.9375rem] text-text-muted">
              {s.visits.length === 1 ? "visit" : "visits"}
            </p>
          </div>
          {charged && chemCents > 0 ? (
            <div>
              <p className="font-display text-3xl font-extrabold tabular-nums">
                {formatCents(chemCents).replace(/\.00$/, "")}
              </p>
              <p className="text-[0.9375rem] text-text-muted">chemicals</p>
            </div>
          ) : (
            <div>
              <p className="font-display text-3xl font-extrabold tabular-nums">
                {s.visits.filter((v) => v.chemicals?.length).length}
              </p>
              <p className="text-[0.9375rem] text-text-muted">water tests</p>
            </div>
          )}
          <div>
            <p className="font-display text-3xl font-extrabold tabular-nums">{photoCount}</p>
            <p className="text-[0.9375rem] text-text-muted">
              {photoCount === 1 ? "photo" : "photos"}
            </p>
          </div>
        </div>
        {totals.length ? (
          <>
            <h2 className="mt-4 border-t-[0.5px] border-separator pt-3 font-display text-xl font-bold">
              Chemicals This Month
            </h2>
            <ul className="mt-1 text-[0.9375rem]" data-testid="month-chemicals">
              {totals.map((t, i) => (
                <li key={i} className="flex justify-between gap-4 py-1">
                  <span>{additionLabel(t)}</span>
                  {t.customer_supplied ? (
                    <span className="text-text-muted">Supplied by you</span>
                  ) : charged ? (
                    <span className="tabular-nums">{formatCents(t.total_cents)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {s.invoice?.token ? (
          <Link
            href={`/i/${s.invoice.token}`}
            className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-link/12 px-5 font-semibold text-link print:hidden"
          >
            View {month} Invoice
          </Link>
        ) : null}
      </Card>

      {s.visits.slice(0, SHOWN).map(visit)}
      {s.visits.length > SHOWN ? (
        <details className="group">
          <summary className="mt-4 flex min-h-11 cursor-pointer list-none items-center justify-center text-link print:hidden [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show {s.visits.length - SHOWN} More{" "}
              {s.visits.length - SHOWN === 1 ? "Visit" : "Visits"}
            </span>
            <span className="hidden group-open:inline">Show Fewer</span>
          </summary>
          {s.visits.slice(SHOWN).map(visit)}
        </details>
      ) : null}

      <footer className="mt-10 text-center text-[0.8125rem] text-text-muted">
        {s.company.disclaimer ? (
          <p className="mb-2 whitespace-pre-line">{s.company.disclaimer}</p>
        ) : null}
        <p>Powered by Sundeck Pro</p>
      </footer>
    </article>
  );
}
