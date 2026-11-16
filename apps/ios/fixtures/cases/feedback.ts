import {
  FEEDBACK_EMPTY,
  FEEDBACK_FILTERS,
  FEEDBACK_OFFLINE,
  FEEDBACK_TITLE,
  FEEDBACK_WORDS,
  REMINDER_CHANNELS,
  REMINDER_CHANNEL_HINT,
  askFeedbackFirst,
  feedbackFilter,
  feedbackNotification,
  feedbackOpenLabel,
  feedbackSubtitle,
  reminderChannel,
  type FeedbackFilter,
  type FeedbackRow,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// feedback.ts and the reminder channel in followups.ts (owner's competitor notes, 2026-11-16):
// Customer Feedback's words and the Text Reminders setting.
const row = (id: string, rating: "up" | "down", status: "open" | "closed"): FeedbackRow => ({
  id,
  customer_id: "c",
  customer_name: "Rebecca Soto",
  job_id: "j",
  job_number: 1042,
  rating,
  comment: rating === "down" ? "The pool is still green." : null,
  status,
  office_note: null,
  closed_at: status === "closed" ? "2026-11-16T18:00:00Z" : null,
  closed_by_name: null,
  created_at: "2026-11-16T17:00:00Z",
});
const rows = [
  row("a", "down", "open"),
  row("b", "down", "closed"),
  row("c", "up", "closed"),
  row("d", "down", "open"),
];
const filters: FeedbackFilter[] = ["open", "closed", "up"];

export const feedback: ModuleCases = {
  FEEDBACK_FILTERS: rule(() => FEEDBACK_FILTERS, [[]]),
  feedbackWords: rule(
    () => ({
      FEEDBACK_TITLE,
      FEEDBACK_EMPTY,
      FEEDBACK_OFFLINE,
      FEEDBACK_WORDS,
      REMINDER_CHANNELS,
      REMINDER_CHANNEL_HINT,
    }),
    [[]],
  ),
  feedbackFilter: rule(
    (rs: FeedbackRow[], f: FeedbackFilter) => feedbackFilter(rs, f).map((r) => r.id),
    [...filters.map((f) => [rows, f] as [FeedbackRow[], FeedbackFilter]), [[], "open"]],
  ),
  feedbackOpenLabel: rule((n: number) => feedbackOpenLabel(n), [[0], [1], [2], [37], [-1]]),
  feedbackSubtitle: rule(
    (job: number | null, when: string) => feedbackSubtitle({ job_number: job }, when),
    [
      [1042, "Nov 16"],
      [null, "Nov 16"],
      [0, "Nov 16"],
    ],
  ),
  feedbackNotification: rule(
    (customer: string, comment: string | null) => feedbackNotification(customer, comment),
    [
      ["Rebecca Soto", "The pool is still green."],
      ["Rebecca Soto", "  Late\n and   rude "],
      ["Rebecca Soto", null],
      ["Rebecca Soto", "   "],
      ["Rebecca Soto", "x".repeat(200)],
      ["Rebecca Soto", "x".repeat(140)],
      ["Rebecca Soto", "x".repeat(141)],
    ],
  ),
  reminderChannel: rule(
    (settings: unknown) => reminderChannel(settings),
    [
      [null],
      [{}],
      [{ reminders: {} }],
      [{ reminders: { channel: "text" } }],
      [{ reminders: { channel: "both" } }],
      [{ reminders: { channel: "email" } }],
      [{ reminders: { channel: "carrier pigeon" } }],
      [{ reminders: { channel: 3 } }],
    ],
  ),
  askFeedbackFirst: rule(
    (settings: unknown) => askFeedbackFirst(settings),
    [
      [null],
      [{}],
      [{ ask_feedback_first: true }],
      [{ ask_feedback_first: false }],
      [{ ask_feedback_first: "false" }],
    ],
  ),
};
