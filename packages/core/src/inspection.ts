/**
 * Inspection logic shared by the field app, the office view, and reports.
 * Config rows (component_type, test_type, severity_level) come from the database.
 */
import type { JobType, Property } from "./models";
import { inspectionAnswerText } from "./pool-inspection";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface Base {
  id: string;
  company_id: string;
  deleted_at?: string | null;
}

/** Where an item is listed on the checklist and the report. */
export type ChecklistSection =
  | "visual"
  | "plumbing"
  | "bond_beam"
  | "other"
  | "service"
  // Pool Inspection's tabs (2026-10-20).
  | "insp_equipment"
  | "insp_self_cleaning"
  | "insp_heaters"
  | "insp_electrical"
  | "insp_fencing"
  | "insp_covers"
  | "insp_visual"
  | "insp_plumbing";

export const CHECKLIST_SECTION_LABELS: Record<ChecklistSection, string> = {
  visual: "Visual Leak Inspection",
  plumbing: "Plumbing Static Test",
  bond_beam: "Bond Beam",
  other: "Other",
  service: "Service",
  insp_equipment: "Equipment",
  insp_self_cleaning: "Self Cleaning (In Floor) System",
  insp_heaters: "Heaters",
  insp_electrical: "Electrical Safety",
  insp_fencing: "Fencing and Child Barriers",
  insp_covers: "Covers",
  insp_visual: "Visual Leak Inspection",
  insp_plumbing: "Plumbing Static Test",
};

export interface ComponentType extends Base {
  key: string;
  name: string;
  section?: ChecklistSection;
  /**
   * leak: a verdict (not leaking, leaking, attention, not applicable); yes_no: yes or no;
   * done: a maintenance task (done, needs attention, skipped); choice, multi, text: a pool
   * inspection question (pool-inspection.ts).
   */
  answer?: "leak" | "yes_no" | "done" | "choice" | "multi" | "text";
  /** Which jobs get the item: leak detection (default), maintenance visits, or pool inspections. */
  job_type?: "detection" | "maintenance" | "inspection";
  /** The small header it sits under ("Filtration System"). */
  group_label?: string | null;
  /** A choice or multi question's options (ChoiceOption[]). */
  options?: unknown;
  /** A banner shown before it, word for word. */
  notice?: string | null;
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
  /** A pool inspection answer: an option's label, a list of labels, or text. */
  value?: unknown;
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
  r: (Pick<ChecklistItemResult, "status" | "outcome"> & { value?: unknown }) | undefined,
  answer: ComponentType["answer"] = "leak",
): string {
  if (!r || r.status === "pending") return "To do";
  if (answer === "choice" || answer === "multi" || answer === "text")
    return (
      inspectionAnswerText(answer, r.value) ??
      (r.status === "excluded" ? "Not applicable" : "Answered")
    );
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
  | "rectangle"
  | "oval"
  | "kidney"
  | "l_shape"
  | "freeform"
  | "roman"
  | "grecian"
  | "figure_eight"
  /** Drawn by hand: no preset outline (Clear, owner 2026-10-19). */
  | "custom";

export type SpaSize = "small" | "medium" | "large";
export type SpaShape = "round" | "square";

/**
 * How a pool's diagram is laid out beyond its shape (owner, 2026-10-19: "More customization to
 * pool shape. Be able to place the spa wherever"): the shape mirrored left to right, and the
 * spa's center (0..1 of the diagram), size, and shape. Stored in property.diagram_layout.
 */
export interface DiagramLayout {
  mirror?: boolean;
  /**
   * The pool is drawn in the middle of the diagram (owner, 2026-10-20: "Pool shapes are not
   * centered"). Pools saved before sat 10 units left, to leave room for the spa; their spa,
   * landmarks, drawing and finding pins were placed against that, so they keep it until the
   * shape is saved again (centerLayout).
   */
  centered?: boolean;
  /**
   * The spa's center (0..1), its shape, and its radius `r` in diagram units (pinched on the
   * diagram, owner 2026-10-19). `size` is the nearest preset, for app builds that predate `r`.
   */
  spa?: { x: number; y: number; size?: SpaSize; shape?: SpaShape; r?: number };
  /** Lines, circles, and freehand strokes drawn on the diagram (Draw), 0..1 of it. */
  drawing?: DrawnShape[];
  /** Trees, rocks, a waterfall, and so on, placed around the pool (Landmarks). */
  landmarks?: Landmark[];
}

/** One thing drawn with Draw, in the pool's outline (owner, 2026-10-19). */
export type DrawnShape =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "circle"; cx: number; cy: number; rx: number; ry: number }
  | { type: "pen"; points: [number, number][] };

