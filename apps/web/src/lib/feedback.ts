import "server-only";
import type { FeedbackList } from "@leakbook/core";
import { createClient } from "@/lib/supabase/server";

// Customer Feedback for the office (owner's competitor notes, 2026-11-16): owners and admins read
// it through the database's feedback_* functions (row security gives anyone else nothing).

/** The shop's feedback (or one customer's), open complaints first; null when it can't be read. */
export async function feedbackList(
  companyId: string,
  customerId?: string,
): Promise<FeedbackList | null> {
  const { data, error } = await (
    await createClient()
  ).rpc("feedback_list", { target_company: companyId, target_customer: customerId ?? null });
  return error || !data ? null : (data as FeedbackList);
}

/** How many complaints are open; null when it can't be read (before the database has it). */
export async function feedbackOpenCount(companyId: string): Promise<number | null> {
  const { data, error } = await (
    await createClient()
  ).rpc("feedback_open_count", { target_company: companyId });
  return error || typeof data !== "number" ? null : data;
}
