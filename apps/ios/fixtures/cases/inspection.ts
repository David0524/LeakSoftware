import {
  CHECKLIST_SECTION_LABELS,
  checklistSectionSummary,
  checklistTallyText,
  inspectionTallyText,
  needAttentionText,
  INSPECTION_SECTIONS,
  NOT_PRESENT_LABEL,
  choiceOptions,
  foldedItems,
  inspectionAnswerText,
  inspectionAnswerValues,
  inspectionProgress,
  inspectionProgressText,
  inspectionTone,
  inspectionValue,
  intakeQuestionsFor,
  isGate,
  isInspectionAnswer,
  optionsFromText,
  optionsToText,
  toggleChoice,
  type ChoiceOption,
  type FoldRow,
  type InspectionValue,
  markRemainingLabel,
  FINDING_STATUS_LABELS,
  currentVerdict,
  instanceLabel,
  verdictLabel,
  verdictOptions,
  verdictValues,
  DIAGRAM_SHAPES,
  CLEARED_DIAGRAM,
  DRAWING_MAX,
  LANDMARKS,
  LANDMARKS_MAX,
  LANDMARK_SIZE,
  LANDMARK_MIN,
  LANDMARK_MAX,
  LINE_SNAP_DEGREES,
  clampLandmarkSize,
  SPA_R_MAX,
  SPA_R_MIN,
  clampSpaR,
  drawnPath,
  drawnShapeFrom,
  isDiagramShape,
  spaSizeFor,
  type DrawnShape,
  SPA_SHAPES,
  SPA_SIZES,
  mirrorPath,
  offsetPath,
  centerLayout,
  POOL_CENTER_OFFSET,
  parseDiagramLayout,
  calculate,
  checklistTally,
  componentApplies,
  formatAddress,
  formatSchedule,
  groupJobs,
  JOB_SORTS,
  jobSort,
  sortJobs,
  ALL_JOB_TYPES,
  JOB_TYPE_FILTER_TITLE,
  jobTypeFilter,
  jobTypeFilterLabel,
  jobTypeFilters,
  jobsEmpty,
  matchesJobType,
  type JobTypeFilter,
  type Services,
  type JobSortItem,
  localDate,
  nativeMapsUrl,
  newJobRecords,
  nextInstance,
  nextCustomItem,
  customItemName,
  removeItemConfirm,
  normalizeTestData,
  planComponents,
  poolDiagram,
  tapLandmark,
  landmarkTurn,
  propertyLocation,
  validateFinding,
  validateNewJob,
  validateTestData,
  previewTest,
  type ChecklistItemResult,
  type ComponentType,
  type DiagramLayout,
  type DiagramShape,
  type Job,
  type JobComponent,
  type JobType,
  type MapPlace,
  type NewJobDetails,
  type NewJobInput,
  type Property,
  type TestData,
  type TestFieldSchema,
  type TestType,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// Row builders: the Swift row structs need every field TypeScript marks required.
const type = (key: string, over: Partial<ComponentType> = {}): ComponentType => ({
  id: key,
  company_id: "c",
  key,
  name: key[0]!.toUpperCase() + key.slice(1),
  allows_multiple: false,
  default_count: 1,
  applies_to: "pool",
  methods: ["Visual"],
  sort_order: 10,
  active: true,
  ...over,
});

type Place = Pick<Property, "has_pool" | "has_spa" | "address_line1"> & Partial<Property>;
const prop = (over: Partial<Property> = {}): Place => ({
  address_line1: "1 Main St",
  has_pool: true,
  has_spa: false,
  ...over,
});

const types = [
  type("skimmer", { allows_multiple: true, default_count: 2, sort_order: 10 }),
  type("return", { allows_multiple: true, default_count: 4, sort_order: 20 }),
  type("spa", { applies_to: "spa", sort_order: 70 }),
  type("light", { allows_multiple: true, default_count: 1, applies_to: "both", sort_order: 40 }),
  type("retired", { active: false }),
  type("gone", { deleted_at: "2026-10-01T00:00:00Z" }),
  type("vinyl_liner", { applies_to_pool_type: "vinyl", sort_order: 30 }),
  type("filter_clean", { job_type: "maintenance", on_schedule: true, sort_order: 5 }),
  type("skim", { job_type: "maintenance", sort_order: 5 }),
  type("brush", { job_type: "maintenance", sort_order: 5, default_count: 3 }),
  type("drain", { allows_multiple: true, default_count: 0, sort_order: 15 }),
  type("tie_a", { sort_order: 25 }),
  type("tie_b", { sort_order: 25, deleted_at: "" }),
  // Pool inspection questions (2026-10-20).
  type("insp_gate", {
    job_type: "inspection",
    section: "insp_equipment",
    answer: "choice",
    group_label: "Solar",
    options: [{ label: "Yes" }, { label: "No", fold: true }],
    sort_order: 2,
  }),
  type("insp_text", {
    job_type: "inspection",
    section: "insp_heaters",
    answer: "text",
    sort_order: 1,
  }),
];

// Pool inspection options: an ordinary question, a leak question, and a gate.
const yesNo: ChoiceOption[] = [
  { label: "Yes", flag: "ok" },
  { label: "No", flag: "attention" },
  { label: "N/A", flag: "na" },
];
const leakChoice: ChoiceOption[] = [
  { label: "Leaking", flag: "leaking" },
  { label: "Not Leaking", flag: "ok" },
  { label: "N/A", flag: "na" },
];
const gate: ChoiceOption[] = [{ label: "Yes" }, { label: "No", fold: true }];
const parts: ChoiceOption[] = [
  { label: "Pool main drain" },
  { label: "Pool skimmer" },
  { label: "Spa drain" },
];

/** A checklist row for folding and progress. */
const frow = (
  id: string,
  section: string | null,
  group: string | null,
  options: unknown,
  value: unknown,
  result: { status: string; outcome: string | null } | null = value
    ? { status: "inspected", outcome: "ok" }
    : { status: "pending", outcome: null },
) => ({ id, section, group_label: group, options, value, result });

const foldRows = [
  frow("g1", "insp_equipment", "Solar", gate, "No"),
  frow("g2", "insp_equipment", "Solar", yesNo, null),
  frow("g3", "insp_equipment", "Solar", leakChoice, "Leaking", {
    status: "inspected",
    outcome: "leaking",
  }),
  frow("h1", "insp_equipment", "Booster pump", gate, "Yes"),
  frow("h2", "insp_equipment", "Booster pump", yesNo, "No", {
    status: "inspected",
    outcome: "attention",
  }),
  // The same group name in another section is another group.
  frow("s1", "insp_heaters", "Solar", yesNo, null),
  frow("s2", "insp_heaters", "Solar", yesNo, null),
  frow("u1", "insp_equipment", null, gate, "No"),
  frow("u2", "insp_equipment", null, yesNo, "N/A", { status: "excluded", outcome: null }),
  frow("lone", "insp_covers", "Alone", gate, "No"),
  frow("e1", "insp_fencing", "", gate, "No"),
  frow("e2", "insp_fencing", "", yesNo, null),
  frow("n1", "insp_plumbing", "Not a gate", yesNo, "No", {
    status: "inspected",
    outcome: "attention",
  }),
  frow("n2", "insp_plumbing", "Not a gate", yesNo, null, null),
];

const comp = (id: string, typeId = "t", n = 1, over: Partial<JobComponent> = {}): JobComponent => ({
  id,
  company_id: "c",
  job_id: "j",
  component_type_id: typeId,
  instance_number: n,
  label: id,
  sort_order: 0,
  ...over,
});
const result = (id: string, over: Partial<ChecklistItemResult>): ChecklistItemResult => ({
  id: `r-${id}`,
  company_id: "c",
  job_id: "j",
  job_component_id: id,
  status: "inspected",
  ...over,
});

const testType = (over: Partial<TestType>): TestType => ({
  id: "tt",
  company_id: "c",
  key: "k",
  name: "Test",
  field_schema: { fields: [] },
  schema_version: 1,
  calculator: null,
  result_options: ["pass", "fail", "inconclusive"],
  sort_order: 1,
  active: true,
  ...over,
});
const pressure = (options?: Record<string, number>) =>
  testType({
    calculator: "pressure_drop",
    field_schema: { fields: [], ...(options ? { options } : {}) },
  });
const bucket = (options?: Record<string, number>) =>
  testType({
    calculator: "bucket_evaporation",
    field_schema: { fields: [], ...(options ? { options } : {}) },
  });
const bucketBase = { pool_start_in: 10, bucket_start_in: 10, duration_hours: 24 };

const schema: TestFieldSchema = {
  fields: [
    { key: "line_name", label: "Line", type: "text", required: true },
    { key: "start_psi", label: "Start pressure", type: "number", unit: "PSI", required: true },
    { key: "observation", label: "Result", type: "select", options: ["No draw", "Leak", "5"] },
    { key: "notes", label: "Notes", type: "textarea" },
    { key: "minutes", label: "Minutes", type: "number" },
  ],
};

// Reading bounds (owner, 2026-10-20), as the shop defaults set them.
const bounded: TestFieldSchema = {
  fields: [
    {
      key: "start_psi",
      label: "Start pressure",
      type: "number",
      unit: "PSI",
      required: true,
      min: 0,
      max: 150,
    },
    {
      key: "end_psi",
      label: "End pressure",
      type: "number",
      unit: "PSI",
      required: true,
      min: 0,
      max: 150,
    },
    { key: "duration_min", label: "Duration", type: "number", unit: "min", min: 0, max: 1440 },
    { key: "level", label: "Level", type: "number", min: 0.5 },
    { key: "flow", label: "Flow", type: "number", unit: "gal", max: 2.5 },
    { key: "temp", label: "Temperature", type: "number", min: -40, max: 120 },
  ],
};
const boundedPressure = testType({ calculator: "pressure_drop", field_schema: bounded });

const blank: NewJobInput = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  scheduleDate: "",
  scheduleTime: "",
};
const filled: NewJobInput = { ...blank, customerName: "M", addressLine1: "1 St" };