export type LandmarkKind = "tree" | "rock" | "waterfall" | "steps" | "equipment" | "house";

export interface Landmark {
  kind: LandmarkKind;
  x: number;
  y: number;
  /** Its size in diagram units (pinched or dragged, like the spa); LANDMARK_SIZE when unset. */
  s?: number;
  /**
   * Mirrored (a tap on the selected landmark): left to right, or top to bottom for a drawing
   * that's the same both ways across (LANDMARKS' `mirror`; owner, 2026-10-20, the steps).
   */
  flip?: boolean;
}

/**
 * A landmark drawing's colors (brand/tokens.json color.landmark): filled, with a thin dark
 * outline, so each reads at a glance on the diagram (owner, 2026-10-19: "All of the landmarks
 * are hard to interpret").
 */
export type LandmarkTone =
  | "leaf"
  | "leafDark"
  | "trunk"
  | "stone"
  | "stoneDark"
  | "water"
  | "foam"
  | "concrete"
  | "metal"
  | "wall"
  | "roof"
  | "door";

/** One filled piece of a landmark drawing, in its 24 x 24 box. */
export interface LandmarkPart {
  d: string;
  /** The fill; "foam" parts are white lines (water streaks), stroked rather than filled. */
  tone: LandmarkTone;
}

/**
 * The landmarks, drawn as small filled pictures in a 24 x 24 box, from absolute M, L, H, V, Q,
 * C, and Z only, so every platform draws them from the same paths. Each part is filled with
 * its tone and outlined in color.landmark.outline (stroke 1 in the box).
 */
export const LANDMARKS: {
  key: LandmarkKind;
  label: string;
  /** How a tap mirrors it: "x" left to right (the default), "y" top to bottom. */
  mirror?: "x" | "y";
  parts: LandmarkPart[];
}[] = [
  {
    key: "tree",
    label: "Tree",
    parts: [
      { d: "M10.6 15.5 H13.4 V22.5 H10.6 Z", tone: "trunk" },
      {
        d: "M12 1.5 C15.6 1.5 18.2 4 18.4 7.2 C20.6 8.2 21.8 10.4 21.4 12.8 C21 15.4 18.8 17.2 16.2 17 C15 17.8 13.6 18.2 12 18.2 C10.4 18.2 9 17.8 7.8 17 C5.2 17.2 3 15.4 2.6 12.8 C2.2 10.4 3.4 8.2 5.6 7.2 C5.8 4 8.4 1.5 12 1.5 Z",
        tone: "leaf",
      },
      {
        d: "M8.4 7.4 C9.4 6 11 5.4 12.6 5.6 C11.2 6.4 10.2 7.6 9.8 9.2 C9.2 8.8 8.7 8.2 8.4 7.4 Z",
        tone: "leafDark",
      },
    ],
  },
  {
    key: "rock",
    label: "Rock",
    parts: [
      {
        d: "M2 19.5 C2 15.5 4 11.6 7.6 9.6 C9.6 7.4 13.6 6.8 16.4 8.4 C19.8 10.2 22 14.2 22 19.5 Z",
        tone: "stone",
      },
      {
        d: "M12.6 9.4 C15 9.6 17.2 11.4 18 14 C16.4 12.6 14.6 12 12.6 12.2 Z",
        tone: "stoneDark",
      },
    ],
  },
  {
    key: "waterfall",
    label: "Waterfall",
    parts: [
      { d: "M4.5 7 H19.5 V18 Q15.75 20.2 12 18 Q8.25 15.8 4.5 18 Z", tone: "water" },
      { d: "M8.5 9 V15.5 M12 9 V16.5 M15.5 9 V15.5", tone: "foam" },
      {
        d: "M1.5 8 C1.5 5 3.4 3 6.5 3 H17.5 C20.6 3 22.5 5 22.5 8 Z",
        tone: "stone",
      },
      { d: "M2.5 22.5 Q12 18.5 21.5 22.5 Z", tone: "water" },
    ],
  },
  {
    key: "steps",
    label: "Steps",
    // The same both ways across, so a tap turns them top to bottom.
    mirror: "y",
    parts: [
      { d: "M2.5 15.5 H21.5 V21.5 H2.5 Z", tone: "concrete" },
      { d: "M5.5 9.5 H18.5 V15.5 H5.5 Z", tone: "concrete" },
      { d: "M8.5 3.5 H15.5 V9.5 H8.5 Z", tone: "concrete" },
    ],
  },
  {
    key: "equipment",
    label: "Equipment",
    parts: [
      { d: "M1.5 18 H22.5 V22 H1.5 Z", tone: "concrete" },
      { d: "M3.5 9 H13.5 V18 H3.5 Z", tone: "metal" },
      {
        d: "M13.5 10.5 H19 C20.4 10.5 21.5 11.6 21.5 13 V15.5 C21.5 16.9 20.4 18 19 18 H13.5 Z",
        tone: "stoneDark",
      },
      { d: "M6.5 9 V4 H12 V6 H8.5 V9 Z", tone: "metal" },
    ],
  },
  {
    key: "house",
    label: "House",
    parts: [
      { d: "M4.5 10.5 H19.5 V22 H4.5 Z", tone: "wall" },
      { d: "M1.5 11.5 L12 2.5 L22.5 11.5 Z", tone: "roof" },
      { d: "M10 22 V15.5 H14 V22 Z", tone: "door" },
    ],
  },
];

