// Reports (BUILD_PLAN 6.2, 6.3): the frozen job snapshot, its facts, the narrative validator,
// and the plain draft written from the facts. No I/O. AI writing was removed (owner,
// 2026-10-18); a draft from any writer is still checked the same way.

import {
  CHECKLIST_SECTION_LABELS,
  calculate,
  verdictLabel,
  type Calculator,
  type ChecklistOutcome,
  type ChecklistSection,
  type ChecklistTally,
  type Outcome,
  type TestData,
  type TestFieldSchema,
} from "./inspection";
import type { Markup } from "./media";
import { contrastRatio } from "./settings";
import {
  INSPECTION_SECTIONS,
  foldedItems,
  inspectionAnswerText,
  inspectionTone,
} from "./pool-inspection";

export type ReportTemplateKey = "homeowner" | "partner";

// ---------------------------------------------------------------------------
// Snapshot: built by the database (app.report_snapshot) from synced rows when a report is
// drafted, frozen when it is sent. Everything a report shows comes from here.
// ---------------------------------------------------------------------------

export interface SnapshotComponent {
  id: string;
  /** checklist_item_result id, when there is one. */
  result_id: string | null;
  label: string;
  type_key: string;
  type_name: string;
  status: "pending" | "inspected" | "excluded";
  method: string | null;
  exclusion_reason: string | null;
  notes: string | null;
  /** M8.5: checklist section, answer kind, verdict, and where. */
  section?: ChecklistSection;
  answer?: "leak" | "yes_no" | "done" | "choice" | "multi" | "text";
  outcome?: ChecklistOutcome | null;
  location_text?: string | null;
  /** Pool inspection questions (2026-10-20): the group, choices, banner, and the answer. */
  group_label?: string | null;
  options?: unknown;
  notice?: string | null;
  value?: unknown;
}

export interface SnapshotTest {
  id: string;
  type_key: string;
  type_name: string;
  calculator: Calculator | null;
  field_schema: TestFieldSchema;
  component_id: string | null;
  data: TestData;
  outcome: Outcome | null;
  performed_at: string | null;
  notes: string | null;
}

export interface SnapshotFinding {
  id: string;
  title: string;
  severity_key: string;
  severity_name: string;
  severity_color: string;
  must_mention: boolean;
  location_text: string | null;
  component_id: string | null;
  pin_x: number | null;
  pin_y: number | null;
  status: string;
  notes: string | null;
}

export interface SnapshotMedia {
  id: string;
  kind: "photo" | "video" | "audio";
  storage_path: string;
  mime_type: string | null;
  caption: string | null;
  markup: Markup | null;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  finding_id: string | null;
  component_id: string | null;
  test_id: string | null;
  transcript: string | null;
}

export interface SnapshotSignature {
  id: string;
  purpose: string;
  signer_name: string;
  signer_role: string | null;
  signed_at: string;
  image_path: string | null;
  /** The report version it was given on (null until a version is finished). */
  report_version?: number | null;
}

/** One piece of a repair job's work: an accepted quote's line, or the item it was booked for. */
export interface SnapshotWork {
  description: string;
  quantity: number;
}

export interface ReportSnapshot {
  company: {
    name: string;
    legal_name: string | null;
    phone: string | null;
    email: string | null;
    address: string;
    logo_path: string | null;
    brand_primary: string;
    brand_secondary: string | null;
    timezone: string;
    /** The shop's legal text, printed at the end of every report. */
    disclaimer?: string | null;
  };
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    cc_emails?: string[];
  } | null;
  property: {
    address: string;
    pool_type: string | null;
    has_spa: boolean;
    diagram_shape: string | null;
    /** The spa's place and the mirror (2026-10-19); see DiagramLayout. */
    diagram_layout?: unknown;
  };
  job: {
    id: string;
    number: number | null;
    type: string;
    started_at: string | null;
    scheduled_start: string | null;
    summary_notes: string | null;
    tech_name: string | null;
    second_tech_name?: string | null;
    completed_at?: string | null;
    /** Detection fee, shown on the report. */
    fee_cents?: number | null;
    /** The shop's sample job (owner, 2026-10-22): the report says it's a sample. */
    sample?: boolean;
    location_marked?: boolean | null;
    /** Markup drawn on the pool diagram (2026-10-19), as media markup. */
    diagram_markup?: unknown;
    /** Booking answers, {question label: answer}. */
    intake?: Record<string, string | string[]> | null;
  };
  components: SnapshotComponent[];
  tests: SnapshotTest[];
  findings: SnapshotFinding[];
  media: SnapshotMedia[];
  signatures: SnapshotSignature[];
  /** Set when this version was finished without a signature, with the tech's reason. */
  sign_off?: { unsigned_reason: string } | null;
  /** All of the company's component types, so the validator can spot invented ones. */
  component_types: { key: string; name: string }[];
  /**
   * A repair job's work (owner, 2026-10-22): the accepted quote's lines, else the price book
   * item it was booked for. Missing on other jobs and on reports frozen before it existed.
   */
  work?: SnapshotWork[] | null;
}

