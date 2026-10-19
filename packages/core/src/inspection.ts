/**
 * Inspection logic shared by the field app, the office view, and reports.
 * Config rows (component_type, test_type, severity_level) come from the database.
 */
import type { JobType, Property } from "./models";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface Base {
  id: string;
  company_id: string;
  deleted_at?: string | null;
}

/** Where an item is listed on the checklist and the report. */
export type ChecklistSection = "visual" | "plumbing" | "bond_beam" | "other" | "service";

export const CHECKLIST_SECTION_LABELS: Record<ChecklistSection, string> = {
  visual: "Visual Leak Inspection",
  plumbing: "Plumbing Static Test",
  bond_beam: "Bond Beam",
  other: "Other",
  service: "Service",
};

export interface ComponentType extends Base {
  key: string;
  name: string;
  section?: ChecklistSection;
  /**
   * leak: a verdict (not leaking, leaking, attention, not applicable); yes_no: yes or no;
   * done: a maintenance task (done, needs attention, skipped).
   */
  answer?: "leak" | "yes_no" | "done";
  /** Which jobs get the item: leak detection (default) or maintenance visits. */
  job_type?: "detection" | "maintenance";
  /** Only for this pool type (vinyl checks); null for every pool. */
  applies_to_pool_type?: string | null;
  /**
   * Done every few months (filter, salt cell): kept off new visits; a maintenance plan's
   * cleaning puts it on the visit it's due.
   */
  on_schedule?: boolean;
  allows_multiple: boolean;
  default_count: number;
  applies_to: "pool" | "spa" | "both";
  methods: string[];
  sort_order: number;
  active: boolean;
}

export interface JobComponent extends Base {
  job_id: string;
  component_type_id: string;
  instance_number: number;
  label: string;
  location_note?: string | null;
  sort_order: number;
  /** Put on this visit by a plan's scheduled cleaning (server-set). */
  plan_cleaning_id?: string | null;
}

export type ChecklistStatus = "pending" | "inspected" | "excluded";

/** The verdict on an inspected item. Not applicable is status "excluded". */
export type ChecklistOutcome = "ok" | "leaking" | "attention";

export interface ChecklistItemResult extends Base {
  job_id: string;
  job_component_id: string;
  status: ChecklistStatus;
  outcome?: ChecklistOutcome | null;
  /** Where, for a leaking or attention item. */
  location_text?: string | null;
  method?: string | null;
  exclusion_reason?: string | null;
  notes?: string | null;
  inspected_at?: string | null;
  inspected_by?: string | null;
}

export type FieldType = "text" | "number" | "select" | "textarea";

export interface TestField {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required?: boolean;
  options?: string[];
}

export interface TestFieldSchema {
  fields: TestField[];
  /** Calculator settings, e.g. {"pass_max_drop_psi": 0.5}. */
  options?: Record<string, number>;
}

export type Calculator = "pressure_drop" | "bucket_evaporation";
export type Outcome = "pass" | "fail" | "inconclusive";

export interface TestType extends Base {
  key: string;
  name: string;
  field_schema: TestFieldSchema;
  schema_version: number;
  calculator: Calculator | null;
  result_options: Outcome[];
  sort_order: number;
  active: boolean;
}

export type TestData = Record<string, string | number | null>;

export interface TestResult extends Base {
  job_id: string;
  job_component_id?: string | null;
  test_type_id: string;
  schema_version: number;
  data: TestData;
  computed: Record<string, number | string | null>;
  outcome?: Outcome | null;
  performed_at?: string | null;
  notes?: string | null;
}

export interface SeverityLevel extends Base {
  key: string;
  name: string;
  color: string;
  must_mention: boolean;
  sort_order: number;
  active: boolean;
}

export interface ExclusionReason extends Base {
  label: string;
  sort_order: number;
  active: boolean;
}

export type FindingStatus = "open" | "quoted" | "repaired" | "monitor";

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Open",
  quoted: "Quoted",
  repaired: "Repaired",
  monitor: "Monitor",
};

export interface Finding extends Base {
  job_id: string;
  job_component_id?: string | null;
  title: string;
  location_text?: string | null;
  severity_key: string;
  pin_x?: number | null;
  pin_y?: number | null;
  status: FindingStatus;
  notes?: string | null;
}

