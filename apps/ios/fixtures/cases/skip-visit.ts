import {
  SKIP_BANNER,
  SKIP_DISMISS_LABEL,
  SKIP_NOTE_MAX,
  SKIP_REASON_REQUIRED,
  SKIP_RESCHEDULE_LABEL,
  SKIP_TEXT_LABEL,
  SKIP_UNDO_LABEL,
  SKIP_UNFINISHED_HINT,
  SKIP_UNFINISHED_LABEL,
  SKIP_VISIT_LABEL,
  NOT_DONE_REASON,
  autoSkipNotification,
  canSkipVisit,
  pickableSkipReasons,
  skipActions,
  skipBadge,
  skipCustomerText,
  skipNeedsOffice,
  skipNotification,
  skipSummary,
  skipValues,
  skipsUnfinishedVisits,
  statusAfterMove,
  JOB_STATUSES,
  type SkipReason,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

type Job = { type?: string; status: string; skip_handled_at?: string | null };

const jobs: Job[] = [
  ...["maintenance", "detection", "repair", "inspection"].flatMap((type) =>
    JOB_STATUSES.map((status) => ({ type, status })),
  ),
  { status: "scheduled" },
  { type: "maintenance", status: "skipped", skip_handled_at: "2026-11-16T16:00:00Z" },
  { type: "maintenance", status: "skipped", skip_handled_at: null },
];

// skip-visit.ts: Skip a Visit for maintenance visits (owner, 2026-11-16).
export const skipVisit: ModuleCases = {
  SKIP_TEXTS: rule(
    () => ({
      SKIP_VISIT_LABEL,
      SKIP_UNDO_LABEL,
      SKIP_DISMISS_LABEL,
      SKIP_RESCHEDULE_LABEL,
      SKIP_TEXT_LABEL,
      SKIP_NOTE_MAX,
      NOT_DONE_REASON,
      SKIP_BANNER,
      SKIP_REASON_REQUIRED,
      SKIP_UNFINISHED_LABEL,
      SKIP_UNFINISHED_HINT,
    }),
    [[]],
  ),
  pickableSkipReasons: rule(
    (rows: SkipReason[]) => pickableSkipReasons(rows),
    [
      [[]],
      [
        [
          { id: "a", label: "Weather", sort_order: 40, active: true },
          { id: "b", label: "Locked Gate", sort_order: 10, active: true },
          { id: "c", label: "Not Done", sort_order: 900, active: true, system: true },
          {
            id: "d",
            label: "Old",
            sort_order: 20,
            active: true,
            deleted_at: "2026-11-01T00:00:00Z",
          },
          { id: "e", label: "Off", sort_order: 30, active: false },
          { id: "f", label: "Dog in Yard", sort_order: 10, active: true },
        ],
      ],
    ],
  ),
  canSkipVisit: rule(
    (job: Job) => canSkipVisit(job),
    jobs.map((j) => [j] as [Job]),
  ),
  skipValues: rule(
    (reason: string, note: string | null | undefined, at: string) =>
      skipValues({ reason, note, at }),
    [
      [" Dog in Yard ", "  Two big dogs ", "2026-11-16T15:05:00Z"],
      ["Weather", "   ", "2026-11-16T15:05:00Z"],
      ["Weather", null, "2026-11-16T15:05:00Z"],
      ["Weather", "a".repeat(2000), "2026-11-16T15:05:00Z"],
    ],
  ),
  skipNeedsOffice: rule(
    (job: Job) => skipNeedsOffice(job),
    jobs.map((j) => [j] as [Job]),
  ),
  skipBadge: rule(
    (job: Job) => skipBadge(job),
    jobs.map((j) => [j] as [Job]),
  ),
  skipActions: rule(
    (job: Job, manager: boolean) => skipActions(job, manager),
    jobs.flatMap((j) => [true, false].map((m) => [j, m] as [Job, boolean])),
  ),
  skipCustomerText: rule(
    (customer: string | null, tech: string, shop: string, reason: string) =>
      skipCustomerText({ customer, tech, shop, reason }),
    [
      ["Rebecca Soto", "Alex Kim", "Blue Pools.", "Dog in Yard"],
      [null, "Alex", "Blue", "Weather"],
      ["", "Alex", "Blue", "  Pool Covered or Closed "],
    ],
  ),
  skipNotification: rule(
    (customer: string, reason: string, by: string | null) =>
      skipNotification({ customer, reason, by }),
    [
      ["Soto", "Locked Gate", "Alex"],
      ["Soto", "Weather", null],
    ],
  ),
  autoSkipNotification: rule((count: number) => autoSkipNotification(count), [[1], [3]]),
  skipsUnfinishedVisits: rule(
    (settings: unknown) => skipsUnfinishedVisits(settings),
    [[{}], [null], [{ skip_unfinished_visits: false }], [{ skip_unfinished_visits: true }]],
  ),
  skipSummary: rule(
    (
      job: { skip_reason?: string | null; skipped_at?: string | null },
      by: string | null,
      when: string | null,
    ) => skipSummary(job, by, when),
    [
      [{ skip_reason: "Dog in Yard", skipped_at: "x" }, "Alex", "Nov 16, 9:05 AM"],
      [{ skip_reason: "Not Done" }, null, "Nov 16"],
      [{ skip_reason: "Weather" }, null, null],
      [{}, "Alex", null],
    ],
  ),
  statusAfterMove: rule(
    (status: string) => statusAfterMove(status),
    [...JOB_STATUSES, "bogus"].map((s) => [s] as [string]),
  ),
};