// ---------------------------------------------------------------------------
// Narrative shape
// ---------------------------------------------------------------------------

export interface NarrativeParagraph {
  text: string;
  source_ids: string[];
}

export interface NarrativeSection {
  key: string;
  title: string;
  paragraphs: NarrativeParagraph[];
}

export interface Narrative {
  sections: NarrativeSection[];
}

/** What the tech approved: plain text per section. Only this reaches the customer. */
export interface FinalSection {
  key: string;
  title: string;
  text: string;
}

export const NARRATIVE_SECTIONS: Record<
  "homeowner" | "partner",
  { key: string; title: string; brief: string }[]
> = {
  homeowner: [
    {
      key: "summary",
      title: "Summary",
      brief: "Two to four sentences: whether a leak was found, where, and how sure we are.",
    },
    {
      key: "findings",
      title: "What we found",
      brief:
        "Each finding in plain words: where it is, what it means for the pool, how serious it is.",
    },
    {
      key: "next_steps",
      title: "What happens next",
      brief:
        "The recommended next step for each finding, and anything we could not inspect and why.",
    },
  ],
  partner: [
    {
      key: "summary",
      title: "Summary",
      brief: "Leak status in two to four sentences, technical.",
    },
    {
      key: "findings",
      title: "Findings",
      brief: "Component by component: what failed, where, severity.",
    },
    {
      key: "tests",
      title: "Test results",
      brief: "The tests run and their readings with units; components not inspected and why.",
    },
  ],
};

/**
 * A repair job's report (owner, 2026-10-22: "the autofilled text should relate to the repair
 * work that is being done - not necessarily leaks"). Same keys as the homeowner report, so saved
 * reports and the report page place them the same way.
 */
export const REPAIR_SECTIONS: { key: string; title: string; brief: string }[] = [
  {
    key: "summary",
    title: "Summary",
    brief: "Two to four sentences: the repair work we did, where, and the result.",
  },
  {
    key: "findings",
    title: "What we did",
    brief: "Each piece of work we did, and anything we found and fixed on site.",
  },
  {
    key: "next_steps",
    title: "What happens next",
    brief: "Care after the repair, anything still to do, and when to call us.",
  },
];

export function narrativeTemplate(key: ReportTemplateKey): "homeowner" | "partner" {
  return key === "partner" ? "partner" : "homeowner";
}

/** Plain text for one section, paragraphs separated by blank lines. */
export function sectionText(section: NarrativeSection): string {
  return section.paragraphs.map((p) => p.text.trim()).join("\n\n");
}

export function toFinalSections(narrative: Narrative): FinalSection[] {
  return narrative.sections.map((s) => ({ key: s.key, title: s.title, text: sectionText(s) }));
}

// ---------------------------------------------------------------------------
// Facts for the model: built from the snapshot only (never from client text)
// ---------------------------------------------------------------------------

/** Pass / attention / leaking / not applicable counts from a snapshot. */
export function snapshotTally(s: ReportSnapshot): ChecklistTally {
  const t: ChecklistTally = { pass: 0, attention: 0, leaking: 0, notApplicable: 0, pending: 0 };
  for (const c of s.components) {
    if (c.status === "pending") t.pending += 1;
    else if (c.status === "excluded") t.notApplicable += 1;
    else if (c.outcome === "leaking") t.leaking += 1;
    else if (c.outcome === "attention") t.attention += 1;
    else t.pass += 1;
  }
  return t;
}

/** How a checklist badge reads on the report. */
export type VerdictTone = "pass" | "attention" | "leaking" | "not_applicable" | "pending";

export interface ReportChecklistItem {
  id: string;
  label: string;
  /** Badge text: Not leaking, Leaking, Attention, Not applicable, Yes, No, Not checked. */
  verdict: string;
  tone: VerdictTone;
  where: string | null;
  /** Why it was not applicable, when the tech gave a reason. */
  reason: string | null;
}

export interface ReportChecklistSection {
  section: ChecklistSection;
  title: string;
  items: ReportChecklistItem[];
}

const SECTION_ORDER: ChecklistSection[] = ["visual", "plumbing", "bond_beam", "other"];

/**
 * Every item with its verdict, grouped by section in checklist order (M8.5). Null for
 * snapshots frozen before verdicts existed; those keep the older "what we checked" text.
 */