const live = <T extends { deleted_at?: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deleted_at);

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export function componentApplies(
  type: Pick<ComponentType, "applies_to" | "applies_to_pool_type">,
  property: Pick<Property, "has_pool" | "has_spa"> & { pool_type?: string | null },
): boolean {
  // Vinyl checks: skipped only when the pool is known to be another type.
  if (
    type.applies_to_pool_type &&
    property.pool_type &&
    property.pool_type !== type.applies_to_pool_type
  )
    return false;
  if (type.applies_to === "both") return property.has_pool || property.has_spa;
  if (type.applies_to === "spa") return property.has_spa;
  return property.has_pool;
}

/** "Skimmer", then "Skimmer 2" when another is added; numbered from 1 when a job starts with several. */
export function instanceLabel(
  type: Pick<ComponentType, "name" | "allows_multiple" | "default_count">,
  n: number,
): string {
  if (!type.allows_multiple) return type.name;
  return n === 1 && type.default_count <= 1 ? type.name : `${type.name} ${n}`;
}

export interface PlannedComponent {
  component_type_id: string;
  instance_number: number;
  label: string;
  sort_order: number;
}

/**
 * Default component instances for a new job at this property: the leak checklist for a
 * detection job, the service checklist for a maintenance visit.
 */
export function planComponents(
  types: ComponentType[],
  property: Pick<Property, "has_pool" | "has_spa"> & { pool_type?: string | null },
  // A repair job has no checklist: no item's job_type is "repair".
  jobType: JobType = "detection",
): PlannedComponent[] {
  return live(types)
    .filter(
      (t) =>
        t.active &&
        !t.on_schedule &&
        (t.job_type ?? "detection") === jobType &&
        componentApplies(t, property),
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((t) =>
      Array.from(
        { length: t.allows_multiple ? t.default_count : Math.min(t.default_count, 1) },
        (_, i) => ({
          component_type_id: t.id,
          instance_number: i + 1,
          label: instanceLabel(t, i + 1),
          sort_order: t.sort_order * 100 + i + 1,
        }),
      ),
    );
}

/** The next instance to add for a type ("+ Return" after Return 1-4 gives Return 5). */
export function nextInstance(type: ComponentType, existing: JobComponent[]): PlannedComponent {
  const used = live(existing)
    .filter((c) => c.component_type_id === type.id)
    .map((c) => c.instance_number);
  const n = used.length ? Math.max(...used) + 1 : 1;
  return {
    component_type_id: type.id,
    instance_number: n,
    label: instanceLabel(type, n),
    sort_order: type.sort_order * 100 + n,
  };
}

/**
 * Removing an item from a job's checklist (owner, 2026-10-19: "You can't remove items from the
 * checklist once added"): any item can go. A scheduled cleaning stays due on its plan, so it
 * goes on the next visit, and the confirm says so.
 */
export function removeItemConfirm(
  label: string,
  fromPlan: boolean,
): { title: string; message: string | null; confirm: string } {
  return {
    title: `Remove ${label} from the checklist?`,
    message: fromPlan ? "It’s still due, so it goes on the next visit." : null,
    confirm: "Remove Item",
  };
}

export interface ChecklistTally {
  /** Not leaking (or "no" on a yes/no item). */
  pass: number;
  attention: number;
  leaking: number;
  notApplicable: number;
  pending: number;
}

/** The counts at the top of the report: "26 Items Pass · 0 Need Attention · 1 Failed". */
export function checklistTally(
  components: JobComponent[],
  results: ChecklistItemResult[],
): ChecklistTally {
  const byComponent = new Map(live(results).map((r) => [r.job_component_id, r]));
  const t: ChecklistTally = { pass: 0, attention: 0, leaking: 0, notApplicable: 0, pending: 0 };
  for (const c of live(components)) {
    const r = byComponent.get(c.id);
    if (!r || r.status === "pending") t.pending += 1;
    else if (r.status === "excluded") t.notApplicable += 1;
    else if (r.outcome === "leaking") t.leaking += 1;
    else if (r.outcome === "attention") t.attention += 1;
    else t.pass += 1;
  }
  return t;
}

/** Badge text for an item, in his words. Yes/no items read "Yes" or "No". */
export function verdictLabel(
  r: Pick<ChecklistItemResult, "status" | "outcome"> | undefined,
  answer: "leak" | "yes_no" | "done" = "leak",
): string {
  if (!r || r.status === "pending") return "To do";
  if (answer === "done") {
    if (r.status === "excluded") return "Skipped";
    return r.outcome === "attention" ? "Needs attention" : "Done";
  }
  if (r.status === "excluded") return "Not applicable";
  if (answer === "yes_no") return r.outcome === "ok" ? "No" : "Yes";
  return r.outcome === "leaking"
    ? "Leaking"
    : r.outcome === "attention"
      ? "Attention"
      : "Not leaking";
}

/** One tap per item: the four verdicts the shop uses (yes/no items: No, Yes, N/A). */
export type Verdict = ChecklistOutcome | "na";

export function verdictOptions(type: Pick<ComponentType, "answer"> | undefined) {
  if (type?.answer === "done")
    return [
      { value: "ok" as Verdict, label: "Done" },
      { value: "attention" as Verdict, label: "Needs Attention" },
      { value: "na" as Verdict, label: "Skipped" },
    ];
  return type?.answer === "yes_no"
    ? [
        { value: "ok" as Verdict, label: "No" },
        { value: "attention" as Verdict, label: "Yes" },
        { value: "na" as Verdict, label: "N/A" },
      ]
    : [
        { value: "ok" as Verdict, label: "Not Leaking" },
        { value: "leaking" as Verdict, label: "Leaking" },
        { value: "attention" as Verdict, label: "Attention" },
        { value: "na" as Verdict, label: "N/A" },
      ];
}

export function currentVerdict(
  r: Pick<ChecklistItemResult, "status" | "outcome"> | undefined,
): Verdict | null {
  if (!r || r.status === "pending") return null;
  if (r.status === "excluded") return "na";
  return r.outcome ?? "ok";
}

/** The checklist row values for a verdict. "Where" only stays for Leaking and Attention. */
export function verdictValues(
  v: Verdict | null,
  userId: string | null,
  now: Date = new Date(),
): Record<string, string | null> {
  const at = now.toISOString();
  if (v === null)
    return { status: "pending", outcome: null, inspected_at: null, inspected_by: null };
  if (v === "na")
    return {
      status: "excluded",
      outcome: null,
      location_text: null,
      inspected_at: at,
      inspected_by: userId,
    };
  return {
    status: "inspected",
    outcome: v,
    ...(v === "ok" ? { location_text: null } : {}),
    inspected_at: at,
    inspected_by: userId,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Parse a typed number ("12", "12.5", " 0.25 "); null when blank or invalid. */
export function toNumber(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

export function validateTestData(schema: TestFieldSchema, data: TestData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of schema.fields) {
    const v = data[f.key];
    const blank = v == null || (typeof v === "string" && v.trim() === "");
    if (blank) {
      if (f.required) errors[f.key] = `Enter ${f.label.toLowerCase()}.`;
      continue;
    }
    if (f.type === "number" && toNumber(v) === null) errors[f.key] = "Enter a number.";
    if (f.type === "number" && (toNumber(v) ?? 0) < 0) errors[f.key] = "Can't be negative.";
    if (f.type === "select" && f.options && !f.options.includes(String(v)))
      errors[f.key] = "Pick one of the options.";
  }
  return errors;
}

export interface Calculation {
  computed: Record<string, number | string | null>;
  suggested: Outcome | null;
  /** One line for the tech, e.g. "Dropped 8 PSI in 15 min". */
  summary: string | null;
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const fmt = (n: number) => String(round(n));

/**
 * Pressure test: drop = start - end. Passes when the drop is within the allowed
 * tolerance (default 0 PSI; set pass_max_drop_psi on the test type).
 */
export function pressureDrop(data: TestData, options: Record<string, number> = {}): Calculation {
  const start = toNumber(data.start_psi);
  const end = toNumber(data.end_psi);
  const minutes = toNumber(data.duration_min);
  if (start === null || end === null) return { computed: {}, suggested: null, summary: null };
  const drop = round(start - end);
  const computed: Calculation["computed"] = { drop_psi: drop };
  if (minutes && minutes > 0) computed.drop_psi_per_min = round(drop / minutes, 3);
  const tolerance = options.pass_max_drop_psi ?? 0;
  const minMinutes = options.min_duration_min ?? 0;
  let suggested: Outcome = drop <= tolerance ? "pass" : "fail";
  if (drop < 0) suggested = "inconclusive"; // pressure went up: check the gauge or temperature
  if (suggested === "pass" && minutes !== null && minutes < minMinutes) suggested = "inconclusive";
  const over = minutes ? ` in ${fmt(minutes)} min` : "";
  const summary =
    drop < 0
      ? `Rose ${fmt(-drop)} PSI${over}`
      : drop === 0
        ? `Held at ${fmt(start)} PSI${over}`
        : `Dropped ${fmt(drop)} PSI${over}`;
  return { computed, suggested, summary };
}

/**
 * Bucket test: pool loss minus bucket (evaporation) loss is the unexplained loss.
 * Fails when the unexplained loss per 24 h exceeds the threshold (default 0.25 in/day;
 * set fail_over_in_per_day on the test type).
 */
export function bucketEvaporation(
  data: TestData,
  options: Record<string, number> = {},
): Calculation {
  const ps = toNumber(data.pool_start_in);
  const pe = toNumber(data.pool_end_in);
  const bs = toNumber(data.bucket_start_in);
  const be = toNumber(data.bucket_end_in);
  const hours = toNumber(data.duration_hours);
  if (ps === null || pe === null || bs === null || be === null || !hours || hours <= 0) {
    return { computed: {}, suggested: null, summary: null };
  }
  const poolLoss = round(ps - pe, 3);
  const bucketLoss = round(bs - be, 3);
  const unexplained = round(poolLoss - bucketLoss, 3);
  const perDay = round((unexplained * 24) / hours, 3);
  const threshold = options.fail_over_in_per_day ?? 0.25;
  const suggested: Outcome = perDay > threshold ? "fail" : "pass";
  return {
    computed: {
      pool_loss_in: poolLoss,
      bucket_loss_in: bucketLoss,
      unexplained_loss_in: unexplained,
      unexplained_in_per_day: perDay,
    },
    suggested,
    summary:
      unexplained <= 0
        ? `No loss beyond evaporation over ${fmt(hours)} h`
        : `${fmt(unexplained)} in lost beyond evaporation over ${fmt(hours)} h (${fmt(perDay)} in/day)`,
  };
}

/** Run a test type's calculator; types without one only use the tech's chosen outcome. */
export function calculate(
  type: Pick<TestType, "calculator" | "field_schema">,
  data: TestData,
): Calculation {
  const options = type.field_schema.options ?? {};
  if (type.calculator === "pressure_drop") return pressureDrop(data, options);
  if (type.calculator === "bucket_evaporation") return bucketEvaporation(data, options);
  return { computed: {}, suggested: null, summary: null };
}

/** Store numbers as numbers, blanks as null, text trimmed. */
export function normalizeTestData(schema: TestFieldSchema, data: TestData): TestData {
  const out: TestData = {};
  for (const f of schema.fields) {
    const v = data[f.key];
    if (f.type === "number") out[f.key] = toNumber(v);
    else out[f.key] = v == null ? null : String(v).trim() || null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Findings and the pool diagram
// ---------------------------------------------------------------------------

export function validateFinding(f: {
  title: string;
  severity_key: string;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.title.trim()) e.title = 'Describe the finding, like "Return 3 line break".';
  if (!f.severity_key) e.severity_key = "Pick a severity.";
  return e;
}

export type DiagramShape =
  "rectangle" | "oval" | "kidney" | "l_shape" | "freeform" | "roman" | "grecian" | "figure_eight";

export type SpaSize = "small" | "medium" | "large";
export type SpaShape = "round" | "square";

/**
 * How a pool's diagram is laid out beyond its shape (owner, 2026-10-19: "More customization to
 * pool shape. Be able to place the spa wherever"): the shape mirrored left to right, and the
 * spa's center (0..1 of the diagram), size, and shape. Stored in property.diagram_layout.
 */
export interface DiagramLayout {
  mirror?: boolean;
  spa?: { x: number; y: number; size?: SpaSize; shape?: SpaShape };
}

export interface PoolDiagram {
  width: number;
  height: number;
  /** SVG path for the pool outline, in the diagram's coordinates. */
  pool: string;
  /** The spa: a circle of radius r, or with `square`, a rounded square r from its center. */
  spa: { cx: number; cy: number; r: number; square: boolean } | null;
}

export const DIAGRAM_SHAPES: { key: DiagramShape; label: string }[] = [
  { key: "rectangle", label: "Rectangle" },
  { key: "oval", label: "Oval" },
  { key: "kidney", label: "Kidney" },
  { key: "l_shape", label: "L-shape" },
  { key: "freeform", label: "Freeform" },
  { key: "roman", label: "Roman" },
  { key: "grecian", label: "Grecian" },
  { key: "figure_eight", label: "Figure 8" },
];

export const SPA_SIZES: { key: SpaSize; label: string; r: number }[] = [
  { key: "small", label: "Small", r: 10 },
  { key: "medium", label: "Medium", r: 13 },
  { key: "large", label: "Large", r: 17 },
];

export const SPA_SHAPES: { key: SpaShape; label: string }[] = [
  { key: "round", label: "Round" },
  { key: "square", label: "Square" },
];

const POOL_PATHS: Record<DiagramShape, string> = {
  rectangle: "M16 18 H124 Q130 18 130 24 V76 Q130 82 124 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z",
  oval: "M70 15 C102 15 130 30 130 50 C130 70 102 85 70 85 C38 85 10 70 10 50 C10 30 38 15 70 15 Z",
  kidney:
    "M30 16 C56 12 70 30 84 28 C100 25 106 14 118 18 C134 24 132 48 126 62 C116 84 88 86 64 84 C38 82 12 78 10 54 C8 32 14 19 30 16 Z",
  l_shape:
    "M14 14 H74 Q80 14 80 20 V48 H124 Q130 48 130 54 V80 Q130 86 124 86 H14 Q8 86 8 80 V20 Q8 14 14 14 Z",
  freeform:
    "M24 22 C46 8 70 26 92 16 C114 8 132 26 128 46 C124 62 134 74 116 82 C96 90 76 76 56 84 C34 92 10 80 12 60 C14 44 6 34 24 22 Z",
  // Rectangle with a half-round end, where the steps usually are.
  roman:
    "M16 18 H104 C120 18 132 32 132 50 C132 68 120 82 104 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z",
  // Rectangle with the corners cut.
  grecian: "M26 18 H114 L130 34 V66 L114 82 H26 L10 66 V34 Z",
  figure_eight:
    "M40 16 C58 16 64 28 70 34 C76 28 82 16 100 16 C120 16 132 32 132 50 C132 68 120 84 100 84 C82 84 76 72 70 66 C64 72 58 84 40 84 C20 84 8 68 8 50 C8 32 20 16 40 16 Z",
};

const DIAGRAM_WIDTH = 160;
const DIAGRAM_HEIGHT = 100;
/** Pools are drawn in x 8..132; mirroring flips them about the middle of that. */
const MIRROR_AXIS = 140;

/**
 * Mirrors a pool path left to right. The paths use absolute M, L, H, V, Q, C, and Z only, so
 * every x (each pair's first number, and H's) becomes MIRROR_AXIS - x.
 */
export function mirrorPath(path: string): string {
  const out: string[] = [];
  let command = "";
  let index = 0;
  for (const token of path.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? []) {
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index = 0;
      out.push(token);
      continue;
    }
    const n = Number(token);
    const isX = command === "H" || (command !== "V" && index % 2 === 0);
    out.push(String(isX ? MIRROR_AXIS - n : n));
    index++;
  }
  return out.join(" ").replace(/ ([A-Za-z])/g, " $1");
}

const isUnitNumber = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;

/** Read a layout from a synced row. Anything unrecognized is dropped, never thrown. */
export function parseDiagramLayout(value: unknown): DiagramLayout {
  if (!value || typeof value !== "object") return {};
  const o = value as Record<string, unknown>;
  const layout: DiagramLayout = {};
  if (o.mirror === true) layout.mirror = true;
  const spa = o.spa as Record<string, unknown> | undefined;
  if (spa && isUnitNumber(spa.x) && isUnitNumber(spa.y)) {
    layout.spa = { x: spa.x, y: spa.y };
    if (SPA_SIZES.some((z) => z.key === spa.size)) layout.spa.size = spa.size as SpaSize;
    if (SPA_SHAPES.some((z) => z.key === spa.shape)) layout.spa.shape = spa.shape as SpaShape;
  }
  return layout;
}

/**
 * Top-down diagram for a property. Pins are stored as 0..1 of width and height. Without a
 * layout, the spa sits at the top right as before (on the left when mirrored).
 */
export function poolDiagram(
  shape: DiagramShape | null | undefined,
  hasSpa: boolean,
  layout?: DiagramLayout | null,
): PoolDiagram {
  const path = POOL_PATHS[shape ?? "rectangle"] ?? POOL_PATHS.rectangle;
  const mirror = layout?.mirror === true;
  const placed = layout?.spa;
  const r = SPA_SIZES.find((z) => z.key === (placed?.size ?? "medium"))!.r;
  return {
    width: DIAGRAM_WIDTH,
    height: DIAGRAM_HEIGHT,
    pool: mirror ? mirrorPath(path) : path,
    spa: hasSpa
      ? {
          cx: placed ? placed.x * DIAGRAM_WIDTH : mirror ? DIAGRAM_WIDTH - 145 : 145,
          cy: placed ? placed.y * DIAGRAM_HEIGHT : 22,
          r,
          square: placed?.shape === "square",
        }
      : null,
  };
}
