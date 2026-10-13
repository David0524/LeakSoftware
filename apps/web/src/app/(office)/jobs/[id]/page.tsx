import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CHECKLIST_SECTION_LABELS,
  FINDING_STATUS_LABELS,
  JOB_TYPE_LABELS,
  MEDIA_KIND_LABELS,
  POOL_TYPE_LABELS,
  calculate,
  checklistTally,
  formatCents,
  formatAddress,
  formatDuration,
  formatSchedule,
  parseMarkup,
  timeline,
  verdictLabel,
  type ChecklistSection,
  type CompanySettings,
  type Media,
  type Outcome,
} from "@leakbook/core";
import { GalleryImage } from "@/components/gallery-image";
import { PoolDiagram } from "@/components/pool-diagram";
import { Card, Chip, Empty, Notice, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import {
  auditFor,
  getCompany,
  getJob,
  getPaymentAccount,
  getQuotes,
  getReports,
  getTeam,
  signedMediaUrls,
  type JobDetail,
} from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { QuotePanel } from "@/components/quote-panel";
import { ReportPanel } from "@/components/report-panel";
import { ScheduleForm } from "@/components/schedule-form";
import { emailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Job · LeakBook" };

const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-status-pass" },
  fail: { label: "Fail", className: "bg-status-fail" },
  inconclusive: { label: "Unclear", className: "bg-status-warning" },
};

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
      />

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
                  job.property.pool_type ? POOL_TYPE_LABELS[job.property.pool_type] : null,
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
          {job.fee_cents != null || job.location_marked != null ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3">
              {job.fee_cents != null ? (
                <>
                  <dt className="text-text-muted">Detection fee</dt>
                  <dd>{formatCents(job.fee_cents)}</dd>
                </>
              ) : null}
              {job.location_marked != null ? (
                <>
                  <dt className="text-text-muted">Location marked</dt>
                  <dd>{job.location_marked ? "Yes" : "No"}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {job.summary_notes ? (
            <>
              <SectionTitle>
                <span className="mt-4 block">Job notes</span>
              </SectionTitle>
              <p className="whitespace-pre-line">{job.summary_notes}</p>
            </>
          ) : null}
        </Card>
      </div>

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

      <section className="mt-8" aria-labelledby="checklist">
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
        {detail.components.length > 0 ? <Checklist detail={detail} /> : null}
      </section>

      <section className="mt-8" aria-labelledby="tests">
        <h2 id="tests" className="mb-3 font-display text-2xl font-bold">
          Tests
        </h2>
        {detail.tests.length === 0 ? (
          <Empty>No tests recorded.</Empty>
        ) : (
          <Tests detail={detail} tz={tz} />
        )}
      </section>

      <section className="mt-8" aria-labelledby="findings">
        <h2 id="findings" className="mb-3 font-display text-2xl font-bold">
          Findings
        </h2>
        <Findings detail={detail} />
      </section>

      <section className="mt-8" aria-labelledby="media">
        <h2 id="media" className="mb-3 font-display text-2xl font-bold">
          Photos and Recordings
        </h2>
        <Gallery detail={detail} tz={tz} />
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

      {office.isOwner ? (
        <section className="mt-8" aria-labelledby="timeline">
          <h2 id="timeline" className="mb-3 font-display text-2xl font-bold">
            Timeline
          </h2>
          <Timeline detail={detail} tz={tz} />
        </section>
      ) : null}
    </>
  );
}

const VERDICT_CLASS = {
  pass: "bg-status-pass",
  attention: "bg-status-warning",
  leaking: "bg-status-fail",
  not_applicable: "bg-status-excluded",
  pending: "bg-text-muted",
} as const;

function Checklist({ detail }: { detail: JobDetail }) {
  const sectionOf = (componentTypeId: string): ChecklistSection =>
    detail.componentTypes.get(componentTypeId)?.section ?? "other";
  const sections = (Object.keys(CHECKLIST_SECTION_LABELS) as ChecklistSection[])
    .map((section) => ({
      section,
      rows: detail.components.filter((c) => sectionOf(c.component_type_id) === section),
    }))
    .filter((x) => x.rows.length > 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-left">
        <thead className="border-b border-border text-[15px] text-text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Component
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Result
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Where, how, or why not
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Notes
            </th>
          </tr>
        </thead>
        {sections.map(({ section, rows }) => (
          <tbody key={section}>
            <tr className="border-b border-border bg-bg">
              <th scope="colgroup" colSpan={4} className="px-4 py-2 font-display font-bold">
                {CHECKLIST_SECTION_LABELS[section]}
              </th>
            </tr>
            {rows.map((c) => {
              const r = detail.results.get(c.id);
              const status = r?.status ?? "pending";
              const answer = detail.componentTypes.get(c.component_type_id)?.answer;
              const tone =
                status === "pending"
                  ? "pending"
                  : status === "excluded"
                    ? "not_applicable"
                    : r?.outcome === "leaking"
                      ? "leaking"
                      : r?.outcome === "attention"
                        ? "attention"
                        : "pass";
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{c.label}</td>
                  <td className="px-4 py-2">
                    <Chip label={verdictLabel(r, answer)} className={VERDICT_CLASS[tone]} />
                  </td>
                  <td className="px-4 py-2">
                    {status === "excluded"
                      ? r?.exclusion_reason
                      : [r?.location_text, r?.method].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{r?.notes}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Tests({ detail, tz }: { detail: JobDetail; tz: string }) {
  const componentLabel = new Map(detail.components.map((c) => [c.id, c.label]));
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {detail.tests.map((t) => {
        const type = detail.testTypes.get(t.test_type_id);
        const calc = type ? calculate(type, t.data) : null;
        const outcome = t.outcome ? OUTCOME[t.outcome] : null;
        return (
          <li key={t.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{type?.name ?? "Test"}</p>
                <p className="text-[15px] text-text-muted">
                  {[
                    t.job_component_id ? componentLabel.get(t.job_component_id) : null,
                    t.performed_at ? formatSchedule(t.performed_at, new Date(), tz) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {outcome ? <Chip label={outcome.label} className={outcome.className} /> : null}
            </div>
            {calc?.summary ? <p className="mt-2 font-medium">{calc.summary}</p> : null}
            {type && !type.calculator ? (
              <dl className="mt-2 text-[15px]">
                {type.field_schema.fields
                  .filter((f) => t.data[f.key] !== undefined && t.data[f.key] !== "")
                  .map((f) => (
                    <div key={f.key} className="flex gap-2">
                      <dt className="text-text-muted">{f.label}:</dt>
                      <dd>{String(t.data[f.key])}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            {t.notes ? <p className="mt-2 text-[15px]">{t.notes}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function Findings({ detail }: { detail: JobDetail }) {
  const property = detail.job.property;
  if (detail.findings.length === 0) return <Empty>No findings recorded.</Empty>;
  const componentLabel = new Map(detail.components.map((c) => [c.id, c.label]));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {property ? (
        <PoolDiagram
          shape={property.diagram_shape}
          hasSpa={property.has_spa}
          title={`Pool diagram with ${detail.findings.length} finding pins`}
          pins={detail.findings
            .map((f, i) => ({ f, n: i + 1 }))
            .filter(({ f }) => f.pin_x != null && f.pin_y != null)
            .map(({ f, n }) => ({
              id: f.id,
              x: Number(f.pin_x),
              y: Number(f.pin_y),
              color: detail.severities.get(f.severity_key)?.color ?? "currentColor",
              label: String(n),
            }))}
        />
      ) : null}
      <ol className="space-y-3">
        {detail.findings.map((f, i) => {
          const sev = detail.severities.get(f.severity_key);
          return (
            <li key={f.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display font-bold text-paper"
                  style={{ backgroundColor: sev?.color }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-[15px] text-text-muted">
                    {[
                      sev?.name ?? f.severity_key,
                      f.job_component_id ? componentLabel.get(f.job_component_id) : null,
                      FINDING_STATUS_LABELS[f.status],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {f.location_text ? <p className="mt-1">{f.location_text}</p> : null}
                  {f.notes ? <p className="mt-1 text-[15px]">{f.notes}</p> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

async function Gallery({ detail, tz }: { detail: JobDetail; tz: string }) {
  if (detail.media.length === 0) return <Empty>No photos or recordings yet.</Empty>;
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
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {detail.media.map((m) => {
        const url = m.storage_path ? urls.get(m.storage_path) : undefined;
        const markup = parseMarkup(m.markup).shapes;
        const w = m.width ?? 4;
        const h = m.height ?? 3;
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
                {MEDIA_KIND_LABELS[m.kind]} · {attached(m)}
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
            </div>
          </li>
        );
      })}
    </ul>
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
  const [quotes, account, origin] = await Promise.all([
    getQuotes(office, detail.job.id),
    office.isOwner ? getPaymentAccount(office) : Promise.resolve(null),
    siteOrigin(),
  ]);
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
      {quotes.length === 0 ? (
        <Empty>No quotes yet. Techs build quotes from findings in the LeakBook app.</Empty>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {quotes.map((q) => (
            <QuotePanel key={q.id} quote={q} jobId={detail.job.id} origin={origin} />
          ))}
        </div>
      )}
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