export function reportChecklist(s: ReportSnapshot): ReportChecklistSection[] | null {
  if (!s.components.some((c) => c.section !== undefined)) return null;
  return SECTION_ORDER.map((section) => ({
    section,
    title: CHECKLIST_SECTION_LABELS[section],
    items: s.components
      .filter((c) => (c.section ?? "other") === section)
      .map((c): ReportChecklistItem => {
        const tone: VerdictTone =
          c.status === "pending"
            ? "pending"
            : c.status === "excluded"
              ? "not_applicable"
              : c.outcome === "leaking"
                ? "leaking"
                : c.outcome === "attention"
                  ? "attention"
                  : "pass";
        return {
          id: c.id,
          label: c.label,
          verdict: tone === "pending" ? "Not checked" : verdictLabel(c, c.answer),
          tone,
          where: c.location_text?.trim() || null,
          reason: c.status === "excluded" ? c.exclusion_reason?.trim() || null : null,
        };
      }),
  })).filter((x) => x.items.length > 0);
}

/** One answered inspection question on the report: the question and its answer. */
export interface InspectionReportRow {
  id: string;
  question: string;
  answer: string;
  tone: VerdictTone;
  notes: string | null;
  /** Its group header ("Filtration System"), for Needs attention. */
  group: string | null;
}

export interface InspectionReportSection {
  section: ChecklistSection;
  title: string;
  groups: { label: string | null; rows: InspectionReportRow[]; notPresent: boolean }[];
}

/**
 * The pool inspection report (2026-10-20): every answered question as a compact row, by section
 * and group; a group whose gate said no reads "Not present" without its folded questions. Needs
 * attention lists the flagged answers first. Recommendations are the form's banners, word for
 * word, for the sections that were answered.
 */
export function inspectionReport(s: Pick<ReportSnapshot, "components">): {
  needsAttention: InspectionReportRow[];
  sections: InspectionReportSection[];
  recommendations: string[];
} {
  const items = s.components.filter((c) => INSPECTION_SECTIONS.includes(c.section ?? "other"));
  const folded = foldedItems(items);
  const row = (c: SnapshotComponent): InspectionReportRow => ({
    id: c.id,
    question: c.label,
    answer:
      inspectionAnswerText(c.answer, c.value) ??
      (c.status === "excluded" ? "Not applicable" : "Answered"),
    tone: inspectionTone(c),
    notes: c.notes?.trim() || null,
    group: c.group_label ?? null,
  });
  const answered = items.filter((c) => c.status !== "pending" && !folded.has(c.id));
  const sections = INSPECTION_SECTIONS.map((section): InspectionReportSection => {
    const here = items.filter((c) => c.section === section);
    const groups: InspectionReportSection["groups"] = [];
    for (const c of here) {
      const label = c.group_label ?? null;
      let g = groups.at(-1);
      if (!g || g.label !== label) {
        g = { label, rows: [], notPresent: false };
        groups.push(g);
      }
      if (folded.has(c.id)) g.notPresent = true;
      else if (c.status !== "pending") g.rows.push(row(c));
    }
    return {
      section,
      title: CHECKLIST_SECTION_LABELS[section],
      groups: groups.filter((g) => g.rows.length > 0),
    };
  }).filter((x) => x.groups.length > 0);
  const shown = new Set(sections.map((x) => x.section));
  return {
    needsAttention: answered
      .filter((c) => c.outcome === "leaking" || c.outcome === "attention")
      .sort((a, b) => (a.outcome === b.outcome ? 0 : a.outcome === "leaking" ? -1 : 1))
      .map(row),
    sections,
    recommendations: [
      ...new Set(
        items
          .filter((c) => c.notice?.trim() && shown.has(c.section ?? "other"))
          .map((c) => c.notice!.trim())
          // A lead-in to the next question ("…vessel structure:") isn't a recommendation.
          .filter((n) => !n.endsWith(":")),
      ),
    ],
  };
}

/** "Leaks noted": the leaking items, with where when the tech gave it. */
export function leaksNoted(s: ReportSnapshot): string[] {
  return s.components
    .filter((c) => c.status === "inspected" && c.outcome === "leaking")
    .map((c) => (c.location_text?.trim() ? `${c.label} (${c.location_text.trim()})` : c.label));
}

export function testSummary(t: SnapshotTest): string | null {
  return calculate({ calculator: t.calculator, field_schema: t.field_schema }, t.data).summary;
}

