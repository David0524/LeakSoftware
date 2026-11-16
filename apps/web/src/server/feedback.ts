import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./admin";
import { notifyFeedback } from "./notify-events";

// "How did we do?" (owner's competitor notes, 2026-11-16; docs/design/
// 2026-11-16-feedback-and-text-reminders.md): a customer's thumbs up or down from their link, no
// sign-in. Written with the service role through the database's own functions, which check the
// link; the office reads it through feedback_list.

export interface FeedbackCardInfo {
  company_id: string;
  company: string;
  job_id: string;
  review_url: string | null;
  /** The shop's "Ask How We Did First" setting. */
  enabled: boolean;
}

/** What the card needs for a customer link, or null when the link or the server can't take one. */
export async function feedbackCard(
  token: string,
  db: SupabaseClient | null = adminClient(),
): Promise<FeedbackCardInfo | null> {
  if (!db) return null;
  const { data } = await db.rpc("feedback_for_token", { link_token: token });
  return (data as FeedbackCardInfo | null) ?? null;
}

export type FeedbackResult = { ok: true; review_url: string | null } | { ok: false; error: string };

export const FEEDBACK_FAILED = "That didn’t go through. Try again.";
const COMMENT_TOO_LONG = "Keep it under 2,000 characters.";

/**
 * Record an answer. A thumbs down is a private complaint the shop's owners and admins hear about
 * (once: a repeat of the same words records nothing new).
 */
export async function recordFeedback(
  token: string,
  rating: unknown,
  comment: unknown,
  db: SupabaseClient | null = adminClient(),
): Promise<FeedbackResult> {
  if (!db || (rating !== "up" && rating !== "down")) return { ok: false, error: FEEDBACK_FAILED };
  const words = typeof comment === "string" ? comment.trim() : "";
  if (words.length > 2000) return { ok: false, error: COMMENT_TOO_LONG };
  const { data, error } = await db.rpc("submit_feedback", {
    link_token: token,
    new_rating: rating,
    new_comment: rating === "down" ? words : null,
  });
  if (error || !data) return { ok: false, error: FEEDBACK_FAILED };
  const r = data as {
    company_id: string;
    job_id: string;
    customer_name: string | null;
    review_url: string | null;
    made: boolean;
  };
  if (rating === "down" && r.made)
    await notifyFeedback(db, {
      companyId: r.company_id,
      jobId: r.job_id,
      customer: r.customer_name?.trim() || "A customer",
      comment: words,
    });
  return { ok: true, review_url: rating === "up" ? r.review_url : null };
}
