import { endOfDay, type EndOfDayStop } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// end-of-day.ts (owner, 2026-10-26): Today's wrap-up line once every stop is done.

const TZ = "America/New_York";
const TODAY = "2026-10-26";
const done = (id: string): EndOfDayStop => ({ id, done: true });
const open = (id: string): EndOfDayStop => ({ id, done: false });
const reports = [
  { job_id: "a", sent_at: "2026-10-26T14:00:00Z", status: "sent" },
  { job_id: "a", sent_at: "2026-10-26T15:00:00.000Z", status: "sent" },
  { job_id: "b", sent_at: "2026-10-26T16:00:00Z", status: "superseded" },
  { job_id: "c", sent_at: null, status: "draft" },
  { job_id: "c", sent_at: "2026-10-26T17:00:00Z", status: "draft" },
  { job_id: "x", sent_at: "2026-10-26T14:00:00Z", status: "sent" },
  { job_id: "c", sent_at: "2026-10-25T14:00:00Z", status: "sent" },
  { job_id: "d", sent_at: "2026-10-27T03:30:00Z", status: "sent" },
];
const quotes = [
  { job_id: "a", accepted_at: "2026-10-26T18:00:00Z" },
  { job_id: "c", accepted_at: "2026-10-26T19:00:00+00:00" },
  { job_id: "b", accepted_at: null },
  { job_id: "x", accepted_at: "2026-10-26T18:00:00Z" },
  { job_id: "a", accepted_at: "2026-10-25T18:00:00Z" },
];

export const endOfDayCases: ModuleCases = {
  endOfDay: rule(
    (
      stops: EndOfDayStop[],
      reports: { job_id: string; sent_at?: string | null; status?: string | null }[],
      quotes: { job_id: string; accepted_at?: string | null }[],
      today: string,
      timeZone: string,
    ) => endOfDay({ stops, reports, quotes, today, timeZone }),
    [
      [[], [], [], TODAY, TZ],
      [[done("a"), open("b")], reports, quotes, TODAY, TZ],
      [[done("a")], [], [], TODAY, TZ],
      [[done("a"), done("b"), done("c"), done("d")], reports, quotes, TODAY, TZ],
      [[done("a"), done("b"), done("c"), done("d")], reports, quotes, TODAY, "UTC"],
      [[done("a"), done("b")], reports, [], TODAY, TZ],
      [[done("a"), done("b")], [], quotes, TODAY, TZ],
      [[done("a")], [{ job_id: "a", sent_at: "not a date", status: "sent" }], [], TODAY, TZ],
      [[done("a")], reports, quotes, "2026-10-25", TZ],
    ],
  ),
};
