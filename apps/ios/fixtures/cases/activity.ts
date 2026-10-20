import {
  ACTIVITY_DASHBOARD_COUNT,
  ACTIVITY_DETAIL,
  ACTIVITY_EMPTY,
  ACTIVITY_OFFLINE,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_TITLE,
  activityDay,
  activityRow,
  activityTime,
  firstName,
  groupActivity,
  movedTo,
  type ActivityEvent,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const tz = "America/Phoenix";
// Tue Oct 20, 10:00 AM in Phoenix.
const now = "2026-10-20T17:00:00Z";

const base: ActivityEvent = {
  id: "e1",
  kind: "report_sent",
  created_at: "2026-10-20T16:42:00Z",
  job_id: "j1",
  conversation_id: null,
  customer_name: "Maria Alvarez",
  job_number: 1038,
  amount_cents: null,
  scheduled_at: null,
  preview: null,
  actor_name: null,
  assignee_name: null,
};

const events: ActivityEvent[] = [
  { ...base, kind: "quote_accepted", amount_cents: 97500 },
  { ...base, kind: "quote_accepted", amount_cents: null },
  { ...base, kind: "payment_received", amount_cents: 48750 },
  { ...base, kind: "payment_received", amount_cents: 123456789 },
  { ...base, kind: "report_signed" },
  { ...base, kind: "report_sent" },
  { ...base, kind: "report_sent", customer_name: null },
  { ...base, kind: "report_sent", customer_name: "   " },
  { ...base, kind: "job_completed", actor_name: "Tony Reyes" },
  { ...base, kind: "job_completed", actor_name: "tony@example.com" },
  { ...base, kind: "job_completed", actor_name: " " },
  { ...base, kind: "job_assigned", assignee_name: "Tony Reyes" },
  { ...base, kind: "job_assigned", assignee_name: null },
  { ...base, kind: "job_assigned", assignee_name: "Tony", job_number: null },
  { ...base, kind: "job_moved", scheduled_at: "2026-10-20T16:30:00Z" },
  { ...base, kind: "job_moved", scheduled_at: "2026-10-26T23:30:00Z" },
  { ...base, kind: "job_moved", scheduled_at: "2026-10-27T16:30:00Z" },
  { ...base, kind: "job_moved", scheduled_at: "2027-02-01T16:30:00Z" },
  { ...base, kind: "job_moved", scheduled_at: "2026-10-14T16:30:00Z" },
  { ...base, kind: "job_moved", scheduled_at: null },
  {
    ...base,
    kind: "text_received",
    job_id: null,
    conversation_id: "c1",
    preview: "Is Tony on the way?",
  },
  { ...base, kind: "text_received", job_id: null, conversation_id: "c1", preview: null },
  { ...base, kind: "text_received", job_id: null, conversation_id: "c1", preview: "  " },
  {
    ...base,
    kind: "text_received",
    job_id: null,
    conversation_id: null,
    customer_name: "+16025550199",
  },
  { ...base, kind: "job_completed", job_id: null },
  { ...base, kind: "something_new" },
  { ...base, created_at: "2026-10-19T16:42:00Z" },
  { ...base, created_at: "2026-10-14T16:42:00Z" },
  { ...base, created_at: "2025-10-14T16:42:00Z" },
  { ...base, created_at: "2026-10-20T06:59:00Z" },
  { ...base, created_at: "2026-10-20T07:00:00Z" },
];

const instants = [
  "2026-10-20T16:42:00Z",
  "2026-10-20T07:00:00Z",
  "2026-10-20T06:59:00Z",
  "2026-10-19T07:00:00Z",
  "2026-10-14T16:42:00Z",
  "2026-01-01T07:00:00Z",
  "2025-12-31T16:00:00Z",
];

// activity.ts: the Activity list's rows, times, and day headers.
export const activity: ModuleCases = {
  constants: rule(
    () => ({
      ACTIVITY_TITLE,
      ACTIVITY_PAGE_SIZE,
      ACTIVITY_DASHBOARD_COUNT,
      ACTIVITY_OFFLINE,
      ACTIVITY_EMPTY,
      ACTIVITY_DETAIL,
    }),
    [[]],
  ),
  firstName: rule(
    (n: string | null) => firstName(n),
    [["Tony Reyes"], ["  Maria  Alvarez "], [""], [null], ["Cher"]],
  ),
  activityTime: rule(
    (iso: string, at: string, zone: string) => activityTime(iso, new Date(at), zone),
    [
      ...instants.map((i) => [i, now, tz] as [string, string, string]),
      ["2026-10-20T16:42:00Z", now, "Asia/Tokyo"],
      ["2026-12-31T23:00:00Z", "2027-01-01T08:00:00Z", "UTC"],
    ],
  ),
  activityDay: rule(
    (iso: string, at: string, zone: string) => activityDay(iso, new Date(at), zone),
    [
      ...instants.map((i) => [i, now, tz] as [string, string, string]),
      ["2026-02-28T12:00:00Z", "2026-03-01T12:00:00Z", "UTC"],
      ["2024-02-28T12:00:00Z", "2024-03-01T12:00:00Z", "UTC"],
    ],
  ),
  movedTo: rule(
    (iso: string, at: string, zone: string) => movedTo(iso, new Date(at), zone),
    [
      ["2026-10-20T16:30:00Z", now, tz],
      ["2026-10-26T23:30:00Z", now, tz],
      ["2026-10-27T16:30:00Z", now, tz],
      ["2026-10-13T16:30:00Z", now, tz],
      ["2026-10-14T16:30:00Z", now, tz],
      ["2027-02-01T16:30:00Z", now, tz],
    ],
  ),
  activityRow: rule(
    (e: ActivityEvent, at: string, zone: string) => activityRow(e, at, zone),
    [
      ...events.map((e) => [e, now, tz] as [ActivityEvent, string, string]),
      [events[14]!, now, "Asia/Tokyo"],
    ],
  ),
  groupActivity: rule(
    (list: ActivityEvent[], at: string, zone: string) => groupActivity(list, at, zone),
    [
      [[], now, tz],
      [
        [
          { ...base, id: "a", created_at: "2026-10-20T16:00:00Z" },
          { ...base, id: "b", created_at: "2026-10-20T08:00:00Z" },
          { ...base, id: "c", created_at: "2026-10-20T06:00:00Z" },
          { ...base, id: "d", created_at: "2026-10-12T08:00:00Z" },
          { ...base, id: "e", created_at: "2025-10-12T08:00:00Z" },
        ],
        now,
        tz,
      ],
      [[{ ...base, id: "a", created_at: "2026-10-20T16:00:00Z" }], now, "Asia/Tokyo"],
    ],
  ),
};