/** A drawn line this close to level or plumb (degrees) is drawn straight. */
export const LINE_SNAP_DEGREES = 8;
/** At most this many drawn shapes and landmarks on one pool. */
export const DRAWING_MAX = 40;
export const LANDMARKS_MAX = 30;
/** A landmark's drawn size, in diagram units (of 160 x 100), and how far it can be resized. */
export const LANDMARK_SIZE = 20;
export const LANDMARK_MIN = 10;
export const LANDMARK_MAX = 44;

/** A landmark size kept within what can be pinched, to a tenth. */
export function clampLandmarkSize(size: number): number {
  return Math.round(Math.min(LANDMARK_MAX, Math.max(LANDMARK_MIN, size)) * 10) / 10;
}
/** How small and large a spa can be pinched, as a radius in diagram units. */
export const SPA_R_MIN = 7;
export const SPA_R_MAX = 28;

export interface PoolDiagram {
  width: number;
  height: number;
  /** SVG path for the pool outline, in the diagram's coordinates; empty for a drawn pool. */
  pool: string;
  /** The spa: a circle of radius r, or with `square`, a rounded square r from its center. */
  spa: { cx: number; cy: number; r: number; square: boolean } | null;
  /** Each drawn shape as an SVG path, stroked like the pool's outline. */
  drawing: string[];
  /**
   * Landmarks: each drawing's parts (LANDMARKS) in a `size` box centered on cx, cy, i.e.
   * translate(cx - size / 2, cy - size / 2) scale(size / 24); flipped, mirrored about cx
   * (`mirror` "x"): translate(cx + size / 2, cy - size / 2) scale(-size / 24, size / 24), or
   * about cy ("y"): translate(cx - size / 2, cy + size / 2) scale(size / 24, -size / 24).
   */
  landmarks: {
    kind: LandmarkKind;
    cx: number;
    cy: number;
    size: number;
    flip: boolean;
    mirror: "x" | "y";
    parts: LandmarkPart[];
  }[];
}

/**
 * The preset shapes on the Pool Shape tiles. Freeform left the tiles (owner, 2026-10-19: Draw
 * covers it); pools already set to it still draw it.
 */
