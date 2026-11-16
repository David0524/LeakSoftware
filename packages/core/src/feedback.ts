// Customer feedback (owner's competitor notes, 2026-11-16; docs/design/
// 2026-11-16-feedback-and-text-reminders.md): "How did we do?" on a customer's report page and in
// the review request email. A thumbs up goes on to the shop's Google review; a thumbs down is a
// private complaint the office works (Feedback: Open, Closed, Thumbs Up). The words live here so
// the website, both apps and the customer's page say the same thing.

export type FeedbackRating = "up" | "down";
export type FeedbackStatus = "open" | "closed";

/** One answer, as public.feedback_list returns it. */
export interface FeedbackRow {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  job_id: string | null;
  job_number: number | null;
  rating: FeedbackRating;
  comment: string | null;
  status: FeedbackStatus;
  office_note: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  created_at: string;
}

export interface FeedbackList {
  open_count: number;
  rows: FeedbackRow[];
}

export type FeedbackFilter = "open" | "closed" | "up";

/** The Feedback list's segments. */
export const FEEDBACK_FILTERS: { value: FeedbackFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "up", label: "Thumbs Up" },
];

/** The rows a segment shows, in the order the database gave (open first, newest first). */
export function feedbackFilter(rows: FeedbackRow[], filter: FeedbackFilter): FeedbackRow[] {
  return rows.filter((r) =>
    filter === "up"
      ? r.rating === "up"
      : r.rating === "down" && r.status === (filter === "open" ? "open" : "closed"),
  );
}

export const FEEDBACK_TITLE = "Customer Feedback";

export const FEEDBACK_EMPTY: Record<FeedbackFilter, string> = {
  open: "No open complaints.",
  closed: "No closed complaints yet.",
  up: "No thumbs up yet.",
};

export const FEEDBACK_OFFLINE = "No connection. Connect to see customer feedback.";

/** "No open complaints", "1 open complaint", "3 open complaints". */
export function feedbackOpenLabel(open: number): string {
  return open <= 0
    ? "No open complaints"
    : open === 1
      ? "1 open complaint"
      : `${open} open complaints`;
}

/** The line under a row's name: "Job #1042 · Nov 16" (`when` is the platform's short date). */
export function feedbackSubtitle(row: Pick<FeedbackRow, "job_number">, when: string): string {
  return [row.job_number ? `Job #${row.job_number}` : null, when].filter(Boolean).join(" · ");
}

/** What the office note box and the buttons say. */
export const FEEDBACK_WORDS = {
  close: "Close",
  reopen: "Reopen",
  noteLabel: "Note",
  notePlaceholder: "What was done about it?",
  noComment: "No comment left.",
  thumbsUp: "Thumbs up",
  customerSection: "Feedback",
  seeAll: "See All Feedback",
  settingTitle: "Ask How We Did First",
  settingHint:
    "The review request asks “How did we do?” first. A thumbs up goes on to your Google review; a thumbs down is a private message to you. Customers with an open complaint get no review requests.",
} as const;

/** The customer's card (website only): the same words on the report page and /f/<link>. */
export const FEEDBACK_CARD = {
  title: "How did we do?",
  up: "Thumbs up",
  down: "Thumbs down",
  upThanks: "Thank you! We’re glad you’re happy.",
  upAsk: "A short Google review helps other pool owners find us.",
  reviewButton: "Leave a Google Review",
  downPrompt: "What went wrong?",
  downHint: "This goes privately to the shop, not online.",
  send: "Send",
  downThanks: (shop: string) => `Thank you for telling us. ${shop} will be in touch.`,
  failed: "That didn’t go through. Try again.",
} as const;

/** A thumbs down reaches the owners and admins: "Rebecca Soto: The pool is still green." */
export function feedbackNotification(
  customer: string,
  comment: string | null,
): { title: string; body: string } {
  const text = (comment ?? "").trim().replace(/\s+/g, " ");
  const short = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  return {
    title: "Customer complaint",
    body: short ? `${customer}: ${short}` : `${customer} gave a thumbs down.`,
  };
}