// Timing as JSON: "now" carries an ISO string, turned into a Date here.
type Timing =
  | { kind: "now"; at: string }
  | { kind: "scheduled"; date: string; time: string; timeZone: string }
  | { kind: "later" };
type Details = Omit<NewJobDetails, "timing"> & { timing: Timing };
const details = (over: Partial<Details> = {}): Details => ({
  poolType: "vinyl",
  hasSpa: true,
  accessNotes: " gate 4821 ",
  timing: { kind: "now", at: "2026-10-12T17:00:00Z" },
  assignedUserId: "u1",
  ...over,
});

const TZ = "America/Phoenix";
const NOW = "2026-10-12T17:00:00Z"; // 10:00 AM in Phoenix
const job = (id: string, over: Partial<Job>): Job => ({
  id,
  company_id: "c",
  type: "detection",
  property_id: "p",
  status: "scheduled",
  ...over,
});
const jobs = [
  job("late-today", { scheduled_start: "2026-10-13T05:30:00Z" }),
  job("tomorrow", { scheduled_start: "2026-10-13T16:00:00Z" }),
  job("tomorrow-early", { scheduled_start: "2026-10-13T14:00:00.000Z" }),
  job("running", { status: "in_progress", scheduled_start: "2026-10-01T16:00:00Z" }),
  job("running-undated", { status: "in_progress", started_at: "2026-10-12T15:00:00+00:00" }),
  job("no-date", { status: "unscheduled", created_at: "2026-10-10T00:00:00Z" }),
  job("no-date-newer", { status: "unscheduled", created_at: "2026-10-11T00:00:00Z" }),
  job("no-date-blank", { status: "unscheduled" }),
  job("scheduled-undated", { created_at: "2026-10-09T00:00:00Z" }),
  job("paid", { status: "paid", scheduled_start: "2026-10-05T16:00:00Z" }),
  job("old", { status: "paid", scheduled_start: "2026-06-01T16:00:00Z" }),
  job("canceled-recent", { status: "canceled", created_at: "2026-10-11T12:00:00Z" }),
  job("done-started", { status: "done", started_at: "2026-10-08T12:00:00Z" }),
  job("gone", { deleted_at: "2026-10-11T00:00:00Z" }),
  job("missed", { scheduled_start: "2026-10-09T16:00:00Z" }),
  job("missed-long-ago", { scheduled_start: "2026-01-09T16:00:00Z" }),
  job("cutoff", { status: "paid", started_at: "2026-09-12T17:00:00Z" }),
  job("before-cutoff", { status: "paid", started_at: "2026-09-12T16:59:59.999Z" }),
];

const POOL = { lat: 33.44962, lng: -111.94637 };

