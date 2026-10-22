import {
  JOB_TYPE_LABELS,
  reportShareText,
  reportTitle,
  SAVED_REPORT_SECTIONS,
  applySavedReport,
  replaceSavedReportQuestion,
  savedReportFrom,
  savedReportSections,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  POOL_TYPE_LABELS,
  canMakeJobs,
  companyServices,
  formatCents,
  formatPhone,
  formatPhoneTyping,
  phoneCaret,
  todayUndo,
  jobReschedulable,
  isHexColor,
  isManagerRole,
  jobActionLabel,
  jobFeeLabel,
  jobOnPhones,
  newJobTypes,
  offersPool,
  parseGallons,
  parseReminderDays,
  requiresFinishPhoto,
  requiresFinishedChecklist,
  FINISH_CHECKLIST_MESSAGE,
  completeJobBlocker,
  jobHasWrapUp,
  markCompleteValues,
  stopDone,
  REPAIR_ITEM_KEY,
  REPAIR_ITEM_LABEL,
  FINISH_PHOTO_MESSAGE,
  parseDollars,
  roleLabel,
  seesAllJobs,
  splitEmails,
  toE164,
  userTransitions,
  uuidv7,
  type JobStatus,
  type Services,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const settings = [
  null,
  {},
  { services: "pool" },
  { services: "leak" },
  { services: "both" },
  { services: "boats" },
  { techs_see_all_jobs: false, techs_make_jobs: false },
  { techs_see_all_jobs: true, techs_make_jobs: true },
];
const roles = ["owner", "admin", "tech", null, "stranger"];

// money, uuid, job-status, texting (phone numbers) and models.
export const basics: ModuleCases = {
  formatCents: rule(
    (c: number) => formatCents(c),
    [[0], [1], [99], [100], [123456], [-500], [-1], [100000000], [1.5]],
  ),
  parseDollars: rule(
    (s: string) => parseDollars(s),
    [
      ["1,234.56"],
      ["$12"],
      ["0.1"],
      ["19.99"],
      ["-5"],
      ["12.345"],
      ["abc"],
      [""],
      [" $ 7 "],
      ["-0.5"],
      ["1,5"],
      ["1,50"],
      ["12,34,567"],
      ["1,234,567.89"],
      ["9999999.99"],
      ["10000000"],
      ["999999999999999999"],
      ["1."],
      [".5"],
      ["007"],
    ],
  ),
  // The time part of a UUIDv7 (the rest is random).
  uuidv7TimePrefix: rule(
    (ms: number) => uuidv7(ms).slice(0, 13),
    [[0], [1], [1760000000000], [281474976710655]],
  ),
  userTransitions: rule(
    (from: JobStatus, type?: string) => userTransitions(from, type),
    JOB_STATUSES.flatMap((s) => [[s] as [JobStatus], [s, "maintenance"] as [JobStatus, string]]),
  ),
  JOB_STATUS_LABELS: rule(() => JOB_STATUS_LABELS, [[]]),
  jobActionLabel: rule(
    (from: JobStatus, to: JobStatus) => jobActionLabel(from, to),
    JOB_STATUSES.flatMap((from) => JOB_STATUSES.map((to) => [from, to] as [JobStatus, JobStatus])),
  ),
  // A pool's gallons as typed (import.ts): New Job's Gallons and the job's Pool gallons.
  parseGallons: rule(
    (v: string) => parseGallons(v),
    [
      ["20,000"],
      ["20000"],
      ["20k"],
      ["20K"],
      ["18.5k"],
      ["18500 gallons"],
      ["1 gal"],
      [" 12 000 "],
      ["0"],
      ["-5"],
      ["abc"],
      [""],
      ["5000000"],
      ["4999999"],
      ["12.4"],
      ["12.5"],
      ["1,2,3"],
      ["20kk"],
      ["Gallons 300"],
    ],
  ),
  jobFeeLabel: rule(
    (t: string | null) => jobFeeLabel(t),
    [["detection"], ["repair"], ["maintenance"], ["inspection"], [null], [""], ["Detection"]],
  ),
  toE164: rule(
    (s: string | null) => toE164(s),
    [
      ["(602) 555-0142"],
      ["602.555.0142"],
      ["1-602-555-0142"],
      ["+1 602 555 0142"],
      ["+44 20 7946 0958"],
      ["+44 12"],
      ["555-0142"],
      ["(102) 555-0142"],
      ["(602) 155-0142"],
      [""],
      [null],
      ["  6025550142  "],
    ],
  ),
  formatPhone: rule(
    (s: string) => formatPhone(s),
    [["+16025550142"], ["+442079460958"], ["6025550142"]],
  ),
  // Phone numbers formatted as they're typed (owner, 2026-10-20).
  formatPhoneTyping: rule(
    (s: string) => formatPhoneTyping(s),
    [
      [""],
      ["   "],
      ["6"],
      ["60"],
      ["602"],
      ["6025"],
      ["602555"],
      ["6025550"],
      ["6025550142"],
      ["60255501423"],
      ["(602) 555-0142"],
      ["(602) 555-01422"],
      ["(602"],
      ["(602)"],
      ["(602) 5"],
      ["602.555.0142"],
      ["602-555-0142 "],
      ["1"],
      ["16"],
      ["1602"],
      ["16025550142"],
      ["+1"],
      ["+1 (602) 555-0142"],
      ["+16025550142"],
      ["+1 (602) 555-01423"],
      ["+44 20 7946 0958"],
      ["+"],
      ["-"],
      ["602 555 0142 ext 3"],
      ["555-HELP"],
      ["(602) 555-0142 x"],
      ["١٢٣"],
      ["6😀02"],
    ],
  ),
  phoneCaret: rule(
    (s: string, n: number) => phoneCaret(s, n),
    [
      ["(602) 555-0142", 0],
      ["(602) 555-0142", 1],
      ["(602) 555-0142", 3],
      ["(602) 555-0142", 4],
      ["(602) 555-0142", 6],
      ["(602) 555-0142", 7],
      ["(602) 555-0142", 10],
      ["(602) 555-0142", 11],
      ["+1 (602) 555-0142", 0],
      ["+1 (602) 555-0142", 1],
      ["+1 (602) 555-0142", 2],
      ["+1", 0],
      ["+", 0],
      ["", 0],
      ["", 3],
      ["(6", -1],
      ["6😀02", 2],
    ],
  ),
  companyServices: rule(
    (s: unknown) => companyServices(s),
    settings.map((s) => [s]),
  ),
  // Only a real true turns it on (owner, 2026-10-19; default off).
  requiresFinishPhoto: rule(
    (s: unknown) => requiresFinishPhoto(s),
    [
      [null],
      [{}],
      ["require_finish_photo"],
      [[true]],
      [{ require_finish_photo: true }],
      [{ require_finish_photo: false }],
      [{ require_finish_photo: "true" }],
      [{ require_finish_photo: 1 }],
      [{ require_finish_photo: null, services: "pool" }],
      [{ services: "both", require_finish_photo: true }],
    ],
  ),
  FINISH_PHOTO_MESSAGE: rule(() => FINISH_PHOTO_MESSAGE, [[]]),
  // Complete Job (owner, 2026-10-19): only a real true turns the checklist rule on.
  requiresFinishedChecklist: rule(
    (s: unknown) => requiresFinishedChecklist(s),
    [
      [null],
      [{}],
      ["require_checklist_to_finish"],
      [{ require_checklist_to_finish: true }],
      [{ require_checklist_to_finish: false }],
      [{ require_checklist_to_finish: "true" }],
      [{ require_checklist_to_finish: 1 }],
      [{ require_finish_photo: true }],
    ],
  ),
  FINISH_CHECKLIST_MESSAGE: rule(() => FINISH_CHECKLIST_MESSAGE, [[]]),
  completeJobBlocker: rule(
    (s: unknown, job: { checklistToDo: number; photos: number }) => completeJobBlocker(s, job),
    [
      null,
      {},
      { require_checklist_to_finish: true },
      { require_finish_photo: true },
      {
        require_checklist_to_finish: true,
        require_finish_photo: true,
      },
    ].flatMap((s) =>
      [
        { checklistToDo: 0, photos: 0 },
        { checklistToDo: 2, photos: 0 },
        { checklistToDo: 0, photos: 1 },
        { checklistToDo: 3, photos: 2 },
      ].map((job) => [s, job] as [unknown, { checklistToDo: number; photos: number }]),
    ),
  ),
  // Mark Complete on Today (owner, 2026-10-19).
  stopDone: rule(
    (job: { status: string; stop_done_on?: string | null }, day: string) => stopDone(job, day),
    [
      [{ status: "scheduled" }, "2026-10-19"],
      [{ status: "in_progress", stop_done_on: "2026-10-19" }, "2026-10-19"],
      [{ status: "scheduled", stop_done_on: "2026-10-18" }, "2026-10-19"],
      [{ status: "scheduled", stop_done_on: null }, "2026-10-19"],
      [{ status: "done" }, "2026-10-19"],
      [{ status: "report_sent" }, "2026-10-19"],
      [{ status: "unscheduled" }, "2026-10-19"],
      [{ status: "canceled", stop_done_on: "2026-10-19" }, "2026-10-19"],
    ],
  ),
  markCompleteValues: rule(
    (job: { type: string }, day: string) => markCompleteValues(job, day),
    [
      [{ type: "maintenance" }, "2026-10-19"],
      [{ type: "detection" }, "2026-10-19"],
      [{ type: "repair" }, "2026-10-20"],
    ],
  ),
  // Schedule Job / Change Schedule on the job page until its work is done (owner, 2026-10-20).
  jobReschedulable: rule(
    (job: { type: string; status: string }) => jobReschedulable(job),
    ["maintenance", "detection", "repair", "inspection"].flatMap((type) =>
      [...JOB_STATUSES, "bogus"].map(
        (status) => [{ type, status }] as [{ type: string; status: string }],
      ),
    ),
  ),
  // Reopen Visit or Mark Not Complete on a done Today stop (owner, 2026-10-20).
  todayUndo: rule(
    (job: { type: string; status: string; stop_done_on?: string | null }, day: string) =>
      todayUndo(job, day),
    ["maintenance", "detection", "repair", "inspection"].flatMap((type) =>
      [
        { status: "done" },
        { status: "done", stop_done_on: "2026-10-20" },
        { status: "scheduled" },
        { status: "scheduled", stop_done_on: "2026-10-20" },
        { status: "in_progress", stop_done_on: "2026-10-20" },
        { status: "in_progress", stop_done_on: "2026-10-19" },
        { status: "scheduled", stop_done_on: null },
        { status: "report_sent", stop_done_on: "2026-10-20" },
        { status: "canceled", stop_done_on: "2026-10-20" },
      ].map(
        (job) =>
          [{ type, ...job }, "2026-10-20"] as [
            { type: string; status: string; stop_done_on?: string | null },
            string,
          ],
      ),
    ),
  ),
  jobHasWrapUp: rule(
    (t: string | null) => jobHasWrapUp(t),
    [["maintenance"], ["detection"], ["repair"], [null], [""]],
  ),
  REPAIR_ITEM_KEY: rule(() => REPAIR_ITEM_KEY, [[]]),
  REPAIR_ITEM_LABEL: rule(() => REPAIR_ITEM_LABEL, [[]]),
  offersPool: rule(
    (s: unknown) => offersPool(s),
    settings.map((s) => [s]),
  ),
  newJobTypes: rule((s: Services) => newJobTypes(s), [["pool"], ["leak"], ["both"]]),
  seesAllJobs: rule(
    (r: string | null, s: unknown) => seesAllJobs(r, s),
    roles.flatMap((r) => settings.map((s) => [r, s] as [string | null, unknown])),
  ),
  canMakeJobs: rule(
    (r: string | null, s: unknown) => canMakeJobs(r, s),
    roles.flatMap((r) => settings.map((s) => [r, s] as [string | null, unknown])),
  ),
  roleLabel: rule(
    (r: string | null) => roleLabel(r),
    roles.map((r) => [r]),
  ),
  isManagerRole: rule(
    (r: string | null) => isManagerRole(r),
    roles.map((r) => [r]),
  ),
  splitEmails: rule(
    (s: string) => splitEmails(s),
    [["a@x.com b@y.com, c@z.com"], ["  "], ["no-at-sign, x@y"], ["a@b.co;b@c.org\nc@d.net"]],
  ),
  POOL_TYPE_LABELS: rule(() => POOL_TYPE_LABELS, [[]]),
  jobOnPhones: rule(
    (job: Parameters<typeof jobOnPhones>[0], now: string, extraDays?: number) =>
      jobOnPhones(job, new Date(now), extraDays),
    [
      ...[
        "unscheduled",
        "scheduled",
        "in_progress",
        "report_sent",
        "invoiced",
        "quote_accepted",
      ].map(
        (status) =>
          [
            {
              status,
              scheduled_start: "2020-01-01T00:00:00Z",
              completed_at: null,
              updated_at: null,
            },
            "2026-10-15T12:00:00Z",
          ] as [Parameters<typeof jobOnPhones>[0], string],
      ),
      ...["done", "paid", "canceled"].flatMap((status) =>
        [89, 90, 91, 96, 97, 98].flatMap((days) => {
          const at = new Date(Date.parse("2026-10-15T12:00:00Z") - days * 86_400_000).toISOString();
          return [
            [
              { status, scheduled_start: null, completed_at: at, updated_at: null },
              "2026-10-15T12:00:00Z",
            ],
            [
              { status, scheduled_start: at, completed_at: null, updated_at: null },
              "2026-10-15T12:00:00Z",
              7,
            ],
          ] as [Parameters<typeof jobOnPhones>[0], string, number?][];
        }),
      ),
      [
        {
          status: "done",
          scheduled_start: "2026-01-01T09:00:00-07:00",
          completed_at: null,
          updated_at: "2026-10-01T10:00:00.123Z",
        },
        "2026-10-15T12:00:00Z",
      ],
      [
        { status: "done", scheduled_start: null, completed_at: null, updated_at: null },
        "2026-10-15T12:00:00Z",
      ],
      [
        {
          status: "paid",
          scheduled_start: "not a date",
          completed_at: "2026-10-14T00:00:00Z",
          updated_at: null,
        },
        "2026-10-15T12:00:00Z",
      ],
    ],
  ),
  // Settings › Company and Branding on the phone (owner, 2026-10-20).
  isHexColor: rule(
    (v: unknown) => isHexColor(v),
    [["#12263A"], ["#ee6a1f"], ["12263A"], ["#12263"], ["#12263AA"], ["#GGGGGG"], [null], [42]],
  ),
  parseReminderDays: rule(
    (s: string) => parseReminderDays(s),
    [
      [""],
      ["3, 7"],
      ["7 3 3"],
      ["14,30,7"],
      ["0"],
      ["366"],
      ["365"],
      ["1, x"],
      ["1000"],
      ["  5  "],
    ],
  ),
  // Saved reports (owner, 2026-10-20).
  SAVED_REPORT_SECTIONS: rule(() => SAVED_REPORT_SECTIONS, [[]]),
  savedReportSections: rule(
    (raw: unknown) => savedReportSections(raw),
    [
      [null],
      [["x"]],
      [{ summary: " Hi ", findings: "  ", other: "x", next_steps: 4 }],
      [{ summary: "A", findings: "B", next_steps: "C" }],
    ],
  ),
  applySavedReport: rule(
    (sections: { key: string; title: string; text: string }[], saved: unknown) =>
      applySavedReport(sections, saved),
    [
      [
        [
          { key: "summary", title: "Summary", text: "We found a leak." },
          { key: "findings", title: "What we found", text: "" },
          { key: "next_steps", title: "What happens next", text: "Call us." },
        ],
        { summary: "No leak found.", findings: "Held pressure.", next_steps: "Call us." },
      ],
      [
        [
          { key: "summary", title: "Summary", text: "We found a leak." },
          { key: "findings", title: "What we found", text: "" },
          { key: "next_steps", title: "What happens next", text: "Call us." },
        ],
        {},
      ],
      [
        [
          { key: "summary", title: "Summary", text: "We found a leak." },
          { key: "findings", title: "What we found", text: "" },
          { key: "next_steps", title: "What happens next", text: "Call us." },
        ],
        { findings: "  Only this.  " },
      ],
      [[], { summary: "x" }],
    ],
  ),
  replaceSavedReportQuestion: rule(
    (titles: string[]) => replaceSavedReportQuestion(titles),
    [[[]], [["Summary"]], [["Summary", "What we found"]], [["A", "B", "C"]]],
  ),
  savedReportFrom: rule(
    (sections: { key: string; title: string; text: string }[]) => savedReportFrom(sections),
    [
      [
        [
          { key: "summary", title: "Summary", text: "We found a leak." },
          { key: "findings", title: "What we found", text: "" },
          { key: "next_steps", title: "What happens next", text: "Call us." },
        ],
      ],
      [[]],
    ],
  ),

  JOB_TYPE_LABELS: rule(() => JOB_TYPE_LABELS, [[]]),
  reportTitle: rule(
    (t: string | null) => reportTitle(t),
    [["inspection"], ["detection"], ["repair"], ["maintenance"], [null], ["Inspection"]],
  ),
  reportShareText: rule(
    (shop: string, link: string, withQuote?: boolean, jobType?: string | null) =>
      reportShareText(shop, link, withQuote, jobType),
    [
      ["Blue Pools", "https://x.co/r/abc"],
      ["Blue Pools", "https://x.co/r/abc", true],
      ["Blue Pools", "https://x.co/r/abc", false, "inspection"],
      ["Blue Pools", "https://x.co/r/abc", true, "inspection"],
      ["Blue Pools", "https://x.co/r/abc", false, "detection"],
      ["Blue Pools", "https://x.co/r/abc", false, "repair"],
      ["Blue Pools", "https://x.co/r/abc", true, "repair"],
      ["Blue Pools", "https://x.co/r/abc", false, null],
    ],
  ),
};