export const DIAGRAM_SHAPES: { key: DiagramShape; label: string }[] = [
  { key: "rectangle", label: "Rectangle" },
  { key: "oval", label: "Oval" },
  { key: "kidney", label: "Kidney" },
  { key: "l_shape", label: "L-shape" },
  { key: "roman", label: "Roman" },
  { key: "grecian", label: "Grecian" },
  { key: "figure_eight", label: "Figure 8" },
];

/** Every shape a pool can be saved with: the tiles, plus Freeform (older pools) and a drawn one. */
export function isDiagramShape(v: unknown): v is DiagramShape {
  return v === "freeform" || v === "custom" || DIAGRAM_SHAPES.some((s) => s.key === v);
}

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
  custom: "",
  figure_eight:
    "M40 16 C58 16 64 28 70 34 C76 28 82 16 100 16 C120 16 132 32 132 50 C132 68 120 84 100 84 C82 84 76 72 70 66 C64 72 58 84 40 84 C20 84 8 68 8 50 C8 32 20 16 40 16 Z",
};

const DIAGRAM_WIDTH = 160;
const DIAGRAM_HEIGHT = 100;
/** The paths are drawn in x 8..132; mirroring flips them about the middle of that. */
const MIRROR_AXIS = 140;
/** How far right a centered pool is drawn: x 18..142, the middle of the 160-wide diagram. */
export const POOL_CENTER_OFFSET = 10;

/** Moves a pool path right by dx (absolute M, L, H, V, Q, C, and Z only, as mirrorPath). */
export function offsetPath(path: string, dx: number): string {
  if (!dx || !path) return path;
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
    out.push(String(isX ? n + dx : n));
    index++;
  }
  return out.join(" ").replace(/ ([A-Za-z])/g, " $1");
}

/**
 * A layout moved to the centered pool: the spa, landmarks and drawing move right with it, so
 * they stay where they were against the outline. The shape editors open with this, and save it.
 */
export function centerLayout(layout: DiagramLayout): DiagramLayout {
  if (layout.centered) return layout;
  const dx = POOL_CENTER_OFFSET / DIAGRAM_WIDTH;
  const x = (v: number) => Math.round(Math.min(1, Math.max(0, v + dx)) * 10_000) / 10_000;
  return {
    ...layout,
    centered: true,
    ...(layout.spa ? { spa: { ...layout.spa, x: x(layout.spa.x) } } : {}),
    ...(layout.landmarks ? { landmarks: layout.landmarks.map((l) => ({ ...l, x: x(l.x) })) } : {}),
    ...(layout.drawing
      ? {
          drawing: layout.drawing.map((d): DrawnShape =>
            d.type === "line"
              ? { ...d, x1: x(d.x1), x2: x(d.x2) }
              : d.type === "circle"
                ? { ...d, cx: x(d.cx) }
                : { ...d, points: d.points.map(([px, py]) => [x(px), py] as [number, number]) },
          ),
        }
      : {}),
  };
}

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

const isUnitPair = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && isUnitNumber(p[0]) && isUnitNumber(p[1]);

function drawnShape(v: unknown): DrawnShape | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.type === "line" && [o.x1, o.y1, o.x2, o.y2].every(isUnitNumber))
    return {
      type: "line",
      x1: o.x1 as number,
      y1: o.y1 as number,
      x2: o.x2 as number,
      y2: o.y2 as number,
    };
  if (o.type === "circle" && [o.cx, o.cy, o.rx, o.ry].every(isUnitNumber))
    return {
      type: "circle",
      cx: o.cx as number,
      cy: o.cy as number,
      rx: o.rx as number,
      ry: o.ry as number,
    };
  if (o.type === "pen" && Array.isArray(o.points)) {
    const points = o.points.filter(isUnitPair).slice(0, 400);
    return points.length >= 2 ? { type: "pen", points } : null;
  }
  return null;
}