export const inspection: ModuleCases = {
  CHECKLIST_SECTION_LABELS: rule(() => CHECKLIST_SECTION_LABELS, [[]]),
  DIAGRAM_SHAPES: rule(() => DIAGRAM_SHAPES, [[]]),
  SPA_SIZES: rule(() => SPA_SIZES, [[]]),
  SPA_SHAPES: rule(() => SPA_SHAPES, [[]]),
  LANDMARKS: rule(() => LANDMARKS, [[]]),
  DRAWING_MAX: rule(() => DRAWING_MAX, [[]]),
  LANDMARKS_MAX: rule(() => LANDMARKS_MAX, [[]]),
  LANDMARK_SIZE: rule(() => LANDMARK_SIZE, [[]]),
  LANDMARK_MIN: rule(() => LANDMARK_MIN, [[]]),
  LANDMARK_MAX: rule(() => LANDMARK_MAX, [[]]),
  LINE_SNAP_DEGREES: rule(() => LINE_SNAP_DEGREES, [[]]),
  clampLandmarkSize: rule(
    (size: number) => clampLandmarkSize(size),
    [[3], [10], [22.26], [22.25], [44], [60], [-1]],
  ),
  SPA_R_MIN: rule(() => SPA_R_MIN, [[]]),
  SPA_R_MAX: rule(() => SPA_R_MAX, [[]]),
  CLEARED_DIAGRAM: rule(() => CLEARED_DIAGRAM, [[]]),
  isDiagramShape: rule(
    (v: unknown) => isDiagramShape(v),
    [
      ["rectangle"],
      ["freeform"],
      ["custom"],
      ["figure_eight"],
      ["triangle"],
      [null],
      [3],
      ["Oval"],
    ],
  ),
  spaSizeFor: rule(
    (r: number) => spaSizeFor(r),
    [[7], [10], [11.5], [11.6], [13], [15], [15.1], [17], [28]],
  ),
  clampSpaR: rule(
    (r: number) => clampSpaR(r),
    [[0], [7], [12.34], [12.35], [27.96], [28], [40], [-3]],
  ),
  drawnPath: rule(
    (d: DrawnShape) => drawnPath(d),
    [
      [{ type: "line", x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.8 }],
      [{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }],
      [{ type: "circle", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.3 }],
      [{ type: "circle", cx: 0.01, cy: 0.02, rx: 0.01, ry: 0.02 }],
      [
        {
          type: "pen",
          points: [
            [0.1, 0.1],
            [0.123, 0.4567],
            [0.5, 0.5],
          ],
        },
      ],
    ],
  ),
  drawnShapeFrom: rule(
    (tool: "line" | "circle" | "pen", points: { x: number; y: number }[]) =>
      drawnShapeFrom(tool, points),
    [
      ["line", []],
      ["line", [{ x: 0.1, y: 0.1 }]],
      [
        "line",
        [
          { x: 0.1, y: 0.1 },
          { x: 0.11, y: 0.11 },
        ],
      ],
      [
        "line",
        [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
          { x: 0.9, y: 0.3 },
        ],
      ],
      [
        "line",
        [
          { x: -0.2, y: 0.1 },
          { x: 1.4, y: 0.123456 },
        ],
      ],
      [
        "circle",
        [
          { x: 0.8, y: 0.9 },
          { x: 0.2, y: 0.1 },
        ],
      ],
      [
        "circle",
        [
          { x: 0.5, y: 0.5 },
          { x: 0.505, y: 0.5 },
        ],
      ],
      ["pen", [{ x: 0.1, y: 0.1 }]],
      [
        "pen",
        [
          { x: 0.1, y: 0.1 },
          { x: 0.101, y: 0.101 },
        ],
      ],
      [
        "pen",
        [
          { x: 0.1, y: 0.1 },
          { x: 0.101, y: 0.101 },
          { x: 0.2, y: 0.2 },
          { x: 1.2, y: -1 },
        ],
      ],
      ["pen", Array.from({ length: 1000 }, (_, i) => ({ x: i / 1000, y: (i % 50) / 50 }))],
      ["pen", Array.from({ length: 450 }, (_, i) => ({ x: i / 450, y: 0.5 }))],
    ],
  ),

  componentApplies: rule(
    (t: ComponentType, p: Place) => componentApplies(t, p),
    [
      [type("a", { applies_to: "spa" }), prop()],
      [type("a", { applies_to: "spa" }), prop({ has_spa: true })],
      [type("a", { applies_to: "pool" }), prop({ has_pool: false, has_spa: true })],
      [type("a", { applies_to: "both" }), prop({ has_pool: false, has_spa: false })],
      [type("a", { applies_to: "both" }), prop({ has_pool: false, has_spa: true })],
      [type("v", { applies_to_pool_type: "vinyl" }), prop({ pool_type: "gunite_plaster" })],
      [type("v", { applies_to_pool_type: "vinyl" }), prop({ pool_type: "vinyl" })],
      [type("v", { applies_to_pool_type: "vinyl" }), prop({ pool_type: null })],
      [type("v", { applies_to_pool_type: "vinyl" }), prop()],
      [type("v", { applies_to_pool_type: "" }), prop({ pool_type: "fiberglass" })],
      [
        type("v", { applies_to_pool_type: "vinyl", applies_to: "spa" }),
        prop({ pool_type: "vinyl" }),
      ],
    ],
  ),

  planComponents: rule(
    (ts: ComponentType[], p: Place, jobType?: JobType) => planComponents(ts, p, jobType),
    [
      [types, prop()],
      [types, prop({ has_spa: true })],
      [types, prop({ has_spa: true, pool_type: "vinyl" })],
      [types, prop({ pool_type: "fiberglass" })],
      [types, prop({ has_pool: false, has_spa: true })],
      [types, prop(), "maintenance"],
      [types, prop(), "repair"],
      [types, prop(), "detection"],
      [types, prop(), "inspection"],
      [[], prop()],
    ],
  ),

  removeItemConfirm: rule(
    (label: string, fromPlan: boolean) => removeItemConfirm(label, fromPlan),
    [
      ["Skimmer 2", false],
      ["Clean filter", true],
      ["Main drain", false],
      ["", true],
    ],
  ),
  nextInstance: rule(
    (t: ComponentType, existing: JobComponent[]) => nextInstance(t, existing),
    [
      [types[1]!, [3, 1, 4].map((n) => comp(`r${n}`, "return", n))],
      [types[1]!, []],
      [types[0]!, [comp("x", "other", 7)]],
      [types[2]!, [comp("s1", "spa", 1)]],
      [
        types[1]!,
        [comp("r9", "return", 9, { deleted_at: "2026-10-01T00:00:00Z" }), comp("r2", "return", 2)],
      ],
      [types[1]!, [comp("r9", "return", 9, { deleted_at: "" })]],
      [type("single", { allows_multiple: true, default_count: 1 }), []],
      [type("single", { allows_multiple: true, default_count: 1 }), [comp("a", "single", 1)]],
    ],
  ),

  customItemName: rule(
    (raw: string) => customItemName(raw),
    [["Cracked deck drain"], ["  Cracked   deck\n drain "], ["   "], [""], ["x".repeat(100)]],
  ),
  nextCustomItem: rule(
    (t: ComponentType, existing: JobComponent[], name: string) => nextCustomItem(t, existing, name),
    [
      [
        type("custom_leak", { allows_multiple: true, default_count: 0, sort_order: 9000 }),
        [],
        "Cracked deck drain",
      ],
      [
        type("custom_leak", { allows_multiple: true, default_count: 0, sort_order: 9000 }),
        [comp("c1", "custom_leak", 1), comp("c3", "custom_leak", 3)],
        "Dead frog in skimmer",
      ],
      [
        type("custom_leak", { allows_multiple: true, default_count: 0, sort_order: 9000 }),
        [comp("c9", "custom_leak", 9, { deleted_at: "2026-10-01T00:00:00Z" })],
        "  Loose ladder  ",
      ],
      [
        type("custom_leak", { allows_multiple: true, default_count: 0, sort_order: 9000 }),
        [],
        "   ",
      ],
    ],
  ),

  instanceLabel: rule(
    (t: ComponentType, n: number) => instanceLabel(t, n),
    [
      [types[1]!, 1],
      [types[1]!, 3],
      [types[0]!, 1],
      [types[0]!, 2],
      [type("single", { allows_multiple: true, default_count: 1 }), 1],
      [type("single", { allows_multiple: true, default_count: 1 }), 2],
    ],
  ),
  FINDING_STATUS_LABELS: rule(() => FINDING_STATUS_LABELS, [[]]),
  verdictLabel: rule(
    (
      r: { status: "pending" | "inspected" | "excluded"; outcome: string | null } | null,
      answer?: string,
    ) => verdictLabel(r as never, answer as never),
    [
      null,
      ...(["pending", "inspected", "excluded"] as const).flatMap((status) =>
        [null, "ok", "leaking", "attention"].map((outcome) => ({ status, outcome })),
      ),
    ]
      .flatMap(
        (r) => [[r], [r, "leak"], [r, "yes_no"], [r, "done"]] as unknown as [never, string?][],
      )
      .concat(
        // Pool inspection answers read their value.
        [
          [{ status: "inspected", outcome: "ok", value: "Yes" }, "choice"],
          [{ status: "inspected", outcome: "attention", value: "No" }, "choice"],
          [{ status: "excluded", outcome: null, value: "N/A" }, "choice"],
          [{ status: "excluded", outcome: null, value: null }, "choice"],
          [{ status: "inspected", outcome: "ok", value: null }, "choice"],
          [{ status: "inspected", outcome: "ok", value: ["Pool skimmer", "Spa drain"] }, "multi"],
          [{ status: "inspected", outcome: "ok", value: [] }, "multi"],
          [{ status: "inspected", outcome: "ok", value: "Gas, 400k BTU" }, "text"],
          [{ status: "pending", outcome: null, value: "Yes" }, "choice"],
          [null, "text"],
        ] as unknown as [never, string?][],
      ),
  ),
  verdictOptions: rule(
    (answer: string | null) => verdictOptions(answer === null ? undefined : ({ answer } as never)),
    [[null], ["leak"], ["yes_no"], ["done"]],
  ),
  currentVerdict: rule(
    (r: { status: string; outcome: string | null } | null) =>
      currentVerdict((r ?? undefined) as never),
    [
      null,
      ...["pending", "inspected", "excluded"].flatMap((status) =>
        [null, "ok", "leaking", "attention"].map((outcome) => ({ status, outcome })),
      ),
    ].map((r) => [r] as [never]),
  ),
  verdictValues: rule(
    (v: string | null, userId: string | null, now: string) =>
      verdictValues(v as never, userId, new Date(now)),
    [null, "ok", "leaking", "attention", "na"].flatMap((v) => [
      [v, "u1", "2026-10-19T15:04:05.123Z"],
      [v, null, "2026-01-01T00:00:00.000Z"],
    ]) as [string | null, string | null, string][],
  ),
  checklistTally: rule(
    (components: JobComponent[], results: ChecklistItemResult[]) =>
      checklistTally(components, results),
    [
      [
        ["a", "b", "c", "d", "e"].map((id) => comp(id)),
        [
          result("a", { outcome: "ok" }),
          result("b", { outcome: "leaking" }),
          result("c", { outcome: "attention" }),
          result("d", { status: "excluded" }),
        ],
      ],
      [[], []],
      [
        ["a", "b", "c"].map((id) => comp(id)),
        [
          result("a", { outcome: null }),
          result("b", { status: "pending", outcome: "leaking" }),
          result("c", { outcome: "leaking", deleted_at: "2026-10-01T00:00:00Z" }),
        ],
      ],
      [
        [
          comp("a"),
          comp("b", "t", 1, { deleted_at: "2026-10-01T00:00:00Z" }),
          comp("c", "t", 1, { deleted_at: "" }),
        ],
        [
          result("a", { outcome: "ok" }),
          result("a", { outcome: "leaking" }),
          result("b", { outcome: "leaking" }),
          result("c", { status: "excluded", deleted_at: "" }),
        ],
      ],
    ],
  ),

  // The test types' calculators (pressure drop and bucket evaporation), with vitest's inputs.
  calculate: rule(
    (t: TestType, data: TestData) => calculate(t, data),
    [
      [pressure(), { start_psi: 20, end_psi: 20, duration_min: 15 }],
      [pressure(), { start_psi: "20", end_psi: "12", duration_min: "15" }],
      [pressure({ pass_max_drop_psi: 0.5 }), { start_psi: 20, end_psi: 19.5, duration_min: 15 }],
      [pressure({ pass_max_drop_psi: 0.5 }), { start_psi: 20, end_psi: 19.4, duration_min: 15 }],
      [pressure({ min_duration_min: 15 }), { start_psi: 20, end_psi: 20, duration_min: 5 }],
      [pressure({ min_duration_min: 15 }), { start_psi: 20, end_psi: 20 }],
      [pressure({ min_duration_min: 15 }), { start_psi: 20, end_psi: 25, duration_min: 5 }],
      [pressure(), { start_psi: 20, end_psi: 21, duration_min: 15 }],
      [pressure(), { start_psi: 20, end_psi: "" }],
      [pressure(), { start_psi: 20.3, end_psi: 20.1 }],
      [pressure(), { start_psi: 20, end_psi: 19.999 }],
      [pressure(), { start_psi: 20, end_psi: 20.004 }],
      [pressure(), { start_psi: 20, end_psi: 19.995, duration_min: 7 }],
      [pressure(), { start_psi: 20, end_psi: 12, duration_min: 0 }],
      [pressure(), { start_psi: 20, end_psi: 12, duration_min: -5 }],
      [pressure(), { start_psi: 20, end_psi: 12, duration_min: 2.5 }],
      [pressure(), { start_psi: " 0x14 ", end_psi: "1e1", duration_min: ".5" }],
      [pressure(), { start_psi: "abc", end_psi: 12 }],
      [pressure(), { start_psi: "Infinity", end_psi: 12 }],
      [pressure(), { start_psi: "1e21", end_psi: 0, duration_min: 3 }],
      [pressure(), { start_psi: 1e21, end_psi: 1, duration_min: 3 }],
      [pressure(), { start_psi: " 20﻿", end_psi: "18." }],
      [pressure(), { start_psi: "-0x10", end_psi: 0 }],
      [pressure(), { start_psi: "0b101", end_psi: "0o3" }],
      [pressure(), { start_psi: "+5", end_psi: "-5" }],
      [pressure(), { start_psi: null, end_psi: 5 }],
      [pressure(), {}],
      [bucket(), { ...bucketBase, pool_end_in: 9.75, bucket_end_in: 9.75 }],
      [bucket(), { ...bucketBase, pool_end_in: 9.25, bucket_end_in: 9.94 }],
      [
        bucket({ fail_over_in_per_day: 0.125 }),
        { ...bucketBase, duration_hours: 12, pool_end_in: 9.9, bucket_end_in: 9.95 },
      ],
      [bucket(), { ...bucketBase, pool_end_in: 9, bucket_end_in: 9, duration_hours: 0 }],
      [bucket(), { ...bucketBase, pool_end_in: 9, bucket_end_in: 9, duration_hours: -1 }],
      [bucket(), { ...bucketBase, pool_end_in: 9.9, bucket_end_in: 9.5 }],
      [bucket(), { ...bucketBase, pool_end_in: 9.5, bucket_end_in: 9.75, duration_hours: 36 }],
      [bucket(), { ...bucketBase, pool_end_in: 9.7, bucket_end_in: 9.95, duration_hours: 7 }],
      [bucket(), { ...bucketBase, pool_end_in: "", bucket_end_in: 9 }],
      [bucket(), { ...bucketBase, pool_end_in: 9.0005, bucket_end_in: 10, duration_hours: 3 }],
      [testType({}), { start_psi: 20, end_psi: 10 }],
    ],
  ),

  validateTestData: rule(
    (s: TestFieldSchema, data: TestData) => validateTestData(s, data),
    [
      [schema, { line_name: "", start_psi: "abc", observation: "Maybe" }],
      [schema, { line_name: "Return 1", start_psi: "20" }],
      [schema, {}],
      [schema, { line_name: "  ", start_psi: null, observation: "", minutes: " " }],
      [schema, { line_name: "x", start_psi: "-1", minutes: -0.5 }],
      [schema, { line_name: "x", start_psi: 0, observation: 5 }],
      [schema, { line_name: 7, start_psi: "-0", observation: "Leak", minutes: "1e2" }],
      [schema, { line_name: "x", start_psi: "Infinity" }],
      [schema, { line_name: "x", start_psi: "1,5" }],
      [{ fields: [{ key: "a", label: "ÀBC Ünit", type: "text", required: true }] }, {}],
      [{ fields: [{ key: "s", label: "S", type: "select" }] }, { s: "anything" }],
      [bounded, { start_psi: "1e23", end_psi: "-2", duration_min: 1441 }],
      [bounded, { start_psi: 150, end_psi: "0", duration_min: "1440", level: "0.5", flow: 2.5 }],
      [bounded, { start_psi: "150.01", end_psi: -0, level: 0.49, flow: "2.6", temp: -41 }],
      [bounded, { start_psi: "Infinity", end_psi: "abc", temp: -3 }],
      [bounded, { start_psi: 20, end_psi: 12, temp: 121 }],
      [{ fields: [{ key: "x", label: "X", type: "number", min: 1e21, max: 1e-7 }] }, { x: 5 }],
      [{ fields: [{ key: "x", label: "X", type: "number", unit: "", max: 1 }] }, { x: 5 }],
    ],
  ),

  // The live summary: readings that fail the checks count as blank.
  previewTest: rule(
    (t: TestType, data: TestData) => previewTest(t, data),
    [
      [boundedPressure, { start_psi: "1e23", end_psi: "0" }],
      [boundedPressure, { start_psi: "20", end_psi: "12", duration_min: "15" }],
      [boundedPressure, { start_psi: "20", end_psi: "12", duration_min: "9999" }],
      [boundedPressure, { start_psi: 20, end_psi: "", duration_min: 15 }],
      [pressure(), { start_psi: "1e21", end_psi: 0, duration_min: 3 }],
      [bucket(), { ...bucketBase, pool_end_in: 9.5, bucket_end_in: 9.75 }],
      [testType({}), { start_psi: 20, end_psi: 10 }],
    ],
  ),

  normalizeTestData: rule(
    (s: TestFieldSchema, data: TestData) => normalizeTestData(s, data),
    [
      [schema, { line_name: " Return 1 ", start_psi: "20.5", observation: "" }],
      [schema, {}],
      [schema, { line_name: 12.5, start_psi: "abc", observation: 5, notes: " \n ", minutes: 0 }],
      [schema, { line_name: "　x ", start_psi: " 7 ", notes: "a\u0085", minutes: "0.1" }],
      [schema, { line_name: 1e21, start_psi: 1e-7, notes: 0.000001, minutes: 100 }],
    ],
  ),

  validateFinding: rule(
    (f: { title: string; severity_key: string }) => validateFinding(f),
    [
      [{ title: " ", severity_key: "" }],
      [{ title: "Return 3 line break", severity_key: "major" }],
      [{ title: "", severity_key: "minor" }],
      [{ title: "x", severity_key: "" }],
      [{ title: "﻿ ", severity_key: " " }],
    ],
  ),

  // The steps turn a quarter on each tap; the others mirror (owner, 2026-10-21).
  tapLandmark: rule(
    (l: Parameters<typeof tapLandmark>[0]) => tapLandmark(l),
    [
      [{ kind: "steps", x: 0.5, y: 0.5 }],
      [{ kind: "steps", x: 0.5, y: 0.5, turn: 1 }],
      [{ kind: "steps", x: 0.5, y: 0.5, turn: 3 }],
      [{ kind: "steps", x: 0.5, y: 0.5, flip: true }],
      [{ kind: "waterfall", x: 0.5, y: 0.2 }],
      [{ kind: "waterfall", x: 0.5, y: 0.2, flip: true, turn: 3 }],
      [{ kind: "tree", x: 0.2, y: 0.3 }],
      [{ kind: "tree", x: 0.2, y: 0.3, flip: true, s: 18 }],
      // The pool fittings (owner, 2026-10-26): the skimmer, return, and suction line turn.
      [{ kind: "skimmer", x: 0.5, y: 0.1 }],
      [{ kind: "skimmer", x: 0.5, y: 0.1, turn: 3 }],
      [{ kind: "poolReturn", x: 0.2, y: 0.5, s: 14 }],
      [{ kind: "suctionLine", x: 0.8, y: 0.5, turn: 1 }],
      [{ kind: "mainDrain", x: 0.5, y: 0.5 }],
      [{ kind: "mainDrain", x: 0.5, y: 0.5, flip: true }],
      [{ kind: "light", x: 0.3, y: 0.9 }],
    ],
  ),
  landmarkTurn: rule(
    (l: Parameters<typeof landmarkTurn>[0]) => landmarkTurn(l),
    [
      [{ kind: "steps" }],
      [{ kind: "steps", turn: 2 }],
      [{ kind: "steps", flip: true }],
      [{ kind: "rock", turn: 1 }],
      [{ kind: "waterfall", flip: true }],
      [{ kind: "waterfall", turn: 2 }],
      [{ kind: "skimmer", turn: 1 }],
      [{ kind: "suctionLine", flip: true }],
      [{ kind: "poolReturn", turn: 3 }],
      [{ kind: "light", turn: 2 }],
      [{ kind: "mainDrain", turn: 1 }],
    ],
  ),
  // An unknown shape (from an older or newer app) falls back to the rectangle.
  poolDiagram: rule(
    (shape: DiagramShape | null, hasSpa: boolean, layout?: DiagramLayout | null) =>
      poolDiagram(shape, hasSpa, layout),
    [
      ["rectangle", false],
      [
        "oval",
        false,
        {
          landmarks: [
            { kind: "steps", x: 0.5, y: 0.5, turn: 1 },
            { kind: "steps", x: 0.3, y: 0.5, flip: true },
            { kind: "tree", x: 0.7, y: 0.5, flip: true },
          ],
        },
      ],
      ["oval", true],
      ["kidney", true],
      ["l_shape", false],
      ["freeform", false],
      ["roman", true],
      ["grecian", true],
      ["figure_eight", true],
      [null, false],
      [null, true],
      ["triangle" as DiagramShape, true],
      // Layouts: empty, mirrored (spa moves to the left), placed, sizes, square.
      ["kidney", true, {}],
      ["kidney", true, null],
      ["kidney", true, { mirror: true }],
      ["l_shape", false, { mirror: true }],
      ["roman", true, { mirror: true }],
      ["grecian", true, { mirror: true }],
      ["figure_eight", true, { mirror: true }],
      ["freeform", true, { mirror: true, spa: { x: 0.2, y: 0.8 } }],
      ["rectangle", true, { spa: { x: 0.85, y: 0.2, size: "large", shape: "square" } }],
      ["rectangle", true, { spa: { x: 0.5, y: 0.5, size: "small" } }],
      ["oval", true, { spa: { x: 0, y: 1, size: "medium", shape: "round" } }],
      ["oval", true, { spa: { x: 0.333, y: 0.1, shape: "square" } }],
      // A placed spa without a spa on the property draws nothing.
      ["oval", false, { mirror: true, spa: { x: 0.5, y: 0.5, size: "large" } }],
      // A pinched spa, a drawn pool, drawing and landmarks (owner, 2026-10-19).
      ["oval", true, { spa: { x: 0.5, y: 0.5, size: "large", r: 21.5 } }],
      // Centered (owner, 2026-10-20): the pool moves right 10; the spa stays where placed.
      ["rectangle", false, { centered: true }],
      ["kidney", true, { centered: true }],
      ["kidney", true, { centered: true, mirror: true }],
      ["figure_eight", true, { centered: true, spa: { x: 0.85, y: 0.2 } }],
      ["custom", false, { centered: true }],
      ["custom", false],
      ["custom", true, { mirror: true }],
      [
        "custom",
        false,
        {
          drawing: [
            { type: "line", x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.8 },
            { type: "circle", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.3 },
            {
              type: "pen",
              points: [
                [0.1, 0.1],
                [0.2, 0.3],
              ],
            },
          ],
          landmarks: [
            { kind: "tree", x: 0, y: 0 },
            { kind: "house", x: 1, y: 1 },
            { kind: "rock", x: 0.5, y: 0.5 },
            { kind: "waterfall", x: 0, y: 1, s: 40, flip: true },
            { kind: "steps", x: 0.9, y: 0.1, s: 12 },
            { kind: "skimmer", x: 0.5, y: 0, turn: 2 },
            { kind: "mainDrain", x: 0.5, y: 0.5, flip: true },
            { kind: "light", x: 0.2, y: 0.8 },
            { kind: "poolReturn", x: 0.1, y: 0.5, turn: 1, s: 14 },
            { kind: "suctionLine", x: 0.9, y: 0.5 },
          ],
        },
      ],
    ],
  ),

  // Centered pools (owner, 2026-10-20).
  POOL_CENTER_OFFSET: rule(() => POOL_CENTER_OFFSET, [[]]),
  offsetPath: rule(
    (path: string, dx: number) => offsetPath(path, dx),
    [
      ["M16 18 H124 Q130 18 130 24 V76 Q130 82 124 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z", 10],
      ["M26 18 H114 L130 34 V66 L114 82 H26 L10 66 V34 Z", 10],
      ["M1.5 2 L-3 .5 C1,2 3,4 5,6 V7 H8 Z", 10],
      ["M0.1 0 L0.2 0.3 Z", 0.2],
      ["M16 18 H124 Z", 0],
      ["M16 18 H124 Z", -10],
      ["12 13 M 1 2", 10],
      ["", 10],
      ["Z", 10],
    ],
  ),
  centerLayout: rule(
    (layout: DiagramLayout) => centerLayout(layout),
    [
      [{}],
      [{ mirror: true }],
      [{ centered: true, spa: { x: 0.5, y: 0.5 } }],
      [{ spa: { x: 0.85, y: 0.2, size: "large", shape: "square", r: 21.5 } }],
      [{ spa: { x: 0.95, y: 0.2 } }],
      [{ mirror: true, spa: { x: 0.1234, y: 0.8 } }],
      [
        {
          drawing: [
            { type: "line", x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.8 },
            { type: "circle", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.3 },
            {
              type: "pen",
              points: [
                [0.1, 0.1],
                [0.99, 0.3],
              ],
            },
          ],
          landmarks: [
            { kind: "tree", x: 0, y: 0 },
            { kind: "house", x: 1, y: 1 },
            { kind: "waterfall", x: 0.33333, y: 1, s: 40, flip: true },
          ],
        },
      ],
    ],
  ),

  mirrorPath: rule(
    (path: string) => mirrorPath(path),
    [
      ["M16 18 H124 Q130 18 130 24 V76 Q130 82 124 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z"],
      ["M26 18 H114 L130 34 V66 L114 82 H26 L10 66 V34 Z"],
      ["M1.5 2 L-3 .5 C1,2 3,4 5,6 V7 H8 Z"],
      ["M0 0 L140 0 L70.25 -0.75 Z"],
      ["12 13 M 1 2"],
      ["M1.2.3 4- 5 L--6 7. Z"],
      [""],
      ["Z"],
    ],
  ),

  // Anything unrecognized is dropped, never thrown.
  parseDiagramLayout: rule(
    (value: unknown) => parseDiagramLayout(value),
    [
      [null],
      [{}],
      ["mirror"],
      [3],
      [true],
      [[{ mirror: true }]],
      [{ mirror: true }],
      [{ mirror: "true" }],
      [{ mirror: false }],
      [{ mirror: 1 }],
      [{ centered: true }],
      [{ centered: "true" }],
      [{ centered: false, mirror: true }],
      [{ spa: { x: 0.85, y: 0.2, size: "large", shape: "square" } }],
      [{ mirror: true, spa: { x: 0, y: 1 } }],
      [{ spa: { x: 0.5, y: 0.5, size: "huge", shape: "triangle" } }],
      [{ spa: { x: 1.5, y: 0.5 } }],
      [{ spa: { x: -0.1, y: 0.5 } }],
      [{ spa: { x: "0.5", y: 0.5 } }],
      [{ spa: { x: 0.5 } }],
      [{ spa: null }],
      [{ spa: "corner" }],
      [{ spa: [0.5, 0.5] }],
      [{ spa: { x: 0.5, y: 0.5, size: 13, shape: null } }],
      [{ spa: { x: 0.5, y: 0.5, size: "Small" } }],
      [{ spa: { x: 0.5, y: 0.5, r: 20 } }],
      [{ spa: { x: 0.5, y: 0.5, r: 6.9 } }],
      [{ spa: { x: 0.5, y: 0.5, r: 28.1 } }],
      [{ spa: { x: 0.5, y: 0.5, r: "20" } }],
      [
        {
          drawing: [
            { type: "line", x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.8 },
            { type: "line", x1: 0.1, y1: 0.2, x2: 1.9, y2: 0.8 },
            { type: "circle", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.3, extra: 1 },
            { type: "circle", cx: 0.5, cy: 0.5, rx: 0.25 },
            {
              type: "pen",
              points: [
                [0.1, 0.1],
                [2, 0.1],
                [0.3, 0.4],
              ],
            },
            {
              type: "pen",
              points: [
                [0.1, 0.1],
                [2, 0.1],
              ],
            },
            { type: "square" },
            null,
            "line",
            [0.1, 0.2],
          ],
        },
      ],
      [{ drawing: [] }],
      [{ drawing: "line" }],
      [
        {
          drawing: Array.from({ length: 45 }, (_, i) => ({
            type: "line",
            x1: i / 100,
            y1: 0,
            x2: 1,
            y2: 1,
          })),
        },
      ],
      [
        {
          landmarks: [
            { kind: "tree", x: 0.1, y: 0.2, extra: true },
            { kind: "statue", x: 0.1, y: 0.2 },
            { kind: "rock", x: 1.1, y: 0.2 },
            { kind: "house", x: 0, y: 1 },
            null,
            "tree",
          ],
        },
      ],
      [
        {
          landmarks: Array.from({ length: 35 }, (_, i) => ({
            kind: "steps",
            x: i / 100,
            y: 0.5,
          })),
        },
      ],
      [{ landmarks: [{ kind: "rock", x: "0.1", y: 0.2 }] }],
      [
        {
          landmarks: [
            { kind: "tree", x: 0.5, y: 0.5, s: 30, flip: true },
            { kind: "rock", x: 0.5, y: 0.5, s: 99, flip: "yes" },
            { kind: "house", x: 0.5, y: 0.5, s: 9.9, flip: false },
            { kind: "steps", x: 0.5, y: 0.5, s: 10, flip: 1 },
            { kind: "equipment", x: 0.5, y: 0.5, s: "20" },
          ],
        },
      ],
      [
        {
          drawing: [
            {
              type: "pen",
              points: Array.from({ length: 450 }, (_, i) => [i / 450, 0.5]),
            },
          ],
        },
      ],
    ],
  ),

  validateNewJob: rule(
    (input: NewJobInput) => validateNewJob(input),
    [
      [blank],
      [{ ...blank, customerId: "c", propertyId: "p" }],
      [{ ...blank, customerId: "", propertyId: "" }],
      [
        {
          ...filled,
          customerEmail: "nope",
          scheduleDate: "10/12/2026",
          scheduleTime: "9am",
        },
      ],
      [{ ...filled, customerEmail: " a@b.co " }],
      [{ ...filled, customerEmail: "a@b" }],
      [{ ...filled, customerEmail: "a@.b" }],
      [{ ...filled, customerEmail: "a@b." }],
      [{ ...filled, customerEmail: "a@b.c.d" }],
      [{ ...filled, customerEmail: "a b@c.d" }],
      [{ ...filled, customerEmail: "a@@c.d" }],
      [{ ...filled, customerEmail: "nope", customerId: "c" }],
      [{ ...filled, customerName: "  " }],
      [{ ...filled, addressLine1: "\t" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "09:30" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "9:30" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "23:59" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "24:00" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "19:60" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "123:00" }],
      [{ ...filled, scheduleDate: "2026-10-14", scheduleTime: "09:30\n" }],
      [{ ...filled, scheduleDate: "2026-10-14\n" }],
      [{ ...filled, scheduleDate: "2026-1-14" }],
      [{ ...filled, scheduleDate: "２０２６-10-14" }],
      [{ ...filled, scheduleTime: "09:30" }],
      [{ ...filled, scheduleTime: "9am" }],
    ],
  ),

  formatAddress: rule(
    (p: Place) => formatAddress(p),
    [
      [prop({ address_line1: "1423 Palm Ct", city: "Phoenix", state: "AZ", postal_code: "85016" })],
      [prop({ address_line1: "1 Main", city: null, state: null, postal_code: null })],
      [prop({ address_line1: "1 Main", city: "Mesa" })],
      [prop({ address_line1: "1 Main", state: "AZ" })],
      [prop({ address_line1: "1 Main", postal_code: "85016" })],
      [prop({ address_line1: "", city: "Mesa", state: "AZ" })],
      [prop({ address_line1: "", city: "", state: "", postal_code: "" })],
    ],
  ),

  // newJobRecords makes no ids or clock reads: "now" timing carries its instant, so every
  // field is compared.
  newJobRecords: rule(
    (input: NewJobInput, d: Details) =>
      newJobRecords(input, {
        ...d,
        timing: d.timing.kind === "now" ? { kind: "now", at: new Date(d.timing.at) } : d.timing,
      }),
    [
      [{ ...blank, customerName: " Maria ", addressLine1: "1423 Palm Ct", state: "az" }, details()],
      [
        { ...blank, customerName: "M", addressLine1: "1 St", customerId: "c", propertyId: "p" },
        details({
          poolType: null,
          hasSpa: false,
          accessNotes: "",
          timing: { kind: "scheduled", date: "2026-10-14", time: "09:00", timeZone: TZ },
          assignedUserId: null,
        }),
      ],
      [
        {
          ...blank,
          customerName: "M",
          customerPhone: " 602 ",
          customerEmail: " a@b.co ",
          addressLine1: " 1 St ",
          city: " Mesa ",
          state: " straße ",
          postalCode: "  ",
          customerId: "",
        },
        details({ timing: { kind: "later" }, jobType: "maintenance" }),
      ],
      [filled, details({ timing: { kind: "later" }, jobType: "inspection" })],
      [filled, details({ timing: { kind: "later" }, jobType: "maintenance" })],
      [
        filled,
        details({
          timing: { kind: "scheduled", date: "2026-07-01", time: "", timeZone: "America/New_York" },
          jobType: "repair",
        }),
      ],
      [
        filled,
        details({
          timing: {
            kind: "scheduled",
            date: "2026-03-08",
            time: "02:30",
            timeZone: "America/New_York",
          },
        }),
      ],
      [
        filled,
        details({
          timing: {
            kind: "scheduled",
            date: "2026-11-01",
            time: "01:30",
            timeZone: "America/New_York",
          },
        }),
      ],
      [
        filled,
        details({
          timing: {
            kind: "scheduled",
            date: "2026-03-08",
            time: "12:00",
            timeZone: "America/New_York",
          },
        }),
      ],
      [
        filled,
        details({
          timing: {
            kind: "scheduled",
            date: "2026-12-31",
            time: "23:30",
            timeZone: "Asia/Kolkata",
          },
        }),
      ],
      [
        filled,
        details({
          timing: { kind: "scheduled", date: "2026-13-40", time: "25:70", timeZone: "UTC" },
        }),
      ],
      [
        filled,
        details({
          timing: { kind: "scheduled", date: "0026-01-01", time: "09:00", timeZone: "UTC" },
        }),
      ],
      [
        filled,
        details({
          timing: { kind: "scheduled", date: "2026-10", time: "09:00", timeZone: "UTC" },
        }),
      ],
      [
        filled,
        details({
          timing: { kind: "scheduled", date: "2026-10-14", time: "09:00", timeZone: "Mars/Base" },
        }),
      ],
      [filled, details({ timing: { kind: "now", at: "2026-10-12T17:00:00.123+02:00" } })],
    ],
  ),

  localDate: rule(
    (instant: string, tz: string) => localDate(new Date(instant), tz),
    [
      ["2026-10-13T05:30:00Z", TZ],
      ["2026-10-13T07:00:00Z", TZ],
      ["2026-10-13T06:59:59.999Z", TZ],
      ["2026-03-08T04:59:00Z", "America/New_York"],
      ["2026-12-31T18:30:00Z", "Asia/Kolkata"],
      ["2026-12-31T18:29:00Z", "Asia/Kolkata"],
      ["2026-01-01T00:00:00Z", "Pacific/Kiritimati"],
      ["1969-12-31T23:59:59Z", "UTC"],
      ["2026-10-13T05:30:00Z", "Not/AZone"],
      ["not a date", TZ],
    ],
  ),

  groupJobs: rule(
    (js: Job[], now: string, tz: string) => {
      const g = groupJobs(js, new Date(now), tz);
      const ids = (l: Job[]) => l.map((j) => j.id);
      return {
        today: ids(g.today),
        upcoming: ids(g.upcoming),
        unscheduled: ids(g.unscheduled),
        recent: ids(g.recent),
      };
    },
    [
      [jobs, NOW, TZ],
      [jobs, "2026-10-13T06:59:00Z", TZ],
      [jobs, NOW, "America/New_York"],
      [jobs, NOW, "Asia/Tokyo"],
      [[], NOW, TZ],
      // Unscheduled jobs sort by created_at with localeCompare, whatever its format.
      [
        [
          "2026-10-10T00:00:00Z",
          "2026-10-10T00:00:00.000Z",
          "2026-10-10 00:00:00+00",
          "2026-10-10T00:00:00+00:00",
          "2026-10-09T23:59:59Z",
          "",
          "a",
          "B",
        ].map((created_at, i) => job(`u${i}`, { status: "unscheduled", created_at })),
        NOW,
        TZ,
      ],
      [[job("bad", { scheduled_start: "not a date" })], NOW, TZ],
      [[job("bad-paid", { status: "paid", scheduled_start: "not a date" })], NOW, TZ],
      [jobs, NOW, "Nowhere/Zone"],
    ],
  ),

  // Filtering the Jobs list and Activity by job type (owner, 2026-10-22).
  JOB_TYPE_FILTER_WORDS: rule(() => ({ JOB_TYPE_FILTER_TITLE, ALL_JOB_TYPES }), [[]]),
  jobTypeFilters: rule((s: Services) => jobTypeFilters(s), [["pool"], ["leak"], ["both"]]),
  jobTypeFilter: rule(
    (key: string | null, s: Services) => jobTypeFilter(key, s),
    [
      ["repair", "both"],
      ["detection", "pool"],
      ["maintenance", "leak"],
      ["inspection", "both"],
      ["all", "both"],
      ["bad", "both"],
      [null, "pool"],
    ],
  ),
  jobTypeFilterLabel: rule(
    (f: JobTypeFilter) => jobTypeFilterLabel(f),
    [["all"], ["detection"], ["repair"], ["maintenance"], ["inspection"]],
  ),
  jobsEmpty: rule((f: JobTypeFilter) => jobsEmpty(f), [["all"], ["detection"], ["inspection"]]),
  matchesJobType: rule(
    (t: string | null, f: JobTypeFilter) => matchesJobType(t, f),
    [
      ["repair", "all"],
      [null, "all"],
      ["repair", "repair"],
      ["detection", "repair"],
      [null, "maintenance"],
    ],
  ),
  // Sorting the Jobs list (owner, 2026-10-20).
  JOB_SORTS: rule(() => JOB_SORTS, [[]]),
  jobSort: rule((key: unknown) => jobSort(key), [["customer"], ["newest"], ["bad"], [null]]),
  sortJobs: rule(
    (jobs: Parameters<typeof sortJobs>[0], sort: string) => sortJobs(jobs, sort),
    ["scheduled", "newest", "oldest", "customer", "number", "bad"].map(
      (sort): [JobSortItem[], string] => [
        [
          {
            number: 3,
            scheduled_start: "2026-10-22T16:00:00Z",
            created_at: "2026-10-01T00:00:00Z",
            customer: "lee",
          },
          {
            number: 7,
            scheduled_start: null,
            created_at: "2026-10-05T00:00:00Z",
            customer: "Adams",
          },
          {
            number: 5,
            scheduled_start: "2026-10-21T16:00:00Z",
            created_at: "2026-10-03T00:00:00Z",
            customer: null,
          },
          {
            number: null,
            scheduled_start: "2026-10-21T16:00:00Z",
            created_at: null,
            customer: "  ",
          },
          {
            number: 9,
            scheduled_start: "2026-10-21T16:00:00Z",
            created_at: "2026-10-03T00:00:00Z",
            customer: "Émile",
          },
        ],
        sort,
      ],
    ),
  ),
  formatSchedule: rule(
    (start: string | null, now: string, tz: string) => formatSchedule(start, new Date(now), tz),
    [
      ["2026-10-12T16:00:00Z", NOW, TZ],
      ["2026-10-14T16:00:00Z", NOW, TZ],
      [null, NOW, TZ],
      ["", NOW, TZ],
      ["2026-10-12T07:00:00Z", NOW, TZ],
      ["2026-10-12T19:05:00Z", NOW, TZ],
      ["2026-10-13T06:59:00Z", NOW, TZ],
      ["2026-10-13T07:00:00Z", NOW, TZ],
      ["2027-01-01T05:00:00Z", NOW, "America/New_York"],
      ["2026-02-28T23:45:30.500Z", NOW, "Asia/Kolkata"],
      ["2026-05-03T12:00:00+05:30", NOW, "UTC"],
      ["2026-06-07T00:00:00Z", NOW, "Europe/London"],
      ["2026-08-20T21:30:00Z", NOW, "Australia/Sydney"],
      ["2026-09-09T09:09:00Z", NOW, "Pacific/Honolulu"],
      ["2026-04-15", NOW, "UTC"],
      ["2026-10-14T16:00:00Z", NOW, "Bad/Zone"],
      ["garbage", NOW, TZ],
    ],
  ),

  propertyLocation: rule(
    (p: Place | null) => propertyLocation(p),
    [
      [prop({ latitude: 33.44962, longitude: -111.94637 })],
      [prop({ latitude: 0, longitude: 0 })],
      [prop({ latitude: 33.4, longitude: null })],
      [prop({ latitude: null, longitude: -111.9 })],
      [prop()],
      [null],
    ],
  ),

  nativeMapsUrl: rule(
    (p: MapPlace, os: string) => nativeMapsUrl(p, os),
    [
      [{ address: "455 N Galvin Pkwy, Phoenix, AZ 85008", location: POOL }, "ios"],
      [{ address: "455 N Galvin Pkwy, Phoenix, AZ 85008", location: POOL }, "android"],
      [{ address: "455 N Galvin Pkwy, Phoenix, AZ 85008", location: POOL }, "web"],
      [{ address: "1 E Main St, Mesa" }, "ios"],
      [{ address: "1 E Main St, Mesa" }, "android"],
      [{ address: "1 E Main St, Mesa", location: null }, "web"],
      [{ address: "Café #5 & Co. (rear) ~'!*", location: { lat: 1e-7, lng: 100 } }, "ios"],
      [{ address: "Café #5 & Co. (rear) ~'!*", location: { lat: 1e-7, lng: 100 } }, "android"],
      [{ address: "Ünïcode 😀 / ? = +", location: { lat: -0.5, lng: 1e21 } }, "web"],
      [{ address: "", location: { lat: 0, lng: -0 } }, "macos"],
    ],
  ),

  // checklist-summary.ts
  checklistSectionSummary: rule(
    (results: ({ status: string; outcome: string | null } | null)[], service?: boolean) =>
      checklistSectionSummary(
        results.map((r) => ({ result: r as never })),
        service,
      ),
    [
      [[]],
      [[], true],
      [[null, { status: "pending", outcome: null }, { status: "inspected", outcome: "ok" }]],
      [
        [
          { status: "inspected", outcome: "ok" },
          { status: "excluded", outcome: null },
        ],
      ],
      [
        [
          { status: "inspected", outcome: "attention" },
          { status: "inspected", outcome: null },
        ],
      ],
      [
        [
          { status: "inspected", outcome: "leaking" },
          { status: "inspected", outcome: "attention" },
          { status: "inspected", outcome: "leaking" },
        ],
      ],
      [[{ status: "inspected", outcome: "leaking" }]],
      // An excluded item that still carries an outcome counts by its outcome.
      [
        [
          { status: "excluded", outcome: "leaking" },
          { status: "inspected", outcome: "ok" },
        ],
      ],
      [[{ status: "inspected", outcome: "ok" }], true],
      [[{ status: "inspected", outcome: "attention" }], true],
      [
        [
          { status: "inspected", outcome: "attention" },
          { status: "inspected", outcome: "attention" },
          { status: "inspected", outcome: "leaking" },
        ],
        true,
      ],
      [[null, { status: "inspected", outcome: "attention" }], true],
    ],
  ),
  markRemainingLabel: rule(
    (answers: (string | null)[]) =>
      markRemainingLabel(answers.map((a) => a ?? undefined) as ComponentType["answer"][]),
    [
      [[]],
      [["yes_no", "yes_no"]],
      [["done"]],
      [["leak", "leak", "leak"]],
      [["yes_no", "leak"]],
      [["done", "yes_no"]],
      [[null]],
    ],
  ),

  // Pool inspection (pool-inspection.ts).
  INSPECTION_SECTIONS: rule(() => INSPECTION_SECTIONS, [[]]),
  NOT_PRESENT_LABEL: rule(() => NOT_PRESENT_LABEL, [[]]),
  isInspectionAnswer: rule(
    (a: string | null) => isInspectionAnswer(a),
    [["choice"], ["multi"], ["text"], ["leak"], ["yes_no"], ["done"], [null], ["Choice"]],
  ),
  choiceOptions: rule(
    (raw: unknown) => choiceOptions(raw),
    [
      [null],
      ["Yes"],
      [{ label: "Yes" }],
      [[]],
      [yesNo],
      [gate],
      [
        [
          { label: "Yes", flag: "ok" },
          { label: " " },
          { label: 3 },
          null,
          "No",
          { label: "No", flag: "bad", fold: "yes" },
          { label: " Gate ", fold: true, flag: "na" },
          { label: "Off", fold: false, extra: 1 },
        ],
      ],
    ],
  ),
  inspectionValue: rule(
    (answer: string | null, raw: unknown) => inspectionValue(answer, raw),
    ["choice", "multi", "text", "leak", null].flatMap((a) =>
      [null, "Yes", "  ", "", ["a", 2, "b"], [], 5].map(
        (raw) => [a, raw] as [string | null, unknown],
      ),
    ),
  ),
  inspectionAnswerText: rule(
    (answer: string | null, raw: unknown) => inspectionAnswerText(answer, raw),
    ["choice", "multi", "text", null].flatMap((a) =>
      [null, "Yes", "  ", ["Pool main drain", "Pool skimmer"], ["x", 1], []].map(
        (raw) => [a, raw] as [string | null, unknown],
      ),
    ),
  ),
  inspectionAnswerValues: rule(
    (
      type: { answer: string | null; options: unknown },
      value: InspectionValue,
      userId: string | null,
      now: string,
    ) => inspectionAnswerValues(type, value, userId, new Date(now)),
    [
      ...[
        { answer: "choice", options: yesNo },
        { answer: "choice", options: leakChoice },
        { answer: "choice", options: gate },
        { answer: "multi", options: parts },
        { answer: "text", options: null },
        { answer: "leak", options: null },
      ].flatMap((type) =>
        (
          [
            null,
            "",
            "  ",
            "Yes",
            "No",
            "N/A",
            "Leaking",
            "Not Leaking",
            "Unknown",
            " padded ",
            ["No", "Yes"],
            [],
            ["Pool skimmer", "Pool main drain"],
          ] as InspectionValue[]
        ).map(
          (v) =>
            [type, v, "u1", "2026-10-20T15:04:05.123Z"] as [
              { answer: string | null; options: unknown },
              InspectionValue,
              string | null,
              string,
            ],
        ),
      ),
      [{ answer: "choice", options: yesNo }, "No", null, "2026-01-01T00:00:00.000Z"],
      [{ answer: "choice", options: "bad" }, "Yes", "u1", "2026-01-01T00:00:00.000Z"],
    ],
  ),
  toggleChoice: rule(
    (options: ChoiceOption[], picked: string[], label: string) =>
      toggleChoice(options, picked, label),
    [
      [parts, [], "Pool skimmer"],
      [parts, ["Spa drain"], "Pool main drain"],
      [parts, ["Spa drain", "Pool main drain"], "Pool skimmer"],
      [parts, ["Pool main drain", "Pool skimmer"], "Pool main drain"],
      [parts, ["Pool skimmer"], "Pool skimmer"],
      [parts, ["Spa drain", "Gone"], "Pool main drain"],
      [parts, ["Spa drain"], "Unknown"],
      [[], ["b"], "a"],
    ],
  ),
  inspectionTone: rule(
    (r: { status: string; outcome: string | null } | null) =>
      inspectionTone((r ?? undefined) as never),
    [
      null,
      ...["pending", "inspected", "excluded"].flatMap((status) =>
        [null, "ok", "leaking", "attention"].map((outcome) => ({ status, outcome })),
      ),
    ].map((r) => [r] as [never]),
  ),
  foldedItems: rule(
    (rows: FoldRow[]) => [...foldedItems(rows)].sort(),
    [
      [foldRows],
      [[]],
      [foldRows.slice(3, 5)],
      [[frow("a", null, "G", gate, "No"), frow("b", null, "G", yesNo, null)]],
      [[frow("a", "x", "G", gate, ["No"]), frow("b", "x", "G", yesNo, null)]],
      [[frow("a", "x", "G", gate, ""), frow("b", "x", "G", yesNo, null)]],
      // The gate is the group's first row, even when the rows aren't next to each other.
      [
        [
          frow("a", "x", "G", yesNo, "No"),
          frow("b", "x", "G", gate, "No"),
          frow("c", "x", "H", gate, "No"),
          frow("d", "x", "H", yesNo, null),
          frow("e", "x", "G", yesNo, null),
        ],
      ],
    ],
  ),
  isGate: rule(
    (row: { options?: unknown }) => isGate(row),
    [[{ options: gate }], [{ options: yesNo }], [{}], [{ options: null }], [{ options: "x" }]],
  ),
  inspectionProgress: rule(
    (rows: Parameters<typeof inspectionProgress>[0], folded?: string[]) =>
      inspectionProgress(rows, folded ? new Set(folded) : undefined),
    [
      [foldRows as never],
      [[]],
      [foldRows as never, []],
      [foldRows as never, ["g1", "h2", "missing"]],
      [foldRows.slice(3, 5) as never],
    ],
  ),
  inspectionProgressText: rule(
    (p: { answered: number; total: number; attention: number; leaking: number }) =>
      inspectionProgressText(p),
    [
      [{ answered: 12, total: 49, attention: 1, leaking: 0 }],
      [{ answered: 0, total: 0, attention: 0, leaking: 0 }],
      [{ answered: 5, total: 5, attention: 0, leaking: 0 }],
      [{ answered: 5, total: 5, attention: 1, leaking: 0 }],
      [{ answered: 5, total: 5, attention: 2, leaking: 0 }],
      [{ answered: 5, total: 5, attention: 0, leaking: 3 }],
      [{ answered: 5, total: 5, attention: 2, leaking: 1 }],
      [{ answered: 6, total: 5, attention: 0, leaking: 0 }],
    ],
  ),
  needAttentionText: rule((n: number) => needAttentionText(n), [[0], [1], [2], [12]]),
  inspectionTallyText: rule(
    (p: { answered: number; total: number; attention: number; leaking: number }) =>
      inspectionTallyText(p),
    [
      [{ answered: 1, total: 133, attention: 0, leaking: 0 }],
      [{ answered: 0, total: 0, attention: 0, leaking: 0 }],
      [{ answered: 12, total: 49, attention: 1, leaking: 0 }],
      [{ answered: 5, total: 5, attention: 2, leaking: 0 }],
      [{ answered: 5, total: 5, attention: 0, leaking: 3 }],
      [{ answered: 5, total: 5, attention: 2, leaking: 1 }],
    ],
  ),
  checklistTallyText: rule(
    (
      t: {
        pass: number;
        attention: number;
        leaking: number;
        notApplicable: number;
        pending: number;
      },
      maintenance: boolean,
      pending?: boolean,
    ) => checklistTallyText(t, maintenance, pending),
    [
      [{ pass: 3, attention: 0, leaking: 0, notApplicable: 0, pending: 5 }, true],
      [{ pass: 3, attention: 0, leaking: 0, notApplicable: 0, pending: 5 }, true, false],
      [{ pass: 3, attention: 2, leaking: 0, notApplicable: 1, pending: 5 }, true],
      [{ pass: 1, attention: 1, leaking: 0, notApplicable: 0, pending: 0 }, true],
      [{ pass: 3, attention: 0, leaking: 1, notApplicable: 0, pending: 5 }, false],
      [{ pass: 3, attention: 2, leaking: 1, notApplicable: 2, pending: 5 }, false],
      [{ pass: 3, attention: 2, leaking: 1, notApplicable: 2, pending: 5 }, false, false],
      [{ pass: 0, attention: 0, leaking: 0, notApplicable: 0, pending: 0 }, false],
    ],
  ),
  intakeQuestionsFor: rule(
    (questions: Parameters<typeof intakeQuestionsFor>[0], type: JobType) =>
      intakeQuestionsFor(questions, type),
    (["detection", "inspection", "repair", "maintenance"] as JobType[]).map(
      (t) =>
        [
          [
            { key: "a", label: "Leak where?", type: "text" },
            {
              key: "b",
              label: "Features",
              type: "multi",
              options: ["Spa"],
              job_types: ["inspection"],
            },
            {
              key: "c",
              label: "Both",
              type: "single",
              options: ["x"],
              job_types: ["detection", "inspection"],
            },
            { key: "d", label: "Empty list", type: "text", job_types: [] },
            { key: "e", label: "Repairs", type: "text", job_types: ["repair"] },
          ],
          t,
        ] as [Parameters<typeof intakeQuestionsFor>[0], JobType],
    ),
  ),
  optionsToText: rule(
    (raw: unknown) => optionsToText(raw),
    [
      [null],
      [[]],
      [yesNo],
      [leakChoice],
      [gate],
      [
        [
          { label: "Yes", flag: "ok" },
          { label: "No", flag: "attention", fold: true },
          { label: "Leaking", flag: "leaking" },
          { label: "Not applicable", flag: "na" },
          { label: " " },
        ],
      ],
    ],
  ),
  optionsFromText: rule(
    (text: string) => optionsFromText(text),
    [
      ["Yes\n\nNo (Needs attention, folds the group)\nYes\nSand / media\nN/A (not applicable)"],
      [""],
      ["  Leaking (leaking)  \r\nOK (ok)\nGate (folds the group, LEAKING)"],
      ["A (b) (not applicable)\nB (x(y))\nC ()\n(leaking)\nD(needs attention)"],
      ["Paren ) (leaking)\nTrail (leaking) x\n" + "x".repeat(121) + "\n" + "y".repeat(120)],
      ["Multi word, comma (needs attention , folds the group , extra)"],
    ],
  ),
};
