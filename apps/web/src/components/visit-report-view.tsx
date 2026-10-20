import { dateFormat, textOnBrand, waterTestRows, type ReportSnapshot } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import type { ReactNode } from "react";
import { ContactLine } from "./contact-line";
import { PdfLink } from "./pdf-link";
import { PHONE_CARD } from "./doc-ui";
import { cx } from "./ui";

// A maintenance visit's report for the customer (owner, 2026-10-20: "build a report with the
// tested chemicals, checklist, cleanings, photos, etc."), from the snapshot frozen when it was
// sent. Shop branding, as on the leak report.

export interface VisitSnapshot extends ReportSnapshot {
  chemicals?: {
    recorded_at: string;
    fc: number | null;
    ph: number | null;
    ta: number | null;
    ch: number | null;
    cya: number | null;
    salt: number | null;
    notes: string | null;
  }[];
  completed_at?: string | null;
}

const STATUS = tokens.color.status;
const TONE = { ok: STATUS.pass, low: STATUS.warning, high: STATUS.warning } as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cx("report-block mt-8 max-sm:mt-4", PHONE_CARD)}>
      <h2
        className="mb-3 border-b pb-1 font-display text-2xl font-bold break-after-avoid max-sm:border-b-0 max-sm:pb-0"
        style={{ borderColor: "var(--shop)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function VisitReportView({
  snapshot: s,
  version,
  sentAt,
  urls,
  logoUrl,
  pdfHref,
}: {
  snapshot: VisitSnapshot;
  version: number;
  sentAt: string | null;
  urls: Map<string, string>;
  logoUrl: string | null;
  pdfHref?: string;
}) {
  const tz = s.company.timezone;
  const brand = s.company.brand_primary;
  const onBrand = textOnBrand(brand, tokens.color.brand.navy, tokens.color.brand.paper);
  const day = (iso: string | null | undefined) =>
    iso ? dateFormat("en-US", { dateStyle: "long", timeZone: tz }).format(new Date(iso)) : "";
  const when = s.completed_at ?? s.job.completed_at ?? s.job.started_at ?? sentAt;
  const reading = s.chemicals?.[0];
  const water = reading ? waterTestRows(reading) : [];
  const done = s.components.filter((c) => c.status === "inspected");
  const skipped = s.components.filter((c) => c.status === "excluded");
  const photos = s.media.filter((m) => m.kind === "photo" && urls.has(m.storage_path));
  const techs = [s.job.tech_name, s.job.second_tech_name].filter(Boolean).join(" and ");

  return (
    <article
      className="mx-auto max-w-4xl p-4 sm:p-8"
      style={{ ["--shop" as string]: brand }}
      data-testid="visit-report"
    >
      <header
        className="report-header -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-4 px-6 py-5 max-sm:px-5 sm:mx-0 sm:mt-0 sm:rounded-lg"
        style={{ backgroundColor: brand, color: onBrand }}
      >
        <div className="flex min-w-0 items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={logoUrl}
              alt={`${s.company.name} logo`}
              className="max-h-16 max-w-48 rounded bg-paper p-1"
            />
          ) : null}
          <div className="min-w-0">
            <p className="font-display text-2xl font-extrabold">{s.company.name}</p>
            <p className="text-[0.9375rem]">
              <ContactLine phone={s.company.phone} email={s.company.email} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[0.9375rem] sm:text-right">
            <h1 className="font-display text-xl font-bold">Pool Visit Report</h1>
            <p>
              {day(when)}
              {version > 1 ? ` · version ${version}` : ""}
            </p>
          </div>
          {pdfHref ? <PdfLink href={pdfHref} className="inline-flex" /> : null}
        </div>
      </header>

      <section className={cx("mt-6", PHONE_CARD)}>
        <dl className="grid gap-x-6 gap-y-2 text-[0.9375rem] sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">Property</dt>
            <dd className="font-medium">{s.property.address}</dd>
          </div>
          {s.customer ? (
            <div>
              <dt className="text-text-muted">Prepared for</dt>
              <dd className="font-medium">{s.customer.name}</dd>
            </div>
          ) : null}
          {techs ? (
            <div>
              <dt className="text-text-muted">Technician</dt>
              <dd>{techs}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {water.length ? (
        <Card title="Water Test">
          <table className="w-full text-left text-[0.9375rem]">
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 font-medium">Reading</th>
                <th className="py-1 font-medium">Result</th>
                <th className="py-1 font-medium">Aim for</th>
                <th className="py-1 font-medium">
                  <span className="sr-only">How it measured</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {water.map((w) => (
                <tr key={w.key} className="border-t-[0.5px] border-separator">
                  <td className="py-2">{w.label}</td>
                  <td className="py-2 font-semibold">{w.value}</td>
                  <td className="py-2 text-text-muted">{w.range}</td>
                  <td className="py-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold"
                      style={{ color: TONE[w.status], backgroundColor: `${TONE[w.status]}1F` }}
                    >
                      {w.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reading?.notes ? <p className="mt-3 whitespace-pre-line">{reading.notes}</p> : null}
        </Card>
      ) : null}

      {done.length || skipped.length ? (
        <Card title="What We Did">
          <ul className="space-y-2">
            {done.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span aria-hidden="true" className="font-bold" style={{ color: STATUS.pass }}>
                  ✓
                </span>
                <span>
                  {c.label}
                  {c.notes ? (
                    <span className="block text-[0.9375rem] text-text-muted">{c.notes}</span>
                  ) : null}
                </span>
              </li>
            ))}
            {skipped.map((c) => (
              <li key={c.id} className="flex gap-2 text-text-muted">
                <span aria-hidden="true">–</span>
                <span>
                  {c.label}: not done{c.exclusion_reason ? ` (${c.exclusion_reason})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.job.summary_notes ? (
        <Card title="Notes">
          <p className="whitespace-pre-line">{s.job.summary_notes}</p>
        </Card>
      ) : null}

      {photos.length ? (
        <Card title="Photos">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((m) => (
              <figure key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img
                  src={urls.get(m.storage_path)}
                  alt={m.caption ?? "Photo from the visit"}
                  className="aspect-square w-full rounded-lg object-cover"
                />
                {m.caption ? (
                  <figcaption className="mt-1 text-[0.8125rem] text-text-muted">
                    {m.caption}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        </Card>
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
