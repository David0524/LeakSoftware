import { useCallback, useEffect, useState } from "react";
import { friendlyError, type FeedbackList } from "@leakbook/core";
import { getServices } from "../lib/services";

// Customer Feedback (owner's competitor notes, 2026-11-16), as the website's Feedback page: read
// from the server through the database's feedback_* functions (owners and admins only; row
// security gives anyone else nothing), like the Dashboard. Closing and reopening needs a
// connection too: the office's note and status are the server's.

export async function loadFeedback(companyId: string, customerId?: string): Promise<FeedbackList> {
  const { data, error } = await getServices().supabase.rpc("feedback_list", {
    target_company: companyId,
    target_customer: customerId ?? null,
  });
  if (error || !data) throw new Error(error?.message ?? "No data.");
  return data as FeedbackList;
}

/** Close or reopen a complaint with the office's note; throws the plain-words reason. */
export async function setFeedbackStatus(
  id: string,
  status: "open" | "closed",
  note: string,
): Promise<void> {
  const { error } = await getServices().supabase.rpc("set_feedback_status", {
    target_feedback: id,
    new_status: status,
    new_note: note,
  });
  if (error) throw new Error(friendlyError(error.message));
}

export type FeedbackLoad =
  { at: "loading" } | { at: "error" } | { at: "ready"; list: FeedbackList };

/** The shop's feedback (or one customer's), loaded when it opens and again on `reload`. */
export function useFeedback(companyId: string, customerId?: string) {
  const [load, setLoad] = useState<FeedbackLoad>({ at: "loading" });
  const reload = useCallback(async () => {
    try {
      setLoad({ at: "ready", list: await loadFeedback(companyId, customerId) });
    } catch {
      setLoad((had) => (had.at === "ready" ? had : { at: "error" }));
    }
  }, [companyId, customerId]);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);
  return { load, reload };
}

/** How many complaints are open (null until known, or when it can't be read). */
export function useOpenComplaints(companyId: string): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    getServices()
      .supabase.rpc("feedback_open_count", { target_company: companyId })
      .then(({ data, error }) => {
        if (live && !error && typeof data === "number") setN(data);
      });
    return () => {
      live = false;
    };
  }, [companyId]);
  return n;
}
