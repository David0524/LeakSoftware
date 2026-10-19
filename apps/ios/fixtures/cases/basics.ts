import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  POOL_TYPE_LABELS,
  canMakeJobs,
  companyServices,
  formatCents,
  formatPhone,
  isManagerRole,
  jobActionLabel,
  jobFeeLabel,
  jobOnPhones,
  newJobTypes,
  offersPool,
  parseGallons,
  requiresFinishPhoto,
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
    [["detection"], ["repair"], ["maintenance"], [null], [""], ["Detection"]],
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
};