export function narrativeFacts(s: ReportSnapshot) {
  const labelOf = new Map(s.components.map((c) => [c.id, c.label]));
  return {
    property: {
      address: s.property.address,
      pool_type: s.property.pool_type,
      has_spa: s.property.has_spa,
    },
    tech_notes: s.job.summary_notes,
    checklist: s.components.map((c) => ({
      id: c.result_id ?? c.id,
      component: c.label,
      result: verdictLabel(c, c.answer),
      where: c.location_text ?? null,
      method: c.method,
      reason_not_applicable: c.exclusion_reason,
      notes: c.notes,
    })),
    tests: s.tests.map((t) => ({
      id: t.id,
      type: t.type_name,
      component: t.component_id ? (labelOf.get(t.component_id) ?? null) : null,
      readings: t.data,
      result: testSummary(t),
      outcome: t.outcome,
      notes: t.notes,
    })),
    findings: s.findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity_name,
      must_mention: f.must_mention,
      component: f.component_id ? (labelOf.get(f.component_id) ?? null) : null,
      location: f.location_text,
      status: f.status,
      notes: f.notes,
    })),
    voice_notes: s.media
      .filter((m) => m.kind === "audio" && m.transcript)
      .map((m) => ({ id: m.id, transcript: m.transcript })),
    work: (s.work ?? []).map((w) => ({ description: w.description, quantity: w.quantity })),
  };
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export type NarrativeProblemKind =
  "unknown_source" | "unsupported_number" | "unknown_component" | "missing_finding" | "bad_shape";

export interface NarrativeProblem {
  kind: NarrativeProblemKind;
  /** Section key and paragraph index, when the problem is in a paragraph. */
  section?: string;
  paragraph?: number;
  /** The offending text, for highlighting. */
  match?: string;
  message: string;
}

const NUMBER = /(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])\d+(?:\.\d+)?/g;

function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, "")));
}

/** Every number the report may state: values, counts, and numbers inside labels and notes. */
export function allowedNumbers(s: ReportSnapshot): number[] {
  const out = new Set<number>();
  const visit = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(v);
    else if (typeof v === "string") for (const n of numbersIn(v)) out.add(n);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(narrativeFacts(s));
  // Counts the narrative may reasonably state.
  const count = (n: number) => out.add(n);
  count(s.components.length);
  count(s.components.filter((c) => c.status === "inspected").length);
  count(s.components.filter((c) => c.status === "excluded").length);
  const tally = snapshotTally(s);
  Object.values(tally).forEach(count);
  count(s.tests.length);
  count(s.tests.filter((t) => t.outcome === "fail").length);
  count(s.tests.filter((t) => t.outcome === "pass").length);
  count(s.findings.length);
  const perType = new Map<string, number>();
  for (const c of s.components) perType.set(c.type_key, (perType.get(c.type_key) ?? 0) + 1);
  for (const n of perType.values()) count(n);
  const perTest = new Map<string, number>();
  for (const t of s.tests) perTest.set(t.type_key, (perTest.get(t.type_key) ?? 0) + 1);
  for (const n of perTest.values()) count(n);
  count(1);
  return [...out];
}

