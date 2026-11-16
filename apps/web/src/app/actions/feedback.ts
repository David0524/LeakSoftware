"use server";

import { recordFeedback, type FeedbackResult } from "@/server/feedback";

/** The customer's thumbs up or down from their link (no sign-in; the link is the key). */
export async function sendFeedback(
  token: string,
  rating: "up" | "down",
  comment?: string,
): Promise<FeedbackResult> {
  return recordFeedback(String(token ?? ""), rating, comment);
}
