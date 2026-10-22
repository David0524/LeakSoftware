import {
  SAMPLE_TEXT,
  POOL_TYPE_LABELS,
  REPORT_BLOCKS,
  SIGNATURE_PURPOSE_LABELS,
  formatCents,
  leaksNoted,
  narrativeTemplate,
  reportChecklist,
  reportTitle,
  inspectionReport,
  snapshotTally,
  testSummary,
  parseMarkup,
  testOutcomeLabel,
  textOnBrand,
  type FinalSection,
  type PoolType,
  type ReportSnapshot,
  type ReportTemplateKey,
  type VerdictTone,
  dateFormat,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import type { ReactNode } from "react";
import { MarkupOverlay } from "./markup";
import { PoolDiagram } from "./pool-diagram";
import { ContactLine } from "./contact-line";
import { PdfLink } from "./pdf-link";
import { PHONE_CARD, PHONE_GROUP, PHONE_LABEL, PHONE_ROW, PHONE_VALUE } from "./doc-ui";
import { cx } from "./ui";

// The customer-facing report, rendered from the frozen snapshot and the tech-approved text
// (BUILD_PLAN 6.3). Shop branding, not Sundeck Pro's; Sundeck Pro appears only in the footer.

export interface ReportViewProps {
  templateKey: ReportTemplateKey;
  version: number;
  sentAt: string | null;
  snapshot: ReportSnapshot;
  sections: FinalSection[];
  /** storage path -> signed URL */
  urls: Map<string, string>;
  logoUrl: string | null;
  /** The customer page: a Download PDF link in the header band. */
  pdfHref?: string;
}

const NEUTRAL = tokens.color.neutral;
const STATUS = tokens.color.status;

/** Badge colors; the badge text always names the verdict, so color is never the only cue. */
const TONE_COLOR: Record<VerdictTone, string> = {
  pass: STATUS.pass,
  attention: STATUS.warning,
  leaking: STATUS.fail,
  not_applicable: STATUS.excluded,
  pending: NEUTRAL["500"],
};

/**
 * A pool inspection's answers (2026-10-20): Needs attention first, then each section as compact
 * question and answer rows with notes under the answer, then the form's recommendations.
 */
function InspectionCoverage({ report }: { report: ReturnType<typeof inspectionReport> }) {
  return (
    <>
      <Block title="Needs attention">
        {report.needsAttention.length ? (
          <ul>
            {report.needsAttention.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 border-b py-2 break-inside-avoid"
                style={{ borderColor: NEUTRAL["200"] }}
              >
                <span>
                  {r.group ? (
                    <span className="block text-[0.9375rem] text-text-muted">{r.group}</span>
                  ) : null}
                  {r.question}
                  {r.notes ? (
                    <span className="block text-[0.9375rem] text-text-muted">{r.notes}</span>
                  ) : null}
                </span>
                <Badge tone={r.tone}>{r.answer}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing we inspected needs attention.</p>
        )}
      </Block>
      <Block title="What we inspected">
        <div className="report-checklist">
          {report.sections.map((sec) => (
            <div key={sec.section} className="mt-5 first:mt-0">
              <h3 className="font-display text-xl font-bold break-after-avoid">{sec.title}</h3>
              {sec.groups.map((g, i) => (
                <div key={`${g.label ?? ""}-${i}`} className="mt-2">
                  {g.label ? (
                    <p className="mt-3 text-[0.8125rem] font-semibold text-text-muted uppercase">
                      {g.label}
                      {g.notPresent ? " · Not present" : ""}
                    </p>
                  ) : null}
                  <ul className="sm:grid sm:grid-cols-2 sm:gap-x-8">
                    {g.rows.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start justify-between gap-3 border-b py-2 break-inside-avoid"
                        style={{ borderColor: NEUTRAL["200"] }}
                      >
                        <span>
                          {r.question}
                          {r.notes ? (
                            <span className="block text-[0.9375rem] text-text-muted">
                              {r.notes}
                            </span>
                          ) : null}
                        </span>
                        <Badge tone={r.tone}>{r.answer}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Block>
      {report.recommendations.length ? (
        <Block title="Recommendations">
          <ul className="list-disc space-y-1 pl-6">
            {report.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

/** A light wash of a status color, for tile and badge backgrounds (prints with color-adjust). */
function tint(color: string, pct = 12) {
  return `color-mix(in srgb, ${color} ${pct}%, white)`;
}

function Badge({ tone, children }: { tone: VerdictTone; children: ReactNode }) {
  return (
    <span
      // A tinted pill: the verdict's color as text on a light wash of it.
      className="inline-block shrink-0 rounded-full px-2.5 py-0.5 text-[0.875rem] font-semibold whitespace-nowrap"
      style={{ backgroundColor: tint(TONE_COLOR[tone]), color: TONE_COLOR[tone] }}
    >
      {children}
    </span>
  );
}

function Tile({ count, label, tone }: { count: number; label: string; tone: VerdictTone }) {
  return (
    <div
      // A tinted tile in the verdict's color; phones use a gray tile inside the summary card.
      className="rounded-xl bg-(--tile) px-4 py-3 max-sm:bg-bg max-sm:px-3"
      style={{ ["--tile" as string]: tint(TONE_COLOR[tone], 10) }}
    >
      <p className="font-display text-3xl font-extrabold" style={{ color: TONE_COLOR[tone] }}>
        {count}
      </p>
      <p className="font-semibold max-sm:text-[0.9375rem] max-sm:leading-snug">{label}</p>
    </div>
  );
}

function formatDate(iso: string | null, timeZone: string) {
  if (!iso) return "";
  return dateFormat("en-US", { dateStyle: "long", timeZone }).format(new Date(iso));
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cx("report-block mt-8 max-sm:mt-4", PHONE_CARD)}>
      <h2
        // Phones: the section's title heads its card; the shop-color rule is for the PDF.
        // A long section may run onto the next page, but its title stays with its first lines.
        className="mb-3 border-b pb-1 font-display text-2xl font-bold break-after-avoid max-sm:border-b-0 max-sm:pb-0"
        style={{ borderColor: "var(--shop)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

export function ReportView(p: ReportViewProps) {
  const s = p.snapshot;
  const tz = s.company.timezone;
  const brand = s.company.brand_primary;
  const onBrand = textOnBrand(brand, tokens.color.brand.navy, tokens.color.brand.paper);
  const section = (key: string) => p.sections.find((x) => x.key === key);
  // What the tech drew on the diagram (owner, 2026-10-19).
  const diagramMarkup = parseMarkup(s.job.diagram_markup).shapes;
  const labelOf = new Map(s.components.map((c) => [c.id, c.label]));
  const blocks = REPORT_BLOCKS[narrativeTemplate(p.templateKey)];
  const checklist = reportChecklist(s);
  const tally = snapshotTally(s);
  const leaks = leaksNoted(s);
  const techs = [s.job.tech_name, s.job.second_tech_name].filter((x): x is string => !!x);
  const performed = s.job.completed_at ?? s.job.started_at ?? s.job.scheduled_start;
  const inspected = s.components.filter((c) => c.status === "inspected");
  const excluded = s.components.filter((c) => c.status === "excluded");
  const photos = s.media.filter((m) => m.kind === "photo" && p.urls.has(m.storage_path));
  // A pool inspection has its own report: answers by section, what needs attention first.
  const inspection = s.job.type === "inspection" ? inspectionReport(s) : null;
  // A repair job's report is about the work (owner, 2026-10-22); it has no checklist.
  const repair = s.job.type === "repair";
  const title =
    p.templateKey === "partner" ? "Leak Detection Report (Technical)" : reportTitle(s.job.type);

  const render: Record<string, () => ReactNode> = {
    header: () => (
      <>
        <header
          className="report-header -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-4 px-6 py-5 max-sm:px-5 sm:mx-0 sm:mt-0 sm:rounded-lg"
          style={{ backgroundColor: brand, color: onBrand }}
        >
          {/* Phones: the PDF link ends the shop's row; wider, it sits beside the title. */}
          <div className="flex w-full min-w-0 flex-wrap items-center gap-4 max-sm:gap-3 sm:w-auto sm:flex-nowrap">
            {p.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img
                src={p.logoUrl}
                alt={`${s.company.name} logo`}
                className="max-h-14 max-w-48 rounded bg-paper p-1 max-sm:max-w-40"
              />
            ) : null}
            <div className={cx("min-w-0", p.logoUrl && "max-sm:order-last max-sm:basis-full")}>
              <p className="font-display text-2xl font-extrabold">{s.company.name}</p>
              <p className="text-[0.9375rem]">
                <ContactLine phone={s.company.phone} email={s.company.email} />
              </p>
            </div>
            {p.pdfHref ? (
              <PdfLink href={p.pdfHref} className="ml-auto inline-flex sm:hidden" />
            ) : null}
          </div>
          <div className="flex items-center gap-4 sm:ml-auto">
            <div className="text-left text-[0.9375rem] sm:text-right">
              <h1 className="font-display text-xl font-bold">{title}</h1>
              <p>
                {p.sentAt ? formatDate(p.sentAt, tz) : "Draft"}
                {p.version > 1 ? ` · version ${p.version}` : ""}
              </p>
            </div>
            {p.pdfHref ? <PdfLink href={p.pdfHref} className="hidden sm:inline-flex" /> : null}
          </div>
        </header>
        {/* The sample job's report says so, on screen and in the PDF (owner, 2026-10-22). */}
        {s.job.sample ? (
          <p
            role="note"
            data-testid="sample-report-banner"
            className="mt-4 rounded-2xl bg-status-warning/15 px-4 py-3 text-[0.9375rem] font-semibold"
          >
            {SAMPLE_TEXT.reportBanner}
          </p>
        ) : null}
      </>
    ),

    summary: () => (
      // Wider and printed: the job details as a strip under the header, then the summary at full
      // width. Phones: the summary card first, then the details as grouped rows.
      <section className="mt-6 flex flex-col gap-6 max-sm:gap-4">
        <div className={PHONE_CARD}>
          <h2 className="mb-2 font-display text-2xl font-bold">
            {section("summary")?.title ?? "Summary"}
          </h2>
          <Paragraphs text={section("summary")?.text ?? ""} />
          {checklist ? (
            <div className="report-tally mt-5 grid grid-cols-3 gap-3">
              <Tile
                count={tally.pass}
                label={tally.pass === 1 ? "Item Passes" : "Items Pass"}
                tone="pass"
              />
              <Tile
                count={tally.attention}
                label={tally.attention === 1 ? "Needs Attention" : "Need Attention"}
                tone="attention"
              />
              <Tile count={tally.leaking} label="Leaking" tone="leaking" />
            </div>
          ) : null}
        </div>
        <dl
          // Phones: an iOS grouped list of label and value rows. From sm up, and on the PDF, a
          // three-column strip on a light gray panel.
          className={cx(
            "grid grid-cols-3 gap-x-6 gap-y-3 rounded-xl bg-neutral-50 px-5 py-4 text-[0.9375rem] sm:order-first",
            "max-sm:block max-sm:bg-transparent max-sm:p-0 max-sm:text-[1.0625rem]",
            PHONE_GROUP,
          )}
        >
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Property</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>{s.property.address}</dd>
          </div>
          {s.customer ? (
            <div className={PHONE_ROW}>
              <dt className={cx("text-text-muted", PHONE_LABEL)}>Prepared for</dt>
              <dd className={cx("font-medium", PHONE_VALUE)}>{s.customer.name}</dd>
            </div>
          ) : null}
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Pool</dt>
            <dd className={PHONE_VALUE}>
              {[
                s.property.pool_type ? POOL_TYPE_LABELS[s.property.pool_type as PoolType] : null,
                s.property.has_spa ? "with spa" : null,
              ]
                .filter(Boolean)
                .join(", ") || "Pool"}
            </dd>
          </div>
          {performed && (checklist || repair) ? (
            <div className={PHONE_ROW}>
              <dt className={cx("text-text-muted", PHONE_LABEL)}>Date performed</dt>
              <dd className={PHONE_VALUE}>{formatDate(performed, tz)}</dd>
            </div>
          ) : null}
          {techs.length ? (
            <div className={PHONE_ROW}>
              <dt className={cx("text-text-muted", PHONE_LABEL)}>
                {techs.length > 1 ? "Technicians" : "Technician"}
              </dt>
              <dd className={PHONE_VALUE}>{techs.join(" and ")}</dd>
            </div>
          ) : null}
          {s.job.fee_cents != null ? (
            <div className={PHONE_ROW}>
              <dt className={cx("text-text-muted", PHONE_LABEL)}>
                {inspection || repair ? "Price" : "Leak detection fee"}
              </dt>
              <dd className={PHONE_VALUE}>{formatCents(s.job.fee_cents)}</dd>
            </div>
          ) : null}
          {s.job.number ? (
            <div className={PHONE_ROW}>
              <dt className={cx("text-text-muted", PHONE_LABEL)}>Job</dt>
              <dd className={PHONE_VALUE}>#{s.job.number}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    ),
    findings: () => (
      <Block title={section("findings")?.title ?? "Findings"}>
        {section("findings")?.text ? <Paragraphs text={section("findings")!.text} /> : null}
        {s.findings.length ? (
          <ol className="mt-4 space-y-2">
            {s.findings.map((f, i) => (
              <li key={f.id} className="flex gap-3 break-inside-avoid">
                <span
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display font-bold"
                  style={{
                    backgroundColor: f.severity_color,
                    color: textOnBrand(f.severity_color),
                  }}
                >
                  {i + 1}
                </span>
                <span>
                  <strong>{f.title}</strong> · {f.severity_name}
                  {f.component_id ? ` · ${labelOf.get(f.component_id)}` : ""}
                  {f.status === "repaired" ? " · Repaired on site" : ""}
                  {f.location_text ? (
                    <span className="block text-[0.9375rem]">{f.location_text}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </Block>
    ),
    diagram: () =>
      s.findings.some((f) => f.pin_x != null) || diagramMarkup.length ? (
        <section
          className={cx(
            "report-block mx-auto mt-6 break-inside-avoid max-sm:mt-4 sm:max-w-sm print:mt-4 print:max-w-xs",
            PHONE_CARD,
          )}
        >
          <PoolDiagram
            className="w-full"
            shape={s.property.diagram_shape as never}
            hasSpa={s.property.has_spa}
            layout={s.property.diagram_layout}
            markup={diagramMarkup}
            title={`Pool diagram with ${s.findings.length} numbered findings${diagramMarkup.length ? " and markings" : ""}`}
            pins={s.findings
              .map((f, i) => ({ f, n: i + 1 }))
              .filter(({ f }) => f.pin_x != null && f.pin_y != null)
              .map(({ f, n }) => ({
                id: f.id,
                x: Number(f.pin_x),
                y: Number(f.pin_y),
                color: f.severity_color,
                label: String(n),
              }))}
          />
        </section>
      ) : null,
    next_steps: () =>
      section("next_steps")?.text ? (
        <Block title={section("next_steps")!.title}>
          <Paragraphs text={section("next_steps")!.text} />
        </Block>
      ) : null,
    tests: () =>
      s.tests.length || section("tests")?.text ? (
        <Block title={section("tests")?.title ?? "Tests we ran"}>
          {section("tests")?.text ? <Paragraphs text={section("tests")!.text} /> : null}
          {s.tests.length ? (
            // Phones: one test per row (name and outcome, then where and the result), since
            // four columns don't fit a phone's width.
            <ul className="mt-4 sm:hidden">
              {s.tests.map((t) => (
                <li
                  key={t.id}
                  className="border-b py-2 break-inside-avoid"
                  style={{ borderColor: NEUTRAL["200"] }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{t.type_name}</span>
                    <Badge tone={testOutcomeLabel(t.outcome).tone}>
                      {testOutcomeLabel(t.outcome).label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[0.9375rem]" style={{ color: NEUTRAL["600"] }}>
                    {[
                      t.component_id ? labelOf.get(t.component_id) : "",
                      testSummary(t) ?? Object.values(t.data).filter(Boolean).join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {s.tests.length ? (
            <div className="mt-4 overflow-x-auto max-sm:hidden">
              <table className="w-full text-left text-[0.9375rem]">
                <thead>
                  <tr className="border-b" style={{ borderColor: NEUTRAL["300"] }}>
                    <th className="py-1 pr-3 font-semibold">Test</th>
                    <th className="py-1 pr-3 font-semibold">Where</th>
                    <th className="py-1 pr-3 font-semibold">Result</th>
                    <th className="py-1 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {s.tests.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b break-inside-avoid"
                      style={{ borderColor: NEUTRAL["200"] }}
                    >
                      <td className="py-1 pr-3">{t.type_name}</td>
                      <td className="py-1 pr-3">
                        {t.component_id ? labelOf.get(t.component_id) : ""}
                      </td>
                      <td className="py-1 pr-3">
                        {testSummary(t) ?? Object.values(t.data).filter(Boolean).join(", ")}
                      </td>
                      <td className="py-1">
                        <Badge tone={testOutcomeLabel(t.outcome).tone}>
                          {testOutcomeLabel(t.outcome).label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Block>
      ) : null,
    coverage: () =>
      repair && !s.components.length ? null : inspection ? (
        <InspectionCoverage report={inspection} />
      ) : checklist ? (
        <Block title="What we checked">
          <div className="report-checklist">
            {checklist.map((sec) => (
              <div key={sec.section} className="mt-4 first:mt-0">
                <h3 className="font-display text-xl font-bold break-after-avoid">{sec.title}</h3>
                <ul className="mt-1 sm:grid sm:grid-cols-2 sm:gap-x-8">
                  {sec.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 border-b py-2 break-inside-avoid"
                      style={{ borderColor: NEUTRAL["200"] }}
                    >
                      <span>
                        {item.label}
                        {item.where || item.reason ? (
                          <span className="block text-[0.9375rem] text-text-muted">
                            {item.where ?? item.reason}
                          </span>
                        ) : null}
                      </span>
                      <Badge tone={item.tone}>{item.verdict}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4">
            <strong>Leaks noted:</strong> {leaks.length ? leaks.join(", ") : "None"}.
          </p>
        </Block>
      ) : (
        <Block title="What we checked">
          <p>
            Inspected:{" "}
            {inspected
              .map((c) => (c.method ? `${c.label} (${c.method.toLowerCase()})` : c.label))
              .join(", ") || "none"}
            .
          </p>
          {excluded.length ? (
            <div className="mt-3">
              <p className="font-semibold">Not inspected</p>
              <ul className="mt-1 list-disc pl-6">
                {excluded.map((c) => (
                  <li key={c.id}>
                    {c.label}: {c.exclusion_reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Block>
      ),
    photos: () =>
      photos.length ? (
        <Block title="Photos">
          <ul className="grid gap-4 sm:grid-cols-2">
            {photos.map((m) => {
              const w = m.width ?? 4;
              const h = m.height ?? 3;
              const where =
                (m.finding_id && s.findings.find((f) => f.id === m.finding_id)?.title) ||
                (m.component_id && labelOf.get(m.component_id)) ||
                null;
              return (
                <li key={m.id} className="break-inside-avoid">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img
                      src={p.urls.get(m.storage_path)}
                      alt={m.caption ?? `Photo${where ? ` of ${where}` : ""}`}
                      width={w}
                      height={h}
                      className="h-auto w-full rounded"
                    />
                    <MarkupOverlay shapes={m.markup?.shapes ?? []} width={w} height={h} />
                  </div>
                  <p className="mt-1 text-[0.9375rem]">
                    {[where, m.caption].filter(Boolean).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </Block>
      ) : null,
    signature: () =>
      s.signatures.length || s.sign_off?.unsigned_reason ? (
        <Block title="Signatures">
          {s.signatures.length ? (
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {s.signatures.map((sig) => (
                <li key={sig.id} className="break-inside-avoid">
                  {sig.image_path && p.urls.get(sig.image_path) ? (
                    <div className="mb-1 border-b" style={{ borderColor: NEUTRAL["500"] }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                      <img
                        src={p.urls.get(sig.image_path)}
                        alt={`Signature of ${sig.signer_name}`}
                        className="h-20 w-auto"
                      />
                    </div>
                  ) : null}
                  <p className="font-medium">{sig.signer_name}</p>
                  <p className="text-[0.9375rem]">
                    {SIGNATURE_PURPOSE_LABELS[sig.purpose] ?? sig.purpose} ·{" "}
                    {formatDate(sig.signed_at, tz)}
                    {sig.report_version && sig.report_version !== p.version
                      ? ` · signed on version ${sig.report_version}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {s.sign_off?.unsigned_reason ? (
            <p className={s.signatures.length ? "mt-3" : undefined} data-testid="unsigned">
              {s.signatures.length ? "This version was not signed: " : "Not signed: "}
              {s.sign_off.unsigned_reason.charAt(0).toLowerCase() +
                s.sign_off.unsigned_reason.slice(1)}
              .
            </p>
          ) : null}
        </Block>
      ) : null,
    footer: () => (
      <>
        {s.company.disclaimer ? (
          <section
            className="report-disclaimer mt-10 text-[0.9375rem] whitespace-pre-line text-text-muted"
            aria-label="Terms"
          >
            {s.company.disclaimer}
          </section>
        ) : null}
        <footer
          className="mt-10 border-t pt-4 text-[0.9375rem]"
          style={{ borderColor: NEUTRAL["200"] }}
        >
          <p>
            {s.company.legal_name ?? s.company.name}
            {s.company.address ? ` · ${s.company.address}` : ""}
          </p>
          <p className="mt-1 text-text-muted">Powered by Sundeck Pro</p>
        </footer>
      </>
    ),
  };

  return (
    <article
      // Phones: content on cards over the iOS grouped gray; wider and printed, plain paper.
      className="report lb-light mx-auto max-w-4xl bg-paper p-4 text-text max-sm:bg-bg sm:p-8"
      style={{ ["--shop" as string]: brand }}
    >
      {blocks.map((b) => (
        <div key={b}>{render[b]?.()}</div>
      ))}
    </article>
  );
}
