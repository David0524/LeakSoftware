import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  JOB_TYPE_LABELS,
  MEDIA_KIND_LABELS,
  POOL_TYPE_LABELS,
  SIGNATURE_PURPOSE_LABELS,
  checklistTally,
  REPAIR_ITEM_KEY,
  REPAIR_ITEM_LABEL,
  cleaningCadence,
  cleaningCountdown,
  cleaningKind,
  formatDay,
  localDate,
  enabledSignaturePurposes,
  componentApplies,
  formatCents,
  formatAddress,
  propertyLocation,
  formatDuration,
  formatSchedule,
  parseMarkup,
  suggestItems,
  timeline,
  type CompanySettings,
  type PriceBookItem,
  type Media,
  seesAllJobs,
  dateFormat,
  jobFeeLabel,
} from "@leakbook/core";
import { CustomerLinks } from "@/components/customer-links";
import { DiagramPanel } from "@/components/diagram-work";
import { GalleryImage } from "@/components/gallery-image";
import { Thread } from "@/components/inbox";
import { CleaningIcon, MailIcon, MessageIcon, PhoneIcon } from "@/components/icons";
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
import {
  Card,
  Empty,
  Grouped,
  Notice,
  PageHeader,
  Row,
  StatusBadge,
  iconButtonClass,
  ButtonLink,
} from "@/components/ui";
import { getOffice } from "@/lib/auth";
import {
  auditFor,
  getCompany,
  getInvoices,
  getJob,
  getPaymentAccount,
  getPlanCleanings,
  getQuotes,
  getReports,
  getSignatures,
  listConfig,
  getTeam,
  signedMediaUrls,
  type JobDetail,
} from "@/lib/data";
import { getCustomerThread, getLine } from "@/lib/messages";
import { siteOrigin } from "@/lib/origin";
import { CreateInvoice, InvoicePanel } from "@/components/invoice-panel";
import { QuoteBuilder, StartQuote } from "@/components/quote-builder";
import { QuotePanel } from "@/components/quote-panel";
import { RemoveSignature } from "@/components/remove-signature";
import { ReportPanel } from "@/components/report-panel";
import { AddressLink } from "@/components/open-in-maps";
import { JobSchedule } from "@/components/schedule-form";
import { emailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Job · Sundeck Pro" };

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const office = await getOffice();
  // Start the Wrap-Up panels' queries now, alongside the job: they need only its id, and
  // each used to wait for the whole job to load first. The panels pick up these requests.
  const quiet = (p: Promise<unknown>) => p.catch(() => {});
  quiet(getReports(office, id));
  quiet(getSignatures(office, id));
  quiet(getInvoices(office, id));
  quiet(getQuotes(office, id));
  quiet(listConfig(office, "price_book_item"));
  if (office.isManager) quiet(getPaymentAccount(office));
  const [detail, company, line] = await Promise.all([
    getJob(office, id),
    getCompany(office),
    getLine(office),
  ]);
  if (!detail) notFound();
  const { job } = detail;
  const tz = office.company.timezone;
  const tally = checklistTally(detail.components, [...detail.results.values()]);
  const total = detail.components.length;
  const questions = (company.settings as Partial<CompanySettings>).intake_questions ?? [];
  // With a company number, texts go out from it (Messages), not this device.
  const texting = line?.status === "active";
  const answers = [
    // When They Call on a repair (owner, 2026-10-19): what the customer needs.
    { q: { key: REPAIR_ITEM_KEY, label: REPAIR_ITEM_LABEL }, a: job.intake?.[REPAIR_ITEM_KEY] },
    ...questions.map((q) => ({ q, a: job.intake?.[q.key] })),
  ].filter(({ a }) => (Array.isArray(a) ? a.length > 0 : !!a));

  return (
    <>
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title={job.number ? `Job #${job.number}` : "New Job"}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={job.status} />
            {job.service_plan_id && job.customer ? (
              <Link
                href={`/customers/${job.customer.id}`}
                className="text-link underline-offset-4 hover:underline"
              >
                {JOB_TYPE_LABELS[job.type]} plan
              </Link>
            ) : (
              <span>{JOB_TYPE_LABELS[job.type]}</span>
            )}
            <span>
              {job.started_at && job.status === "in_progress"
                ? `Started ${formatSchedule(job.started_at, new Date(), tz)}`
                : formatSchedule(job.scheduled_start ?? null, new Date(), tz)}
            </span>
          </span>
        }
        actions={<JobStatusActions jobId={job.id} status={job.status} jobType={job.type} />}
      />

      <JobSections
        sections={[
          {
            id: "details",
            label: "Details",
            content: (
              <>
                {/* iOS Settings-style groups: customer, pool, and who's on it (two columns
                    on wide screens), then the On Site form. */}
                <div className="grid items-start gap-x-6 gap-y-6 lg:grid-cols-2">
                  <div className="space-y-6">
                    <Grouped title="Customer">
                      {job.customer ? (
                        <Row
                          href={`/customers/${job.customer.id}`}
                          label={<span className="font-semibold">{job.customer.name}</span>}
                        />
                      ) : (
                        <Row label="No customer" />
                      )}
                      <ContactRow
                        name={job.customer?.name ?? "the customer"}
                        phone={job.customer?.phone}
                        email={job.customer?.email}
                        textHref={
                          texting && job.customer
                            ? `/messages/new?customer=${job.customer.id}&job=${job.id}`
                            : undefined
                        }
                      />
                    </Grouped>

                    {job.customer ? (
                      <Suspense fallback={null}>
                        <JobMessages
                          customer={job.customer}
                          jobId={job.id}
                          texting={texting}
                          tz={tz}
                        />
                      </Suspense>
                    ) : null}

                    <Suspense fallback={null}>
                      <CustomerLinks jobId={job.id} tz={tz} />
                    </Suspense>

                    {job.property ? (
                      <Grouped title="Pool">
                        <Row
                          label={
                            <AddressLink
                              address={formatAddress(job.property)}
                              location={propertyLocation(job.property)}
                            />
                          }
                          detail={[
                            job.property.pool_type
                              ? POOL_TYPE_LABELS[job.property.pool_type]
                              : null,
                            job.property.has_spa ? "Pool and spa" : "Pool",
                            job.property.approx_gallons
                              ? `${job.property.approx_gallons.toLocaleString("en-US")} gallons`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                        {job.property.access_notes ? (
                          <Row>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[0.9375rem] text-text-muted">Access</span>
                              <span className="block">{job.property.access_notes}</span>
                            </span>
                          </Row>
                        ) : null}
                      </Grouped>
                    ) : null}

                    <Grouped title="Assigned to">
                      <Row label="Tech" value={job.techName ?? "Nobody yet"} />
                      {job.secondTechName ? <Row label="With" value={job.secondTechName} /> : null}
                      {job.fee_cents != null ? (
                        <Row
                          label={jobFeeLabel(job.type)}
                          value={<span className="tabular-nums">{formatCents(job.fee_cents)}</span>}
                        />
                      ) : null}
                    </Grouped>

                    {answers.length ? (
                      <Grouped
                        title={job.type === "repair" ? "When they called" : "When they booked"}
                      >
                        {answers.map(({ q, a }) => (
                          <Row key={q.key}>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[0.9375rem] text-text-muted">
                                {q.label}
                              </span>
                              <span className="block">{Array.isArray(a) ? a.join(", ") : a}</span>
                            </span>
                          </Row>
                        ))}
                      </Grouped>
                    ) : null}
                  </div>

                  <section aria-labelledby="on-site">
                    <h2
                      id="on-site"
                      className="mb-2 font-sans text-[0.8125rem] font-normal text-text-muted uppercase"
                    >
                      On Site
                    </h2>
                    <JobDetailsForm
                      jobId={job.id}
                      jobType={job.type}
                      fee={job.fee_cents ?? null}
                      locationMarked={job.location_marked ?? false}
                      notes={job.summary_notes ?? ""}
                    />
                  </section>
                </div>

                {job.type === "repair" || ["unscheduled", "scheduled"].includes(job.status) ? (
                  <section className="mt-8 max-w-2xl" aria-labelledby="schedule">
                    <h2
                      id="schedule"
                      className="mb-2 font-sans text-[0.8125rem] font-normal text-text-muted uppercase"
                    >
                      Schedule
                    </h2>
                    <Schedule detail={detail} tz={tz} />
                  </section>
                ) : null}

                {office.isManager ? (
                  <section className="mt-6" aria-labelledby="timeline">
                    <h2
                      id="timeline"
                      className="mb-2 font-sans text-[0.8125rem] font-normal text-text-muted uppercase"
                    >
                      Timeline
                    </h2>
                    <Timeline detail={detail} tz={tz} />
                  </section>
                ) : null}

                <div className="mt-8">
                  <JobStatusActions jobId={job.id} status={job.status} jobType={job.type} cancel />
                </div>
              </>
            ),
          },
          {
            id: "checklist",
            label: "Checklist",
            badge: tally.pending,
            content: (
              <section aria-labelledby="checklist">
                {/* Chemical first, at the top of the checklist (owner, 2026-10-19). */}
                {job.type === "maintenance" ? (
                  <ButtonLink
                    href={chemicalsHref(job.property, job.id)}
                    kind="secondary"
                    className="mb-4"
                  >
                    Chemical
                  </ButtonLink>
                ) : null}
                {job.type === "maintenance" && job.service_plan_id ? (
                  <Suspense fallback={null}>
                    <Cleanings detail={detail} tz={tz} />
                  </Suspense>
                ) : null}
                <h2 id="checklist" className="font-display text-2xl font-bold">
                  Checklist
                </h2>
                <p className="mb-3 text-text-muted">
                  {total === 0
                    ? "No checklist yet."
                    : (job.type === "maintenance"
                        ? [
                            `${tally.pass} done`,
                            `${tally.attention} need attention`,
                            `${tally.notApplicable} skipped`,
                            `${tally.pending} to do`,
                          ]
                        : [
                            `${tally.pass} not leaking`,
                            `${tally.attention} attention`,
                            `${tally.leaking} leaking`,
                            `${tally.notApplicable} not applicable`,
                            `${tally.pending} to do`,
                          ]
                      ).join(" · ")}
                </p>
                {detail.components.length > 0 ? (
                  <Checklist detail={detail} />
                ) : (
                  <SetUpChecklist jobId={job.id} />
                )}
              </section>
            ),
          },
          // Tests and findings are leak detection; a pool service visit has none.
          ...(job.type === "maintenance"
            ? []
            : [
                {
                  id: "findings",
                  label: "Findings",
                  content: (
                    <>
                      {job.property ? (
                        <section className="mb-8" aria-labelledby="pool-diagram">
                          <h2 id="pool-diagram" className="mb-3 font-display text-2xl font-bold">
                            Pool Diagram
                          </h2>
                          <Diagram detail={detail} />
                        </section>
                      ) : null}
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
              ]),
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
                <section aria-labelledby="reports">
                  <h2 id="reports" className="mb-3 font-display text-2xl font-bold">
                    Report and Sign-Off
                  </h2>
                  <Reports detail={detail} />
                </section>

                <section className="mt-8" aria-labelledby="signatures">
                  <h2 id="signatures" className="mb-3 font-display text-2xl font-bold">
                    Signatures
                  </h2>
                  <Signatures detail={detail} tz={tz} />
                </section>

                {job.type === "detection" || job.type === "maintenance" ? (
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
        fromPlan: !!c.plan_cleaning_id,
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
        (t.job_type ?? "detection") ===
          (detail.job.type === "maintenance" ? "maintenance" : "detection") &&
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
        property
          ? {
              shape: property.diagram_shape ?? null,
              hasSpa: property.has_spa,
              layout: property.diagram_layout,
              propertyId: property.id,
            }
          : null
      }
    />
  );
}

/**
 * The plan's filter and salt cell cleanings (owner, 2026-10-19): how long until each is due
 * from this visit, called out from a week before, with whether it's on this visit's list.
 */
async function Cleanings({ detail, tz }: { detail: JobDetail; tz: string }) {
  const office = await getOffice();
  const cleanings = await getPlanCleanings(office, [detail.job.service_plan_id!]).catch(() => []);
  if (cleanings.length === 0) return null;
  const visitDay = detail.job.plan_date ?? localDate(new Date(), tz);
  const onVisit = new Set(detail.components.map((c) => c.plan_cleaning_id).filter(Boolean));
  return (
    <Grouped title="Regular cleanings" className="mb-6 max-w-2xl">
      {cleanings.map((c) => {
        const due = cleaningCountdown(c.next_due, visitDay);
        return (
          <Row
            key={c.id}
            icon={<CleaningIcon kind={cleaningKind(c.type ?? {})} />}
            label={c.type?.name ?? "Cleaning"}
            detail={
              onVisit.has(c.id)
                ? "On this visit’s checklist"
                : `${cleaningCadence(c.every_months)} · next ${formatDay(c.next_due)}`
            }
            value={
              <span className={due.soon ? "font-semibold text-status-warning" : undefined}>
                {onVisit.has(c.id) ? "Today" : due.label}
              </span>
            }
          />
        );
      })}
    </Grouped>
  );
}

/** The pool's drawing with the findings' pins and the job's markup (owner, 2026-10-19). */
function Diagram({ detail }: { detail: JobDetail }) {
  const property = detail.job.property!;
  return (
    <DiagramPanel
      jobId={detail.job.id}
      propertyId={property.id}
      shape={property.diagram_shape ?? null}
      hasSpa={property.has_spa}
      layout={property.diagram_layout}
      markup={parseMarkup(detail.job.diagram_markup).shapes}
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
              <li key={m.id} className="overflow-hidden card">
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
                <div className="p-3 text-[0.9375rem]">
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
          None yet. The customer signs at the end of the report: write the draft, then Review with
          Customer.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {signatures.map((s) => {
            const url = s.image_path ? urls.get(s.image_path) : undefined;
            return (
              <li key={s.id} className="card p-4">
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
                <p className="text-[0.9375rem] text-text-muted">
                  {SIGNATURE_PURPOSE_LABELS[s.purpose] ?? s.purpose} ·{" "}
                  {formatSchedule(s.signed_at, new Date(), tz)}
                </p>
                <RemoveSignature id={s.id} jobId={detail.job.id} name={s.signer_name} />
              </li>
            );
          })}
        </ul>
      )}
      {/* Work authorization comes before the work, so it is signed on its own. */}
      <SignatureForm
        jobId={detail.job.id}
        purposes={enabledSignaturePurposes(company.settings).filter(
          (p) => p.value === "work_authorization",
        )}
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
  // One report, the homeowner's (owner, 2026-10-18: "Partner report should be gone").
  const key = "homeowner";
  if (templates.find((t) => t.key === key)?.enabled === false) return null;
  return (
    <div className="grid max-w-3xl gap-5">
      <p className="text-[0.9375rem] text-text-muted">
        Write Draft fills in the report from this job’s checklist, tests, and findings. Read and
        edit it before sending.
      </p>
      <ReportPanel
        jobId={detail.job.id}
        template={key}
        name={templates.find((t) => t.key === key)?.name ?? "Homeowner report"}
        draft={reports.find((r) => r.template_key === key && r.status === "draft") ?? null}
        sent={reports.filter((r) => r.template_key === key && r.status !== "draft")}
        customerEmail={detail.job.customer?.email ?? null}
        emailReady={emailConfigured()}
      />
    </div>
  );
}

async function Schedule({ detail, tz }: { detail: JobDetail; tz: string }) {
  const office = await getOffice();
  const team = await getTeam(office);
  const { job } = detail;
  const local = (iso: string) => {
    const parts = dateFormat("en-CA", {
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
  const seesAll = seesAllJobs(office.company.role, (await getCompany(office)).settings);
  return (
    <JobSchedule
      tech={job.techName ?? "Nobody yet"}
      when={job.scheduled_start ? formatSchedule(job.scheduled_start, new Date(), tz) : null}
      fixed={job.arrival_fixed ?? false}
      jobId={job.id}
      techs={team
        .filter((m) => m.status === "active" && (seesAll || m.user_id === office.user.id))
        .map((m) => ({ value: m.user_id, label: m.name }))}
      allowNobody={seesAll}
      defaults={{
        tech: job.assigned_user_id ?? "",
        date: start.date,
        time: start.time,
        hours,
        fixed: job.arrival_fixed ?? false,
      }}
      canSuggest={job.status === "scheduled" || job.status === "unscheduled"}
    />
  );
}

async function Quotes({ detail }: { detail: JobDetail }) {
  const office = await getOffice();
  const [quotes, account, origin, company, priceBook] = await Promise.all([
    getQuotes(office, detail.job.id),
    office.isManager ? getPaymentAccount(office) : Promise.resolve(null),
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
      {office.isManager && !account?.charges_enabled && quotes.some((q) => q.status !== "draft") ? (
        <Notice tone="warning">
          Customers can accept quotes but can’t pay deposits online until payments are set up.{" "}
          <Link
            href="/settings/payments"
            className="inline-flex min-h-11 items-center font-semibold text-link underline"
          >
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
                  isOwner={office.isManager}
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
            isOwner={office.isManager}
          />
        </div>
      ) : job.type === "maintenance" ? (
        <Empty>
          {job.billed_invoice_id
            ? "This visit is on the customer’s monthly invoice. Find it on the Invoices page."
            : "Finished visits are billed once a month, one invoice per customer, from the Invoices page."}
        </Empty>
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
        <p className="text-[0.9375rem] text-text-muted">
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
  const row = (e: (typeof events)[number], i: number) => (
    <li key={i} className="flex gap-1.5 text-[0.9375rem]" title={e.text}>
      <span className="min-w-0 truncate">{e.text}</span>
      <span className="shrink-0 text-text-muted">
        · {e.userId ? (who.get(e.userId) ?? "Teammate") : "System"} ·{" "}
        {formatSchedule(e.at, new Date(), tz)}
      </span>
    </li>
  );
  // The latest few, newest first; the rest fold away (it ran to dozens of lines).
  const SHOWN = 3;
  const rest = events.slice(SHOWN, 200);
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <ol className="space-y-1">{events.slice(0, SHOWN).map(row)}</ol>
      {rest.length ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-link [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show {rest.length} More</span>
            <span className="hidden group-open:inline">Show Less</span>
          </summary>
          <ol className="space-y-1">{rest.map((e, i) => row(e, i + SHOWN))}</ol>
        </details>
      ) : null}
    </div>
  );
}

/** Chemical for this visit's pool: its gallons fill in and Submit saves to its log. */
function chemicalsHref(pool: { id: string } | null | undefined, jobId: string) {
  const q = new URLSearchParams();
  if (pool) q.set("property", pool.id);
  q.set("job", jobId);
  return `/chemicals?${q}`;
}

/**
 * Texts and calls with the customer on the company number (owner, 2026-10-16: messages
 * belong with the job): the latest few, and the way into the whole conversation.
 */
async function JobMessages({
  customer,
  jobId,
  texting,
  tz,
}: {
  customer: { id: string; name: string; phone?: string | null };
  jobId: string;
  texting: boolean;
  tz: string;
}) {
  const office = await getOffice();
  const [thread, team] = await Promise.all([getCustomerThread(office, customer), getTeam(office)]);
  if (!thread && !texting) return null;
  const names = new Map(team.map((t) => [t.user_id, t.name]));
  return (
    <Grouped title="Messages">
      {thread ? (
        <>
          <li className="px-4 py-3">
            <Thread items={thread.items} names={names} timeZone={tz} />
          </li>
          <Row
            href={`/messages/${thread.conversation.id}`}
            label={
              <span className="text-link">
                {texting ? "Open Conversation" : "See All Messages"}
              </span>
            }
            value={thread.total > thread.items.length ? `${thread.total} in all` : undefined}
          />
        </>
      ) : (
        <Row
          href={`/messages/new?customer=${customer.id}&job=${jobId}`}
          label={<span className="text-link">Text {customer.name}</span>}
          detail="From the company number. Replies show up here and in Messages."
        />
      )}
    </Grouped>
  );
}

/** Call, text, and email as round icon buttons on the right of the customer's number. */
function ContactRow({
  name,
  phone,
  email,
  textHref,
}: {
  name: string;
  phone: string | null | undefined;
  email: string | null | undefined;
  textHref?: string;
}) {
  if (!phone && !email) return null;
  return (
    <Row
      label={phone ?? email}
      detail={phone && email ? email : undefined}
      value={
        <span className="flex gap-2">
          {phone ? (
            <>
              <a
                href={`tel:${phone}`}
                aria-label={`Call ${name}, ${phone}`}
                className={iconButtonClass()}
              >
                <PhoneIcon />
              </a>
              <a
                href={textHref ?? `sms:${phone.replace(/[^\d+]/g, "")}`}
                aria-label={`Text ${name}`}
                className={iconButtonClass()}
              >
                <MessageIcon />
              </a>
            </>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}`}
              aria-label={`Email ${name}, ${email}`}
              className={iconButtonClass()}
            >
              <MailIcon />
            </a>
          ) : null}
        </span>
      }
    />
  );
}
