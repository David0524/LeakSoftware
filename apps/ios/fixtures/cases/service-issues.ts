import {
  ISSUE_FILTERS,
  ISSUE_STATUS_LABELS,
  ISSUE_TEXT,
  ISSUE_WORK_LABELS,
  issueActions,
  issueDescriptionError,
  issueDetailLine,
  issueList,
  issueNoteError,
  issueTitle,
  issueWorkOptions,
  issuesEmpty,
  issuesSegmentLabel,
  openIssueCount,
  type IssueFilter,
  type IssueStatus,
  type IssueWork,
  type Services,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// service-issues.ts: issues reported on a visit (docs/design/2026-11-16-service-issues.md).
const issues = [
  { id: "a", status: "open", reported_by: "tech", reported_at: "2026-11-14T10:00:00Z" },
  { id: "b", status: "resolved", reported_by: "tech", reported_at: "2026-11-15T10:00:00Z" },
  { id: "c", status: "open", reported_by: "other", reported_at: "2026-11-16T10:00:00Z" },
  { id: "d", status: "converted", reported_by: "other", reported_at: "2026-11-13T10:00:00Z" },
  { id: "f", status: "open", reported_by: "other", reported_at: "2026-11-16T10:00:00Z" },
  {
    id: "e",
    status: "open",
    reported_by: "tech",
    reported_at: "2026-11-16T11:00:00Z",
    deleted_at: "2026-11-16T12:00:00Z",
  },
].map((i) => ({ ...i, description: `Issue ${i.id}`, status: i.status as IssueStatus }));

const viewers: [string, string | null][] = [
  ["owner", "owner"],
  ["admin", "admin"],
  ["tech", "tech"],
  ["tech", null],
];

export const serviceIssues: ModuleCases = {
  ISSUE_TEXT: rule(() => ISSUE_TEXT, [[]]),
  ISSUE_STATUS_LABELS: rule(() => ISSUE_STATUS_LABELS, [[]]),
  ISSUE_WORK_LABELS: rule(() => ISSUE_WORK_LABELS, [[]]),
  ISSUE_FILTERS: rule(() => ISSUE_FILTERS, [[]]),
  issueWorkOptions: rule((s: Services) => issueWorkOptions(s), [["pool"], ["leak"], ["both"]]),
  issueDescriptionError: rule(
    (t: string) => issueDescriptionError(t),
    [
      [""],
      ["  \n "],
      ["Pump leaking"],
      ["x".repeat(2000)],
      ["x".repeat(2001)],
      [" é ".repeat(700)],
    ],
  ),
  issueNoteError: rule(
    (t: string) => issueNoteError(t),
    [[""], ["x".repeat(1000)], ["x".repeat(1001)]],
  ),
  issueActions: rule(
    (status: IssueStatus, role: string | null, services: Services) =>
      issueActions({ status }, role, services),
    (["open", "resolved", "converted"] as const).flatMap((s) =>
      (["owner", "admin", "tech", null] as const).flatMap((r) =>
        (["pool", "both"] as const).map((v) => [s, r, v] as [IssueStatus, string | null, Services]),
      ),
    ),
  ),
  issueList: rule(
    (filter: IssueFilter, userId: string, role: string | null) =>
      issueList(issues, filter, { userId, role }).map((i) => i.id),
    (["open", "resolved", "all"] as const).flatMap((f) =>
      viewers.map(([u, r]) => [f, u, r] as [IssueFilter, string, string | null]),
    ),
  ),
  openIssueCount: rule(
    (userId: string, role: string | null) => openIssueCount(issues, { userId, role }),
    viewers,
  ),
  issuesSegmentLabel: rule((n: number) => issuesSegmentLabel(n), [[0], [1], [12]]),
  issuesEmpty: rule(
    (f: IssueFilter, manages: boolean) => issuesEmpty(f, manages),
    (["open", "resolved", "all"] as const).flatMap((f) =>
      [true, false].map((m) => [f, m] as [IssueFilter, boolean]),
    ),
  ),
  issueDetailLine: rule(
    (suggested: IssueWork | null, reporter: string | null, reportedOn: string) =>
      issueDetailLine({ suggested, reporter, reportedOn }),
    [
      ["repair", "Sam Ortiz", "Nov 16"],
      ["detection", null, "Nov 16"],
      [null, "Sam Ortiz", "Today"],
      [null, null, "Nov 16"],
    ],
  ),
  issueTitle: rule(
    (d: string, max?: number) => issueTitle(d, max),
    [
      ["  Cracked skimmer throat  "],
      ["Pump leaking\r\nat the seal"],
      ["First line\nsecond line"],
      ["x".repeat(100)],
      ["The heater makes a loud bang when it lights and then shuts off", 20],
      ["word word word word", 10],
    ],
  ),
};