/** Read a layout from a synced row. Anything unrecognized is dropped, never thrown. */
export function parseDiagramLayout(value: unknown): DiagramLayout {
  if (!value || typeof value !== "object") return {};
  const o = value as Record<string, unknown>;
  const layout: DiagramLayout = {};
  if (o.mirror === true) layout.mirror = true;
  if (o.centered === true) layout.centered = true;
  const spa = o.spa as Record<string, unknown> | undefined;
  if (spa && isUnitNumber(spa.x) && isUnitNumber(spa.y)) {
    layout.spa = { x: spa.x, y: spa.y };
    if (SPA_SIZES.some((z) => z.key === spa.size)) layout.spa.size = spa.size as SpaSize;
    if (SPA_SHAPES.some((z) => z.key === spa.shape)) layout.spa.shape = spa.shape as SpaShape;
    if (typeof spa.r === "number" && spa.r >= SPA_R_MIN && spa.r <= SPA_R_MAX) layout.spa.r = spa.r;
  }
  if (Array.isArray(o.drawing)) {
    const drawing = o.drawing
      .map(drawnShape)
      .filter((d): d is DrawnShape => !!d)
      .slice(0, DRAWING_MAX);
    if (drawing.length) layout.drawing = drawing;
  }
  if (Array.isArray(o.landmarks)) {
    const landmarks = o.landmarks
      .filter(
        (l): l is Landmark =>
          !!l &&
          typeof l === "object" &&
          LANDMARKS.some((k) => k.key === (l as Landmark).kind) &&
          isUnitNumber((l as Landmark).x) &&
          isUnitNumber((l as Landmark).y),
      )
      .map((l) => ({
        kind: l.kind,
        x: l.x,
        y: l.y,
        ...(typeof l.s === "number" && l.s >= LANDMARK_MIN && l.s <= LANDMARK_MAX
          ? { s: l.s }
          : {}),
        ...(l.flip === true ? { flip: true } : {}),
      }))
      .slice(0, LANDMARKS_MAX);
    if (landmarks.length) layout.landmarks = landmarks;
  }
  return layout;
}

/** The nearest preset for a pinched spa radius, written beside `r` for older app builds. */
export function spaSizeFor(r: number): SpaSize {
  return SPA_SIZES.reduce((best, z) => (Math.abs(z.r - r) < Math.abs(best.r - r) ? z : best)).key;
}

/** A spa radius kept within what can be pinched, to a tenth. */
export function clampSpaR(r: number): number {
  return Math.round(Math.min(SPA_R_MAX, Math.max(SPA_R_MIN, r)) * 10) / 10;
}

const tenth = (n: number) => String(Math.round(n * 10) / 10);

/** A drawn shape as an SVG path in the 160 x 100 diagram (circles as four curves, no arcs). */
export function drawnPath(d: DrawnShape): string {
  const W = DIAGRAM_WIDTH;
  const H = DIAGRAM_HEIGHT;
  if (d.type === "line")
    return `M${tenth(d.x1 * W)} ${tenth(d.y1 * H)} L${tenth(d.x2 * W)} ${tenth(d.y2 * H)}`;
  if (d.type === "pen")
    return d.points.map(([x, y], i) => `${i ? "L" : "M"}${tenth(x * W)} ${tenth(y * H)}`).join(" ");
  const cx = d.cx * W;
  const cy = d.cy * H;
  const rx = d.rx * W;
  const ry = d.ry * H;
  const k = 0.5523;
  return [
    `M${tenth(cx)} ${tenth(cy - ry)}`,
    `C${tenth(cx + k * rx)} ${tenth(cy - ry)} ${tenth(cx + rx)} ${tenth(cy - k * ry)} ${tenth(cx + rx)} ${tenth(cy)}`,
    `C${tenth(cx + rx)} ${tenth(cy + k * ry)} ${tenth(cx + k * rx)} ${tenth(cy + ry)} ${tenth(cx)} ${tenth(cy + ry)}`,
    `C${tenth(cx - k * rx)} ${tenth(cy + ry)} ${tenth(cx - rx)} ${tenth(cy + k * ry)} ${tenth(cx - rx)} ${tenth(cy)}`,
    `C${tenth(cx - rx)} ${tenth(cy - k * ry)} ${tenth(cx - k * rx)} ${tenth(cy - ry)} ${tenth(cx)} ${tenth(cy - ry)} Z`,
  ].join(" ");
}

