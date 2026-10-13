import {
  POOL_TYPE_LABELS,
  REPORT_BLOCKS,
  SIGNATURE_PURPOSE_LABELS,
  narrativeTemplate,
  testSummary,
  textOnBrand,
  type FinalSection,
  type PoolType,
  type ReportSnapshot,
  type ReportTemplateKey,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import type { ReactNode } from "react";
import { MarkupOverlay } from "./markup";
import { PoolDiagram } from "./pool-diagram";

// The customer-facing report, rendered from the frozen snapshot and the tech-approved text
// (BUILD_PLAN 6.3). Shop branding, not LeakBook's; LeakBook appears only in the footer.

export interface ReportViewProps {
  templateKey: ReportTemplateKey;
  version: number;
  sentAt: string | null;
  snapshot: ReportSnapshot;
  sections: FinalSection[];
  /** storage path -> signed URL */
  urls: Map<string, string>;
  logoUrl: string | null;
}

const NEUTRAL = tokens.color.neutral;

function formatDate(iso: string | null, timeZone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone }).format(new Date(iso));
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report-block mt-8 break-inside-avoid-page">
      <h2
        className="mb-3 border-b-2 pb-1 font-display text-2xl font-bold"
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
  const labelOf = new Map(s.components.map((c) => [c.id, c.label]));
  const blocks = REPORT_BLOCKS[narrativeTemplate(p.templateKey)];
  const inspected = s.components.filter((c) => c.status === "inspected");
  const excluded = s.components.filter((c) => c.status === "excluded");
  const photos = s.media.filter((m) => m.kind === "photo" && p.urls.has(m.storage_path));
  const title =
    p.templateKey === "partner" ? "Leak Detection Report (Technical)" : "Leak Detection Report";

  const render: Record<string, () => ReactNode> = {
    header: () => (
      <header
        className="report-header -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:mx-0 sm:mt-0 sm:rounded-lg"
        style={{ backgroundColor: brand, color: onBrand }}
      >
        <div className="flex items-center gap-4">
          {p.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={p.logoUrl}
              alt={`${s.company.name} logo`}
              className="max-h-16 max-w-48 rounded bg-paper p-1"
            />
          ) : null}
          <div>
            <p className="font-display text-2xl font-extrabold">{s.company.name}</p>
            <p className="text-[15px] opacity-90">
              {[s.company.phone, s.company.email].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="text-right text-[15px]">
          <p className="font-display text-xl font-bold">{title}</p>
          <p className="opacity-90">
            {formatDate(p.sentAt, tz)}
            {p.version > 1 ? ` · version ${p.version}` : ""}
          </p>
        </div>
      </header>
    ),
    summary: () => (
      <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_260px]">
        <div>
          <h2 className="mb-2 font-display text-2xl font-bold">
            {section("summary")?.title ?? "Summary"}
          </h2>
          <Paragraphs text={section("summary")?.text ?? ""} />
        </div>
        <dl className="rounded-lg border p-4 text-[15px]" style={{ borderColor: NEUTRAL["200"] }}>
          <dt className="text-text-muted">Property</dt>
          <dd className="mb-2 font-medium">{s.property.address}</dd>
          {s.customer ? (
            <>
              <dt className="text-text-muted">Prepared for</dt>
              <dd className="mb-2 font-medium">{s.customer.name}</dd>
            </>
          ) : null}
          <dt className="text-text-muted">Pool</dt>
          <dd className="mb-2">
            {[
              s.property.pool_type ? POOL_TYPE_LABELS[s.property.pool_type as PoolType] : null,
              s.property.has_spa ? "with spa" : null,
            ]
              .filter(Boolean)
              .join(", ") || "Pool"}
          </dd>
          {s.job.tech_name ? (
            <>
              <dt className="text-text-muted">Technician</dt>
              <dd className="mb-2">{s.job.tech_name}</dd>
            </>
          ) : null}
          {s.job.number ? (
            <>
              <dt className="text-text-muted">Job</dt>
              <dd>#{s.job.number}</dd>
            </>
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
                  {f.location_text ? (
                    <span className="block text-[15px]">{f.location_text}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </Block>
    ),
    diagram: () =>
      s.findings.some((f) => f.pin_x != null) ? (
        <section className="report-block mt-6 max-w-xl break-inside-avoid">
          <PoolDiagram
            shape={s.property.diagram_shape as never}
            hasSpa={s.property.has_spa}
            title={`Pool diagram with ${s.findings.length} numbered findings`}
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
    tests: () => (
      <Block title={section("tests")?.title ?? "Test results"}>
        {section("tests")?.text ? <Paragraphs text={section("tests")!.text} /> : null}
        {s.tests.length ? (
          <table className="mt-4 w-full text-left text-[15px]">
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
                  <td className="py-1 pr-3">{t.component_id ? labelOf.get(t.component_id) : ""}</td>
                  <td className="py-1 pr-3">
                    {testSummary(t) ?? Object.values(t.data).filter(Boolean).join(", ")}
                  </td>
                  <td className="py-1 capitalize">
                    {t.outcome === "inconclusive" ? "Unclear" : t.outcome}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Block>
    ),
    coverage: () => (
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
                  <p className="mt-1 text-[15px]">
                    {[where, m.caption].filter(Boolean).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </Block>
      ) : null,
    signature: () =>
      s.signatures.length ? (
        <Block title="Signatures">
          <ul className="grid gap-4 sm:grid-cols-2">
            {s.signatures.map((sig) => (
              <li key={sig.id} className="break-inside-avoid">
                {sig.image_path && p.urls.get(sig.image_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img
                    src={p.urls.get(sig.image_path)}
                    alt={`Signature of ${sig.signer_name}`}
                    className="h-20 w-auto border-b"
                    style={{ borderColor: NEUTRAL["500"] }}
                  />
                ) : null}
                <p className="font-medium">{sig.signer_name}</p>
                <p className="text-[15px]">
                  {SIGNATURE_PURPOSE_LABELS[sig.purpose] ?? sig.purpose} ·{" "}
                  {formatDate(sig.signed_at, tz)}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null,
    footer: () => (
      <footer className="mt-10 border-t pt-4 text-[15px]" style={{ borderColor: NEUTRAL["200"] }}>
        <p>
          {s.company.legal_name ?? s.company.name}
          {s.company.address ? ` · ${s.company.address}` : ""}
        </p>
        <p className="mt-1 text-text-muted">Powered by LeakBook</p>
      </footer>
    ),
  };

  return (
    <article
      className="report lb-light mx-auto max-w-4xl bg-paper p-4 text-text sm:p-8"
      style={{ ["--shop" as string]: brand }}
    >
      {blocks.map((b) => (
        <div key={b}>{render[b]?.()}</div>
      ))}
    </article>
  );
}
