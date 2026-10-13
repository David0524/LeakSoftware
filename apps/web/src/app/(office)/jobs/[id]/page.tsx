import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  JOB_TYPE_LABELS,
  MEDIA_KIND_LABELS,
  POOL_TYPE_LABELS,
  SIGNATURE_PURPOSE_LABELS,
  checklistTally,
  enabledSignaturePurposes,
  componentApplies,
  formatCents,
  formatAddress,
  formatDuration,
  formatSchedule,
  parseMarkup,
  suggestItems,
  timeline,
  type CompanySettings,
  type PriceBookItem,
  type Media,
} from "@leakbook/core";
import { GalleryImage } from "@/components/gallery-image";
import { JobSections } from "@/components/job-sections";
import { MediaActions, MediaCapture, SignatureForm } from "@/components/media-work";
import {
  ChecklistEditor,
  FindingsEditor,
  JobDetailsForm,
  JobStatusActions,
  SetUpChecklist,
  TestsEditor,
  type ChecklistRow,
} from "@/components/job-work";
import { Card, Empty, Notice, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import {
  auditFor,
  getCompany,
  getInvoices,
  getJob,
  getPaymentAccount,
  getQuotes,
  getReports,
  getSignatures,
  listConfig,
  getTeam,
  signedMediaUrls,
  type JobDetail,
} from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { CreateInvoice, InvoicePanel } from "@/components/invoice-panel";
import { QuoteBuilder, StartQuote } from "@/components/quote-builder";
import { QuotePanel } from "@/components/quote-panel";
import { ReportPanel } from "@/components/report-panel";
import { ScheduleForm } from "@/components/schedule-form";
import { emailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Job · Tidemark" };

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const office = await getOffice();
  const detail = await getJob(office, id);
  if (!detail) notFound();
  const { job } = detail;
  const tz = office.company.timezone;
  const tally = checklistTally(detail.components, [...detail.results.values()]);
  const total = detail.components.length;
  const questions =
    ((await getCompany(office)).settings as Partial<CompanySettings>).intake_questions ?? [];
  const answers = questions
    .map((q) => ({ q, a: job.intake?.[q.key] }))
    .filter(({ a }) => (Array.isArray(a) ? a.length > 0 : !!a));

  return (
    <>
      <p className="mb-2">
        <Link
          href="/jobs"
          className="inline-flex min-h-11 items-center gap-1 text-link underline-offset-4 hover:underline"
        >
          ← Jobs
        </Link>
      </p>
      <PageHeader
        title={job.number ? `Job #${job.number}` : "New Job"}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={job.status} />
            <span>{JOB_TYPE_LABELS[job.type]}</span>
            <span>
              {job.started_at && job.status === "in_progress"
                ? `Started ${formatSchedule(job.started_at, new Date(), tz)}`
                : formatSchedule(job.scheduled_start ?? null, new Date(), tz)}
            </span>
          </span>
        }
        actions={<JobStatusActions jobId={job.id} status={job.status} />}
      />

      <JobSections
        sections={[
          {
            id: "details",
            label: "Details",
            content: (
              <>
                <div className="grid gap-5 lg:grid-cols-3">
                  <Card>
                    <SectionTitle>Customer</SectionTitle>
                    {job.customer ? (
                      <Link
                        href={`/customers/${job.customer.id}`}
                        className="text-xl font-semibold text-link underline-offset-4 hover:underline"
                      >
                        {job.customer.name}
                      </Link>
                    ) : (
                      <p>Customer</p>
                    )}
                    {job.customer?.phone ? (
                      <p>
                        <a href={`tel:${job.customer.phone}`} className="text-link">
                          {job.customer.phone}
                        </a>
                      </p>
                    ) : null}
                    {job.customer?.email ? (
                      <p>
                        <a href={`mailto:${job.customer.email}`} className="text-link">
                          {job.customer.email}
                        </a>
                      </p>
                    ) : null}
                  </Card>
                  <Card>
                    <SectionTitle>Pool</SectionTitle>
                    {job.property ? (
                      <>
                        <p className="font-semibold">{formatAddress(job.property)}</p>
                        <p className="text-text-muted">
                          {[
                            job.property.pool_type
                              ? POOL_TYPE_LABELS[job.property.pool_type]
                              : null,
                            job.property.has_spa ? "Pool and spa" : "Pool",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {job.property.access_notes ? (
                          <p className="mt-2 border-l-4 border-status-warning pl-3">
                            {job.property.access_notes}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </Card>
                  <Card>
                    <SectionTitle>Assigned to</SectionTitle>
                    <p className="text-xl font-semibold">{job.techName ?? "Nobody yet"}</p>
                    {job.secondTechName ? <p>With {job.secondTechName}</p> : null}
                    {job.fee_cents != null ? (
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3">
                        <dt className="text-text-muted">Detection fee</dt>
                        <dd>{formatCents(job.fee_cents)}</dd>
                      </dl>
                    ) : null}
                  </Card>
                </div>

                <Card className="mt-5 max-w-3xl" aria-labelledby="on-site">
                  <h2 id="on-site" className="mb-3 font-display text-xl font-bold">
                    On Site
                  </h2>
                  <JobDetailsForm
                    jobId={job.id}
                    fee={job.fee_cents ?? null}
                    locationMarked={job.location_marked ?? false}
                    notes={job.summary_notes ?? ""}
                  />
                </Card>

                {answers.length ? (
                  <Card className="mt-5">
                    <SectionTitle>When they booked</SectionTitle>
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                      {answers.map(({ q, a }) => (
                        <div key={q.key} className="contents">
                          <dt className="text-text-muted">{q.label}</dt>
                          <dd>{Array.isArray(a) ? a.join(", ") : a}</dd>
                        </div>
                      ))}
                    </dl>
                  </Card>
                ) : null}

                {job.type === "repair" || ["unscheduled", "scheduled"].includes(job.status) ? (
                  <section className="mt-8" aria-labelledby="schedule">
                    <h2 id="schedule" className="mb-3 font-display text-2xl font-bold">
                      Schedule
                    </h2>
                    <Card className="max-w-2xl">
                      <Schedule detail={detail} tz={tz} />
                    </Card>
                  </section>
                ) : null}

                {office.isOwner ? (
                  <section className="mt-8" aria-labelledby="timeline">
                    <h2 id="timeline" className="mb-3 font-display text-2xl font-bold">
                      Timeline
                    </h2>
                    <Timeline detail={detail} tz={tz} />
                  </section>
                ) : null}
              </>
            ),
          },
          {
            id: "checklist",
            label: "Checklist",
            badge: tally.pending,
            content: (
              <section aria-labelledby="checklist">
                <h2 id="checklist" className="font-display text-2xl font-bold">
                  Checklist
                </h2>
                <p className="mb-3 text-text-muted">
                  {total === 0
                    ? "No checklist yet."
                    : [
                        `${tally.pass} not leaking`,
                        `${tally.attention} attention`,
                        `${tally.leaking} leaking`,
                        `${tally.notApplicable} not applicable`,
                        `${tally.pending} to do`,
                      ].join(" · ")}
                </p>
                {detail.components.length > 0 ? (
                  <Checklist detail={detail} />
                ) : (
                  <SetUpChecklist jobId={job.id} />
                )}
              </section>
            ),
          },
          {
            id: "findings",
            label: "Findings",
            content: (
              <>
                <section aria-labelledby="tests">
                  <h2 id="tests" className="mb-3 font-display text-2xl font-bold">
                    Tests
                  </h2>
                  <Tests detail={detail} tz={tz} />
                </section>

                <section className="mt-8" aria-labelledby="findings">
                  <h2 id="findings" className="mb-3 font-display text-2xl font-bold">
                    Findings
                  </h2>
                  <Findings detail={detail} />
                </section>
              </>
            ),
          },
          {
            id: "photos",
            label: "Photos",
            content: (
              <section aria-labelledby="media">
                <h2 id="media" className="mb-3 font-display text-2xl font-bold">
                  Photos and Recordings
                </h2>
                <Gallery detail={detail} tz={tz} />
              </section>
            ),
          },
          {
            id: "wrap-up",
            label: "Wrap-Up",
            content: (
              <>
                <section aria-labelledby="signatures">
                  <h2 id="signatures" className="mb-3 font-display text-2xl font-bold">
                    Customer Sign-Off
                  </h2>
                  <Signatures detail={detail} tz={tz} />
                </section>

                <section className="mt-8" aria-labelledby="reports">
                  <h2 id="reports" className="mb-3 font-display text-2xl font-bold">
                    Reports
                  </h2>
                  <Reports detail={detail} />
                </section>

                {job.type === "detection" ? (
                  <section className="mt-8" aria-labelledby="quotes">
                    <h2 id="quotes" className="mb-3 font-display text-2xl font-bold">
                      Quotes
                    </h2>
                    <Quotes detail={detail} />
                  </section>
                ) : null}

                <section className="mt-8" aria-labelledby="invoice">
                  <h2 id="invoice" className="mb-3 font-display text-2xl font-bold">
                    Invoice
                  </h2>
                  <Invoices detail={detail} />
                </section>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function Checklist({ detail }: { detail: JobDetail }) {
  const property = detail.job.property;
  const rows: ChecklistRow[] = detail.components.flatMap((c) => {
    const type = detail.componentTypes.get(c.component_type_id);
    if (!type) return [];
    const r = detail.results.get(c.id);
    return [
      {
        id: c.id,
        label: c.label,
        type: {
          id: type.id,
          name: type.name,
          answer: type.answer,
          allows_multiple: type.allows_multiple,
          section: type.section ?? "other",
        },
        result: r
          ? {
              id: r.id,
              status: r.status,
              outcome: r.outcome ?? null,
              location_text: r.location_text ?? null,
              method: r.method ?? null,
              exclusion_reason: r.exclusion_reason ?? null,
              notes: r.notes ?? null,
            }
          : null,
      },
    ];
  });
  const present = new Set(detail.components.map((c) => c.component_type_id));
  const addable = [...detail.componentTypes.values()]
    .filter(
      (t) =>
        t.active &&
        !t.deleted_at &&
        !present.has(t.id) &&
        (!property || componentApplies(t, { ...property, has_pool: true })),
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ id: t.id, name: t.name }));
  return <ChecklistEditor jobId={detail.job.id} rows={rows} addable={addable} />;
}

function Tests({ detail, tz }: { detail: JobDetail; tz: string }) {
  const now = new Date();
  return (
    <TestsEditor
      jobId={detail.job.id}
      tests={detail.tests.map((t) => ({
        id: t.id,
        typeId: t.test_type_id,
        componentId: t.job_component_id ?? null,
        data: t.data,
        outcome: t.outcome ?? null,
        notes: t.notes ?? null,
        when: t.performed_at ? formatSchedule(t.performed_at, now, tz) : null,
      }))}
      types={[...detail.testTypes.values()]
        .filter(
          (t) => (t.active && !t.deleted_at) || detail.tests.some((x) => x.test_type_id === t.id),
        )
        .sort((a, b) => a.sort_order - b.sort_order)}
      components={detail.components.map((c) => ({ id: c.id, label: c.label }))}
    />
  );
}

function Findings({ detail }: { detail: JobDetail }) {
  const property = detail.job.property;
  return (
    <FindingsEditor
      jobId={detail.job.id}
      findings={detail.findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity_key,
        componentId: f.job_component_id ?? null,
        location: f.location_text ?? null,
        status: f.status,
        notes: f.notes ?? null,
        pinX: f.pin_x != null ? Number(f.pin_x) : null,
        pinY: f.pin_y != null ? Number(f.pin_y) : null,
      }))}
      severities={[...detail.severities.values()]
        .filter((s) => s.active || detail.findings.some((f) => f.severity_key === s.key))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ key: s.key, name: s.name, color: s.color }))}
      components={detail.components.map((c) => ({ id: c.id, label: c.label }))}
      diagram={
        property ? { shape: property.diagram_shape ?? null, hasSpa: property.has_spa } : null
      }
    />
  );
}

async function Gallery({ detail, tz }: { detail: JobDetail; tz: string }) {
  const urls = await signedMediaUrls(
    detail.media
      .filter((m) => m.upload_state === "uploaded" && m.storage_path)
      .map((m) => m.storage_path!),
  );
  const componentLabel = new Map(detail.components.map((c) => [c.id, c.label]));
  const findingTitle = new Map(detail.findings.map((f) => [f.id, f.title]));
  const attached = (m: Media) =>
    (m.finding_id && findingTitle.get(m.finding_id)) ||
    (m.job_component_id && componentLabel.get(m.job_component_id)) ||
    (m.test_result_id ? "Test" : "Job");
  const targets = [
    ...detail.findings.map((f) => ({ value: `finding:${f.id}`, label: `Finding: ${f.title}` })),
    ...detail.components.map((c) => ({ value: `component:${c.id}`, label: c.label })),
  ];
  return (
    <div className="space-y-4">
      <MediaCapture jobId={detail.job.id} targets={targets} />
      {detail.media.length === 0 ? (
        <Empty>No photos or recordings yet.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detail.media.map((m) => {
            const url = m.storage_path ? urls.get(m.storage_path) : undefined;
            const markup = parseMarkup(m.markup).shapes;
            const w = m.width ?? 4;
            const h = m.height ?? 3;
            const label = `${MEDIA_KIND_LABELS[m.kind]} · ${attached(m)}`;
            return (
              <li key={m.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                {!url ? (
                  <div className="flex aspect-[4/3] items-center justify-center bg-bg p-4 text-center text-text-muted">
                    {MEDIA_KIND_LABELS[m.kind]} still uploading from the phone
                  </div>
                ) : m.kind === "photo" ? (
                  <GalleryImage
                    url={url}
                    alt={
                      m.caption ??
                      `Photo of ${attached(m)}${m.captured_at ? `, ${formatSchedule(m.captured_at, new Date(), tz)}` : ""}`
                    }
                    width={w}
                    height={h}
                    shapes={markup}
                  />
                ) : m.kind === "video" ? (
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    className="aspect-video w-full bg-navy"
                  />
                ) : (
                  <div className="p-4">
                    <audio src={url} controls preload="metadata" className="w-full" />
                  </div>
                )}
                <div className="p-3 text-[15px]">
                  <p className="font-medium">
                    {label}
                    {m.duration_ms ? ` · ${formatDuration(m.duration_ms)}` : ""}
                  </p>
                  {m.caption ? <p>{m.caption}</p> : null}
                  {m.kind === "audio" && m.transcript ? (
                    <p className="mt-1 italic">“{m.transcript}”</p>
                  ) : null}
                  <p className="text-text-muted">
                    {m.captured_at ? formatSchedule(m.captured_at, new Date(), tz) : ""}
                    {m.latitude != null ? " · location recorded" : ""}
                  </p>
                  <MediaActions
                    jobId={detail.job.id}
                    media={{
                      id: m.id,
                      kind: m.kind,
                      url: url ?? null,
                      width: w,
                      height: h,
                      shapes: markup,
                      caption: m.caption,
                      label,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function Signatures({ detail, tz }: { detail: JobDetail; tz: string }) {
  const office = await getOffice();
  const [signatures, company] = await Promise.all([
    getSignatures(office, detail.job.id),
    getCompany(office),
  ]);
  const urls = await signedMediaUrls(
    signatures.filter((s) => s.image_path).map((s) => s.image_path!),
  );
  return (
    <div className="space-y-4">
      {signatures.length === 0 ? (
        <p className="text-text-muted">
          Before you leave, hand the phone to the customer to confirm the visit. Their signature
          goes on the report.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {signatures.map((s) => {
            const url = s.image_path ? urls.get(s.image_path) : undefined;
            return (
              <li key={s.id} className="rounded-lg border border-border bg-surface p-4">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img
                    src={url}
                    alt={`Signature of ${s.signer_name}`}
                    className="mb-2 h-20 w-full rounded bg-paper object-contain"
                  />
                ) : null}
                <p className="font-semibold">
                  {s.signer_name}
                  {s.signer_role ? (
                    <span className="font-normal text-text-muted"> · {s.signer_role}</span>
                  ) : null}
                </p>
                <p className="text-[15px] text-text-muted">
                  {SIGNATURE_PURPOSE_LABELS[s.purpose] ?? s.purpose} ·{" "}
                  {formatSchedule(s.signed_at, new Date(), tz)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <SignatureForm
        jobId={detail.job.id}
        purposes={enabledSignaturePurposes(company.settings)}
        signer={detail.job.customer?.name ?? ""}
        shop={company.name}
        address={detail.job.property ? formatAddress(detail.job.property) : null}
        signed={signatures.map((s) => s.purpose)}
      />
    </div>
  );
}

async function Reports({ detail }: { detail: JobDetail }) {
  const office = await getOffice();
  const { reports, templates } = await getReports(office, detail.job.id);
  const nameOf = new Map(templates.map((t) => [t.key, t.name]));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {(["homeowner", "partner"] as const)
        .filter((key) => templates.find((t) => t.key === key)?.enabled !== false)
        .map((key) => (
          <ReportPanel
            key={key}
            jobId={detail.job.id}
            template={key}
            name={nameOf.get(key) ?? (key === "partner" ? "Partner report" : "Homeowner report")}
            draft={reports.find((r) => r.template_key === key && r.status === "draft") ?? null}
            sent={reports.filter((r) => r.template_key === key && r.status !== "draft")}
            customerEmail={detail.job.customer?.email ?? null}
            emailReady={emailConfigured()}
            aiReady={Boolean(process.env.ANTHROPIC_API_KEY)}
          />
        ))}
      <p className="text-[15px] text-text-muted xl:col-span-2">
        Insurance adjuster report: coming soon.
      </p>
    </div>
  );
}

async function Schedule({ detail, tz }: { detail: JobDetail; tz: string }) {
  const office = await getOffice();
  const team = await getTeam(office);
  const { job } = detail;
  const local = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
    };
  };
  const start = job.scheduled_start ? local(job.scheduled_start) : { date: "", time: "08:00" };
  const hours =
    job.scheduled_start && job.scheduled_end
      ? String(
          (new Date(job.scheduled_end).getTime() - new Date(job.scheduled_start).getTime()) /
            3_600_000,
        )
      : "2";
  return (
    <ScheduleForm
      jobId={job.id}
      techs={team
        .filter((m) => m.status === "active")
        .map((m) => ({ value: m.user_id, label: m.name }))}
      defaults={{ tech: job.assigned_user_id ?? "", date: start.date, time: start.time, hours }}
    />
  );
}

async function Quotes({ detail }: { detail: JobDetail }) {
  const office = await getOffice();
  const [quotes, account, origin, company, priceBook] = await Promise.all([
    getQuotes(office, detail.job.id),
    office.isOwner ? getPaymentAccount(office) : Promise.resolve(null),
    siteOrigin(),
    getCompany(office),
    listConfig<PriceBookItem>(office, "price_book_item"),
  ]);
  const settings = company.settings as Partial<CompanySettings>;
  const live = priceBook.filter((i) => i.active);
  const typeKey = (componentId: string | null | undefined) => {
    const comp = detail.components.find((c) => c.id === componentId);
    return comp ? detail.componentTypes.get(comp.component_type_id)?.key : undefined;
  };
  const findings = detail.findings
    .filter((f) => f.status !== "repaired")
    .map((f) => ({
      id: f.id,
      title: f.title,
      items: suggestItems(live, typeKey(f.job_component_id)).map((i) => ({
        id: i.id,
        name: i.name,
        price_cents: i.price_cents,
      })),
    }));
  const hasDraft = quotes.some((q) => q.status === "draft");
  const hasAccepted = quotes.some((q) => q.status === "accepted");
  return (
    <div className="space-y-4">
      {office.isOwner && !account?.charges_enabled && quotes.some((q) => q.status !== "draft") ? (
        <Notice tone="warning">
          Customers can accept quotes but can’t pay deposits online until payments are set up.{" "}
          <Link href="/settings/payments" className="font-semibold text-link underline">
            Set up payments
          </Link>
        </Notice>
      ) : null}
      {!hasDraft && !hasAccepted ? <StartQuote jobId={detail.job.id} /> : null}
      {quotes.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {quotes.map((q) => (
            <QuotePanel key={q.id} quote={q} jobId={detail.job.id} origin={origin}>
              {q.status === "draft" ? (
                <QuoteBuilder
                  quote={q}
                  findings={findings}
                  priceBook={live.map((i) => ({
                    id: i.id,
                    name: i.name,
                    price_cents: i.price_cents,
                  }))}
                  settings={{
                    tax_rate_bps: settings.tax_rate_bps ?? 0,
                    deposit: settings.deposit ?? {
                      type: "percent",
                      value_bps: 0,
                      minimum_cents: 0,
                    },
                    tech_discount_limit_bps: settings.tech_discount_limit_bps ?? 0,
                  }}
                  isOwner={office.isOwner}
                />
              ) : null}
            </QuotePanel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const INVOICEABLE = ["in_progress", "report_sent", "quote_sent", "quote_accepted", "invoiced"];

async function Invoices({ detail }: { detail: JobDetail }) {
  const office = await getOffice();
  const { job } = detail;
  const [invoices, company, origin] = await Promise.all([
    // Until the invoices migration reaches a database, the rest of the page still works.
    getInvoices(office, job.id).catch(() => null),
    getCompany(office),
    siteOrigin(),
  ]);
  if (!invoices) {
    return <Notice tone="warning">Invoicing isn’t available until the database is updated.</Notice>;
  }
  const current = invoices.find((i) => i.status !== "void");
  const voided = invoices.filter((i) => i.status === "void");
  const rate = Number((company.settings as { tax_rate_bps?: number }).tax_rate_bps ?? 0);
  return (
    <div className="space-y-4">
      {current ? (
        <div className="max-w-3xl">
          <InvoicePanel
            invoice={current}
            jobId={job.id}
            origin={origin}
            taxRateBps={rate}
            customerEmail={job.customer?.email ?? null}
            emailReady={emailConfigured()}
            isOwner={office.isOwner}
          />
        </div>
      ) : INVOICEABLE.includes(job.status) ? (
        <Card className="max-w-3xl">
          <CreateInvoice
            jobId={job.id}
            hint={
              job.type === "repair"
                ? "Copies the accepted quote and credits the deposit already paid. You can change it before sending."
                : job.fee_cents
                  ? `Bills the detection fee of ${formatCents(job.fee_cents)}. You can add lines before sending.`
                  : "Starts an empty invoice. Add the lines before sending."
            }
          />
        </Card>
      ) : (
        <Empty>Start the job before invoicing it.</Empty>
      )}
      {voided.length ? (
        <p className="text-[15px] text-text-muted">
          Voided:{" "}
          {voided.map((i) => `#${i.number ?? ""} (${formatCents(i.total_cents)})`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

async function Timeline({ detail, tz }: { detail: JobDetail; tz: string }) {
  const office = await getOffice();
  const ids = [
    detail.job.id,
    ...detail.components.map((c) => c.id),
    ...[...detail.results.values()].map((r) => r.id),
    ...detail.tests.map((t) => t.id),
    ...detail.findings.map((f) => f.id),
    ...detail.media.map((m) => m.id),
  ];
  const [rows, team] = await Promise.all([auditFor(office, ids), getTeam(office)]);
  const componentLabel = new Map(detail.components.map((c) => [c.id, c.label]));
  const resultComponent = new Map(
    [...detail.results.values()].map((r) => [r.id, componentLabel.get(r.job_component_id)]),
  );
  const testName = new Map(
    detail.tests.map((t) => [t.id, detail.testTypes.get(t.test_type_id)?.name]),
  );
  const findingTitle = new Map(detail.findings.map((f) => [f.id, f.title]));
  const events = timeline(rows, (table, rowId) =>
    table === "job_component"
      ? componentLabel.get(rowId)
      : table === "checklist_item_result"
        ? resultComponent.get(rowId)
        : table === "test_result"
          ? testName.get(rowId)
          : table === "finding"
            ? findingTitle.get(rowId)
            : undefined,
  );
  if (events.length === 0) return <Empty>No changes recorded yet.</Empty>;
  const who = new Map(team.map((t) => [t.user_id, t.name]));
  return (
    <ol className="space-y-2 border-l-2 border-border pl-4">
      {events.slice(0, 200).map((e, i) => (
        <li key={i}>
          <span className="font-medium">{e.text}</span>
          <span className="text-[15px] text-text-muted">
            {" "}
            · {e.userId ? (who.get(e.userId) ?? "Teammate") : "System"} ·{" "}
            {formatSchedule(e.at, new Date(), tz)}
          </span>
        </li>
      ))}
    </ol>
  );
}