/**
 * A drag on the diagram as a drawn shape (Draw's Line, Circle, and Freeform), points 0..1.
 * A line or circle from where the drag started to where it ended (the circle fills the box
 * between them); a freehand stroke from every point, thinned to at most 400. Null when too
 * small to see.
 */
export function drawnShapeFrom(
  tool: "line" | "circle" | "pen",
  points: { x: number; y: number }[],
): DrawnShape | null {
  const c = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  if (tool === "pen") {
    const kept: [number, number][] = [];
    for (const p of points) {
      const q: [number, number] = [c(p.x), c(p.y)];
      const prev = kept[kept.length - 1];
      if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) >= 0.004) kept.push(q);
    }
    if (kept.length < 2) return null;
    const step = Math.ceil(kept.length / 400);
    const thin = step > 1 ? kept.filter((_, i) => i % step === 0 || i === kept.length - 1) : kept;
    return { type: "pen", points: thin.slice(0, 400) };
  }
  if (Math.hypot(last.x - first.x, last.y - first.y) < 0.02) return null;
  if (tool === "line") {
    // Within 8 degrees of level or plumb (in the diagram's own units), the line snaps straight
    // (owner, 2026-10-19: "lock to grid when held straight vertical or horizontal").
    const dx = Math.abs(last.x - first.x) * DIAGRAM_WIDTH;
    const dy = Math.abs(last.y - first.y) * DIAGRAM_HEIGHT;
    const tan = Math.tan((LINE_SNAP_DEGREES * Math.PI) / 180);
    const end =
      dy <= dx * tan
        ? { x: last.x, y: first.y }
        : dx <= dy * tan
          ? { x: first.x, y: last.y }
          : last;
    return { type: "line", x1: c(first.x), y1: c(first.y), x2: c(end.x), y2: c(end.y) };
  }
  return {
    type: "circle",
    cx: c((first.x + last.x) / 2),
    cy: c((first.y + last.y) / 2),
    rx: c(Math.abs(last.x - first.x) / 2),
    ry: c(Math.abs(last.y - first.y) / 2),
  };
}

/**
 * Clear (owner, 2026-10-19: "Clear would empty everything in the diagram"): no outline, no
 * spa, nothing drawn, no landmarks. What Save writes for a cleared pool.
 */
export const CLEARED_DIAGRAM: { shape: DiagramShape; hasSpa: boolean; layout: DiagramLayout } = {
  shape: "custom",
  hasSpa: false,
  layout: {},
};

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
  const dx = layout?.centered ? POOL_CENTER_OFFSET : 0;
  const placed = layout?.spa;
  const r = placed?.r ?? SPA_SIZES.find((z) => z.key === (placed?.size ?? "medium"))!.r;
  return {
    width: DIAGRAM_WIDTH,
    height: DIAGRAM_HEIGHT,
    pool: offsetPath(mirror && path ? mirrorPath(path) : path, dx),
    spa: hasSpa
      ? {
          cx: placed ? placed.x * DIAGRAM_WIDTH : mirror ? DIAGRAM_WIDTH - 145 : 145,
          cy: placed ? placed.y * DIAGRAM_HEIGHT : 22,
          r,
          square: placed?.shape === "square",
        }
      : null,
    drawing: (layout?.drawing ?? []).map(drawnPath),
    landmarks: (layout?.landmarks ?? []).map((l) => {
      const size = l.s ?? LANDMARK_SIZE;
      const half = size / 2;
      return {
        kind: l.kind,
        cx: Math.min(DIAGRAM_WIDTH - half, Math.max(half, l.x * DIAGRAM_WIDTH)),
        cy: Math.min(DIAGRAM_HEIGHT - half, Math.max(half, l.y * DIAGRAM_HEIGHT)),
        size,
        flip: l.flip === true,
        mirror: LANDMARKS.find((k) => k.key === l.kind)!.mirror ?? "x",
        parts: LANDMARKS.find((k) => k.key === l.kind)!.parts,
      };
    }),
  };
}