/** Numbers that are measurements: only readings, results, and the tech's own words count. */
const MEASUREMENT =
  /(?<![\w.])(\d+(?:\.\d+)?)\s*(?:psi\b|pounds?\b|in\b|inch(?:es)?\b|"|min\b|mins\b|minutes?\b|hours?\b|hrs?\b|h\b)/gi;

export function measurementNumbers(s: ReportSnapshot): number[] {
  const out = new Set<number>();
  const visit = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(v);
    else if (typeof v === "string") for (const n of numbersIn(v)) out.add(n);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  const facts = narrativeFacts(s);
  visit(facts.tests.map((t) => ({ readings: t.readings, result: t.result, notes: t.notes })));
  visit(facts.tech_notes);
  visit(facts.voice_notes);
  visit(facts.findings.map((f) => [f.location, f.notes]));
  visit(facts.checklist.map((c) => c.notes));
  visit(facts.work.map((w) => w.description));
  return [...out];
}

function numberAllowed(n: number, allowed: number[]): boolean {
  return allowed.some(
    (a) =>
      Math.abs(a - n) < 1e-9 ||
      // The same value written with fewer decimals: 0.533 as 0.53, 20.0 as 20.
      Math.abs(Math.round(a * 100) / 100 - n) < 1e-9 ||
      Math.abs(Math.round(a * 10) / 10 - n) < 1e-9 ||
      Math.abs(Math.round(a) - n) < 1e-9,
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks a draft against the job (BUILD_PLAN 6.2): every source id exists, every number
 * appears in the data, every component named exists, and every must-mention finding is cited.
 */
export function validateNarrative(draft: unknown, s: ReportSnapshot): NarrativeProblem[] {
  const problems: NarrativeProblem[] = [];
  const n = draft as Narrative;
  if (!n || !Array.isArray(n.sections) || n.sections.length === 0) {
    return [{ kind: "bad_shape", message: "The draft has no sections." }];
  }

  const ids = new Set<string>([
    ...s.components.map((c) => c.id),
    ...s.components.flatMap((c) => (c.result_id ? [c.result_id] : [])),
    ...s.tests.map((t) => t.id),
    ...s.findings.map((f) => f.id),
    ...s.media.map((m) => m.id),
  ]);
  const allowed = allowedNumbers(s);
  const measurements = measurementNumbers(s);
  const labels = new Set(s.components.map((c) => c.label.toLowerCase()));
  const presentTypes = new Set(s.components.map((c) => c.type_key));
  const cited = new Set<string>();
  // A repair has no checklist: a part named in its own work, notes, or findings is fine there.
  const ownWords = s.job.type === "repair" ? repairWords(s) : "";
  const named = (match: string) => ownWords !== "" && ownWords.includes(match.toLowerCase());

  n.sections.forEach((section) => {
    if (!section || !Array.isArray(section.paragraphs)) {
      problems.push({
        kind: "bad_shape",
        section: section?.key,
        message: "A section has no paragraphs.",
      });
      return;
    }
    section.paragraphs.forEach((p, i) => {
      const where = { section: section.key, paragraph: i };
      const text = typeof p?.text === "string" ? p.text : "";
      for (const id of Array.isArray(p?.source_ids) ? p.source_ids : []) {
        if (ids.has(id)) cited.add(id);
        else
          problems.push({
            kind: "unknown_source",
            ...where,
            match: id,
            message: `Cites ${id}, which is not part of this job.`,
          });
      }
      const flagged = new Set<number>();
      for (const m of text.matchAll(MEASUREMENT)) {
        const value = Number(m[1]);
        if (!numberAllowed(value, measurements)) {
          flagged.add(m.index);
          problems.push({
            kind: "unsupported_number",
            ...where,
            match: m[1],
            message: `“${m[0].trim()}” does not match any reading recorded on this job.`,
          });
        }
      }
      for (const m of text.matchAll(NUMBER)) {
        if (flagged.has(m.index)) continue;
        const value = Number(m[0].replace(/,/g, ""));
        if (!numberAllowed(value, allowed))
          problems.push({
            kind: "unsupported_number",
            ...where,
            match: m[0],
            message: `“${m[0]}” does not match any reading, result, or count recorded on this job.`,
          });
      }
      // A pool inspection's questions are sentences that use the leak checklist's names ("Main
      // drain", "Pool"), so the names aren't checked there (2026-10-20).
      for (const type of s.job.type === "inspection" ? [] : s.component_types) {
        const name = escapeRegExp(type.name.toLowerCase());
        const lower = text.toLowerCase();
        // A numbered instance ("Return 5") must exist on this job.
        for (const m of lower.matchAll(new RegExp(`\\b${name}s? (\\d+)\\b`, "g"))) {
          const label = `${type.name.toLowerCase()} ${m[1]}`;
          if (!labels.has(label) && !named(m[0]))
            problems.push({
              kind: "unknown_component",
              ...where,
              match: text.slice(m.index, m.index + m[0].length),
              message: `This job has no ${type.name} ${m[1]}.`,
            });
        }
        // A component type named at all must be part of this job.
        if (!presentTypes.has(type.key) && new RegExp(`\\b${name}(e?s)?\\b`).test(lower)) {
          const found = lower.match(new RegExp(`\\b${name}(e?s)?\\b`))!;
          if (named(found[0])) continue;
          problems.push({
            kind: "unknown_component",
            ...where,
            match: text.slice(found.index!, found.index! + found[0].length),
            message: `Mentions ${type.name}, which is not on this job’s checklist.`,
          });
        }
      }
    });
  });

  for (const f of s.findings) {
    if (f.must_mention && !cited.has(f.id))
      problems.push({
        kind: "missing_finding",
        match: f.title,
        message: `The ${f.severity_name.toLowerCase()} finding “${f.title}” must be mentioned.`,
      });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Plain draft without AI: used when no AI provider is configured, and in tests
// ---------------------------------------------------------------------------

export function plainNarrative(s: ReportSnapshot, template: "homeowner" | "partner"): Narrative {
  if (s.job.type === "inspection") return inspectionNarrative(s);
  if (s.job.type === "repair") return repairNarrative(s);
  const labelOf = new Map(s.components.map((c) => [c.id, c.label]));
  const failed = s.tests.filter((t) => t.outcome === "fail");
  const excluded = s.components.filter((c) => c.status === "excluded");
  const inspected = s.components.filter((c) => c.status === "inspected");
  const sections = NARRATIVE_SECTIONS[template];
  const titleOf = (key: string) => sections.find((x) => x.key === key)!.title;

  const tally = snapshotTally(s);
  const leakingItems = s.components.filter((c) => c.outcome === "leaking");
  const summary: NarrativeParagraph = {
    text:
      s.findings.length === 0 && leakingItems.length === 0
        ? `We checked ${inspected.length} of ${s.components.length} items and did not find a leak.`
        : `We checked ${inspected.length} of ${s.components.length} items: ${tally.pass} passed, ${tally.attention} ${tally.attention === 1 ? "needs" : "need"} attention, and ${tally.leaking} ${tally.leaking === 1 ? "is" : "are"} leaking.${s.findings.length ? ` We recorded ${s.findings.length} finding${s.findings.length === 1 ? "" : "s"}.` : ""}`,
    source_ids: [...s.findings.map((f) => f.id), ...leakingItems.map((c) => c.result_id ?? c.id)],
  };

  const findings: NarrativeParagraph[] = s.findings.length
    ? s.findings.map((f) => ({
        text: [
          `${f.title} (${f.severity_name.toLowerCase()}${f.status === "repaired" ? ", repaired on site" : ""}).`,
          f.location_text ? `Location: ${f.location_text}.` : "",
          f.notes ?? "",
        ]
          .filter(Boolean)
          .join(" "),
        source_ids: [f.id],
      }))
    : [{ text: "No leaks were found.", source_ids: [] }];

  // Not applicable needs no reason (M8.5); only items left out for a stated reason are named.
  const withReason = excluded.filter((c) => c.exclusion_reason?.trim());
  const coverage: NarrativeParagraph[] = withReason.length
    ? [
        {
          text: `Not inspected: ${withReason.map((c) => `${c.label} (${c.exclusion_reason})`).join("; ")}.`,
          source_ids: withReason.map((c) => c.result_id ?? c.id),
        },
      ]
    : [];

  if (template === "partner") {
    const tests: NarrativeParagraph[] = s.tests.map((t) => {
      const where = t.component_id ? labelOf.get(t.component_id) : null;
      const result = testSummary(t);
      return {
        text: `${t.type_name}${where ? `, ${where}` : ""}: ${result ?? "recorded"}${t.outcome ? ` (${t.outcome})` : ""}.`,
        source_ids: [t.id],
      };
    });
    return {
      sections: [
        { key: "summary", title: titleOf("summary"), paragraphs: [summary] },
        { key: "findings", title: titleOf("findings"), paragraphs: findings },
        { key: "tests", title: titleOf("tests"), paragraphs: [...tests, ...coverage] },
      ],
    };
  }
  const steps: NarrativeParagraph[] = [
    {
      text:
        s.findings.length && s.findings.every((f) => f.status === "repaired")
          ? "We repaired what we found during the visit. Watch the water level over the next few days and call us if it keeps dropping."
          : failed.length || s.findings.length
            ? "We recommend repairing the findings above. Your quote lists the work and price."
            : "No repair is needed based on today’s inspection.",
      source_ids: s.findings.map((f) => f.id),
    },
    ...coverage,
  ];
  return {
    sections: [
      { key: "summary", title: titleOf("summary"), paragraphs: [summary] },
      { key: "findings", title: titleOf("findings"), paragraphs: findings },
      { key: "next_steps", title: titleOf("next_steps"), paragraphs: steps },
    ],
  };
}

/**
 * Write Draft on a pool inspection (owner decision 3, 2026-10-20): a summary from the answers,
 * what needs attention, and the next steps with the form's recommendations. Editable before
 * sending, like the leak report's draft.
 */
function inspectionNarrative(s: ReportSnapshot): Narrative {
  const sections = NARRATIVE_SECTIONS.homeowner;
  const titleOf = (key: string) => sections.find((x) => x.key === key)!.title;
  const report = inspectionReport(s);
  const answered = report.sections.reduce(
    (n, x) => n + x.groups.reduce((m, g) => m + g.rows.length, 0),
    0,
  );
  const flagged = report.needsAttention;
  const leaking = flagged.filter((r) => r.tone === "leaking");
  const idOf = (rowId: string) => s.components.find((c) => c.id === rowId)?.result_id ?? rowId;
  const summary: NarrativeParagraph = {
    text: flagged.length
      ? `We inspected the pool, its equipment, and its safety features, and answered ${answered} questions. ${flagged.length} ${flagged.length === 1 ? "item needs" : "items need"} attention${leaking.length ? `, ${leaking.length} of them leaking` : ""}.`
      : `We inspected the pool, its equipment, and its safety features, and answered ${answered} questions. Nothing needs attention.`,
    source_ids: flagged.map((r) => idOf(r.id)),
  };
  const findings: NarrativeParagraph[] = flagged.length
    ? flagged.map((r) => ({
        text: [
          `${r.group ? `${r.group}: ` : ""}${r.question}${/[?:]$/.test(r.question) ? "" : ":"} ${r.answer}.`,
          r.notes ? (/[.!?]$/.test(r.notes) ? r.notes : `${r.notes}.`) : "",
        ]
          .filter(Boolean)
          .join(" "),
        source_ids: [idOf(r.id)],
      }))
    : [{ text: "Everything we inspected was in order.", source_ids: [] }];
  const steps: NarrativeParagraph[] = [
    {
      text: flagged.length
        ? "We recommend taking care of the items above. Ask us for a quote for any repair."
        : "No repair is needed based on today’s inspection.",
      source_ids: flagged.map((r) => idOf(r.id)),
    },
    ...report.recommendations.map((text) => ({ text, source_ids: [] })),
  ];
  return {
    sections: [
      { key: "summary", title: titleOf("summary"), paragraphs: [summary] },
      { key: "findings", title: titleOf("findings"), paragraphs: findings },
      { key: "next_steps", title: titleOf("next_steps"), paragraphs: steps },
    ],
  };
}

/** Everything a repair job's own records say, lowercased: its work, notes, and findings. */
function repairWords(s: ReportSnapshot): string {
  return [
    ...(s.work ?? []).map((w) => w.description),
    s.job.summary_notes ?? "",
    ...Object.values(s.job.intake ?? {}).flat(),
    ...s.findings.flatMap((f) => [f.title, f.location_text ?? "", f.notes ?? ""]),
    ...s.media.map((m) => m.transcript ?? ""),
  ]
    .join("\n")
    .toLowerCase();
}

/** "a", "a and b", "a, b, and c". */
function listOf(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** A sentence from the tech's or the price book's words: trimmed, ending in one stop. */
function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * The work a repair job's report names, from its own records only: the accepted quote's lines or
 * the item it was booked for (snapshot.work). Never invented.
 */
export function repairWork(s: Pick<ReportSnapshot, "work">): SnapshotWork[] {
  return (s.work ?? []).filter((w) => w.description?.trim());
}

/**
 * Write Draft on a repair job (owner, 2026-10-22): what we did, where, and the result; each piece
 * of work (the accepted quote's lines, else what it was booked for, else the job's notes) and the
 * findings repaired on site; then care after the repair. Leak words only when the job's own
 * records mention a leak.
 */
export function repairNarrative(s: ReportSnapshot): Narrative {
  const titleOf = (key: string) => REPAIR_SECTIONS.find((x) => x.key === key)!.title;
  const work = repairWork(s);
  const notes = s.job.summary_notes?.trim() || null;
  const repaired = s.findings.filter((f) => f.status === "repaired");
  const open = s.findings.filter((f) => f.status !== "repaired");
  const where = s.property.address.trim();
  const at = where ? ` at ${where}` : "";

  const summary: NarrativeParagraph = {
    text: [
      work.length
        ? `We did the repair work${at}: ${listOf(work.map((w) => w.description.trim()))}.`
        : `We did repair work${at}.`,
      repaired.length
        ? `We also repaired ${listOf(repaired.map((f) => f.title.trim()))} on site.`
        : "",
      open.length
        ? `${listOf(open.map((f) => f.title.trim()))} still ${open.length === 1 ? "needs" : "need"} attention.`
        : "The work is finished.",
    ]
      .filter(Boolean)
      .join(" "),
    source_ids: s.findings.map((f) => f.id),
  };

  const done: NarrativeParagraph[] = [
    ...work.map((w) => ({
      text: sentence(`${w.description.trim()}${w.quantity !== 1 ? ` × ${w.quantity}` : ""}`),
      source_ids: [],
    })),
    ...(work.length || !notes ? [] : [{ text: sentence(notes), source_ids: [] }]),
    ...repaired.map((f) => ({
      text: [
        `${f.title.trim()}: repaired on site.`,
        f.location_text?.trim() ? `Location: ${sentence(f.location_text)}` : "",
        f.notes?.trim() ? sentence(f.notes) : "",
      ]
        .filter(Boolean)
        .join(" "),
      source_ids: [f.id],
    })),
    ...open.map((f) => ({
      text: [
        `${f.title.trim()} (${f.severity_name.toLowerCase()}): not repaired yet.`,
        f.location_text?.trim() ? `Location: ${sentence(f.location_text)}` : "",
        f.notes?.trim() ? sentence(f.notes) : "",
      ]
        .filter(Boolean)
        .join(" "),
      source_ids: [f.id],
    })),
  ];
  const findings = done.length
    ? done
    : [{ text: "We did the repair work you booked.", source_ids: [] }];

  const leak = /\bleak/.test(repairWords(s));
  const steps: NarrativeParagraph[] = [
    ...(open.length
      ? [
          {
            text: "We recommend taking care of the items above. Ask us for a quote for any further repair.",
            source_ids: open.map((f) => f.id),
          },
        ]
      : []),
    {
      text: "Run the pool as usual and keep an eye on the repaired area over the next few days. Call us if anything doesn’t look or work right.",
      source_ids: [],
    },
    ...(leak
      ? [
          {
            text: "Watch the water level too, and call us if it keeps dropping.",
            source_ids: [],
          },
        ]
      : []),
  ];
  return {
    sections: [
      { key: "summary", title: titleOf("summary"), paragraphs: [summary] },
      { key: "findings", title: titleOf("findings"), paragraphs: findings },
      { key: "next_steps", title: titleOf("next_steps"), paragraphs: steps },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** White or near-black text, whichever reads better on the shop's color (6.3). */
export function textOnBrand(background: string, dark = "#12263A", light = "#FFFFFF"): string {
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

export const SIGNATURE_PURPOSE_LABELS: Record<string, string> = {
  inspection_ack: "Inspection acknowledged",
  work_authorization: "Work authorized",
  quote_acceptance: "Quote accepted",
  completion: "Work completed",
};

/** The text a tech sends with the report link (6.5). */
export function reportShareText(
  shopName: string,
  link: string,
  withQuote = false,
  jobType?: string | null,
): string {
  const what = reportTitle(jobType).toLowerCase();
  return `${shopName}: your ${what}${withQuote ? " and repair estimate" : ""}: ${link}`;
}

/** The report's title: the job type's own name. */
export function reportTitle(jobType: string | null | undefined): string {
  if (jobType === "inspection") return "Pool Inspection Report";
  if (jobType === "repair") return "Repair Report";
  return "Leak Detection Report";
}

/**
 * The line above Write Draft. A repair job's draft comes from its repairs, notes, and findings: it
 * has no checklist (owner, 2026-10-22).
 */
export function writeDraftIntro(jobType: string | null | undefined): string {
  const from =
    jobType === "repair" ? "repairs, notes, and findings" : "checklist, tests, and findings";
  return `Write Draft fills in the report from this job’s ${from}. Read and edit it before sending.`;
}

/** Block order on the report page, per template (report_template.sections). */
export const REPORT_BLOCKS: Record<"homeowner" | "partner", string[]> = {
  homeowner: [
    "header",
    "summary",
    "findings",
    "diagram",
    "next_steps",
    "coverage",
    // Every test, pass or fail (owner, 2026-10-19: "We want to show off all the work we did").
    "tests",
    "photos",
    "signature",
    "footer",
  ],
  partner: [
    "header",
    "summary",
    "findings",
    "diagram",
    "tests",
    "coverage",
    "photos",
    "signature",
    "footer",
  ],
};

/** A test's outcome as the report shows it: Pass, Fail, Unclear, or Recorded. */
export function testOutcomeLabel(outcome: string | null | undefined): {
  label: string;
  tone: VerdictTone;
} {
  if (outcome === "pass") return { label: "Pass", tone: "pass" };
  if (outcome === "fail") return { label: "Fail", tone: "leaking" };
  if (outcome === "inconclusive") return { label: "Unclear", tone: "attention" };
  return { label: "Recorded", tone: "pending" };
}

// ---------------------------------------------------------------------------
// Saved reports (owner, 2026-10-20: "a copy/paste essentially that the tech uses each time")
// ---------------------------------------------------------------------------

/** The report sections a saved report can hold text for, in report order. */
export const SAVED_REPORT_SECTIONS = NARRATIVE_SECTIONS.homeowner.map((s) => ({
  key: s.key,
  title: s.title,
}));

/** A saved report's text by section key, from its stored `sections` (unknown keys and blanks dropped). */
export function savedReportSections(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const { key } of SAVED_REPORT_SECTIONS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}

/**
 * Use Saved Report: the draft's sections with the saved text in place, word for word, and the
 * titles of the sections whose own different text it replaces (asked about first).
 */
export function applySavedReport(
  sections: FinalSection[],
  saved: unknown,
): { sections: FinalSection[]; replaces: string[] } {
  const text = savedReportSections(saved);
  const replaces: string[] = [];
  const next = sections.map((s) => {
    const t = text[s.key];
    if (t === undefined) return s;
    if (s.text.trim() && s.text.trim() !== t) replaces.push(s.title);
    return { ...s, text: t };
  });
  return { sections: next, replaces };
}

/** "Replace the text in Summary and What we found?" */
export function replaceSavedReportQuestion(titles: string[]): string {
  const list =
    titles.length <= 1
      ? (titles[0] ?? "")
      : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  return `Replace the text in ${list}?`;
}

/** Save as Saved Report: the draft's text by section, blanks left out. */
export function savedReportFrom(sections: FinalSection[]): Record<string, string> {
  return savedReportSections(Object.fromEntries(sections.map((s) => [s.key, s.text])));
}
