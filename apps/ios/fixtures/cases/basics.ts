import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  POOL_TYPE_LABELS,
  canMakeJobs,
  companyServices,
  formatCents,
  formatPhone,
  isManagerRole,
  newJobTypes,
  offersPool,
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
};
